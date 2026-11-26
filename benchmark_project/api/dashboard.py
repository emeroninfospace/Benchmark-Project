# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

"""Data endpoints for the Accounting, Sales and Project dashboards.

Every query goes through ``frappe.get_list`` so role permissions, user
permissions and ``permission_query_conditions`` (e.g. the Task rules for
supervisors) are respected. Each dashboard section is computed independently:
a section whose doctype the user cannot read comes back as ``{"denied": 1}``
and the page shows a "no access" state for that card only.

Performance: sections share query results through a per-request memo (one
grouped query feeds several cards), and each full response is cached per user
and filter set for ``CACHE_TTL`` seconds. The refresh button bypasses the cache.
"""

from collections import OrderedDict

import frappe
from frappe import _
from frappe.utils import (
	add_days,
	add_months,
	cint,
	date_diff,
	flt,
	get_first_day,
	getdate,
	now_datetime,
	today,
)

OPEN_TASK_STATUSES = ("Open", "Working", "Pending Review", "Overdue")
WON_QUOTATION_STATUSES = ("Ordered", "Partially Ordered")
CACHE_TTL = 120  # seconds


# --------------------------------------------------------------------------- #
# Query helpers
# --------------------------------------------------------------------------- #


def _require_read(doctype):
	if not frappe.has_permission(doctype, "read"):
		raise frappe.PermissionError


def _sum(doctype, field, filters):
	_require_read(doctype)
	row = frappe.get_list(doctype, filters=filters, fields=[f"sum({field}) as total"])
	return flt(row[0].total) if row else 0.0


def _count(doctype, filters):
	_require_read(doctype)
	row = frappe.get_list(doctype, filters=filters, fields=["count(name) as total"])
	return cint(row[0].total) if row else 0


def _agg(doctype, group_field, aggregates, filters, order_by=None, limit=0):
	"""One grouped query with several aggregates.

	``aggregates`` maps alias -> SQL aggregate, e.g. ``{"amt": "sum(grand_total)"}``.
	Returns rows with ``grp`` (the group value) plus one key per alias.
	"""
	_require_read(doctype)
	fields = [f"`tab{doctype}`.`{group_field}` as grp"]
	fields += [f"{expr} as {alias}" for alias, expr in aggregates.items()]
	return frappe.get_list(
		doctype,
		filters=filters,
		fields=fields,
		group_by=f"`tab{doctype}`.`{group_field}`",
		order_by=order_by or f"{next(iter(aggregates))} desc",
		limit_page_length=limit,
	)


def _totals(doctype, aggregates, filters, group_field="company"):
	"""Several aggregates over all matching rows, in one query.

	Grouped on a field the filters pin (usually ``company``) so the query stays a
	plain GROUP BY; the rows are then summed.
	"""
	rows = _agg(doctype, group_field, aggregates, filters)
	return frappe._dict({alias: sum(flt(r.get(alias)) for r in rows) for alias in aggregates})


def _coverage(doctype, date_field, filters, label):
	"""How much data exists at all (count, first and last date), to explain an empty period."""
	rows = _agg(
		doctype,
		"company",
		{"n": "count(name)", "first": f"min({date_field})", "last": f"max({date_field})"},
		filters,
	)
	firsts = [r.first for r in rows if r.first]
	lasts = [r.last for r in rows if r.last]
	return {
		"label": label,
		"count": sum(cint(r.n) for r in rows),
		"first": getdate(min(firsts)) if firsts else None,
		"last": getdate(max(lasts)) if lasts else None,
	}


MIN_TREND_DAYS = 14


def _trend_frame(f):
	"""Time window and bucket size for trend charts, following the selected period.

	The window is the selected range (stretched back to at least two weeks so a
	"Today" view still draws a line). Buckets are days up to ~6 weeks, weeks up
	to ~6 months, months beyond. ``shift`` is the window length in days, used to
	line up the previous period bucket-for-bucket.
	"""
	end = getdate(f.to_date)
	start = getdate(f.from_date)
	if date_diff(end, start) + 1 < MIN_TREND_DAYS:
		start = getdate(add_days(end, -(MIN_TREND_DAYS - 1)))
	days = date_diff(end, start) + 1
	gran = "day" if days <= 45 else "week" if days <= 190 else "month"

	keys = []
	k = _bucket_key(start, gran)
	while k <= end:
		keys.append(k)
		k = _next_bucket(k, gran)
	buckets = [
		{"key": k, "start": max(k, start), "end": min(getdate(add_days(_next_bucket(k, gran), -1)), end)}
		for k in keys
	]
	return frappe._dict(start=start, end=end, granularity=gran, bucket_keys=keys, buckets=buckets, shift=days)


def _bucket_key(d, gran):
	d = getdate(d)
	if gran == "day":
		return d
	if gran == "week":
		return getdate(add_days(d, -d.weekday()))  # Monday
	return getdate(get_first_day(d))


def _next_bucket(k, gran):
	if gran == "day":
		return getdate(add_days(k, 1))
	if gran == "week":
		return getdate(add_days(k, 7))
	return getdate(add_months(k, 1))


def _series(frame, doctype, date_field, aggregates, filters, value, previous=False):
	"""Bucketed totals over the trend window (or the window just before it).

	Rows are grouped by day in SQL and folded into buckets here; ``value(row)``
	turns one row's aggregates into the number to add.
	"""
	shift = frame.shift if previous else 0
	start = getdate(add_days(frame.start, -shift))
	end = getdate(add_days(frame.end, -shift))
	totals = OrderedDict((k, 0.0) for k in frame.bucket_keys)
	rows = _agg(
		doctype, date_field, aggregates, [*filters, [date_field, "between", [start, end]]], order_by="grp asc"
	)
	for r in rows:
		if r.grp:
			key = _bucket_key(add_days(r.grp, shift), frame.granularity)
			if key in totals:
				totals[key] += value(r)
	return list(totals.values())


def _trend_payload(frame, series, prev=None):
	return {
		"granularity": frame.granularity,
		"from": frame.start,
		"to": frame.end,
		"buckets": frame.buckets,
		"series": series,
		"prev": prev,
	}


# --------------------------------------------------------------------------- #
# Request context, sections and caching
# --------------------------------------------------------------------------- #


class _Ctx:
	"""Filters for one request plus a memo so cards can share query results."""

	def __init__(self, f):
		self.f = f
		self._memo = {}

	def once(self, key, fn):
		if key not in self._memo:
			self._memo[key] = fn()
		return self._memo[key]


def _section(fn, ctx):
	"""Run one dashboard section; isolate permission errors to that section."""
	try:
		return fn(ctx)
	except frappe.PermissionError:
		# keep the "not permitted" popup from surfacing for a card we simply hide
		frappe.local.message_log = []
		return {"denied": 1}
	except Exception:
		# One broken card (e.g. a field missing on this ERPNext version) must not
		# take the whole dashboard down: log it and let the card show an error.
		frappe.local.message_log = []
		frappe.log_error(title=f"Benchmark dashboard: {fn.__name__}")
		return {"error": 1}


def _resolve_filters(company=None, from_date=None, to_date=None):
	company = company or frappe.defaults.get_user_default("Company")
	if not company:
		companies = frappe.get_list("Company", pluck="name", limit_page_length=1)
		company = companies[0] if companies else None

	to_date = getdate(to_date or today())
	from_date = getdate(from_date or get_first_day(to_date))
	if from_date > to_date:
		from_date, to_date = to_date, from_date

	span = date_diff(to_date, from_date)
	prev_to = add_days(from_date, -1)
	prev_from = add_days(prev_to, -span)

	currency = frappe.get_cached_value("Company", company, "default_currency") if company else None
	return frappe._dict(
		company=company,
		from_date=from_date,
		to_date=to_date,
		prev_from=getdate(prev_from),
		prev_to=getdate(prev_to),
		currency=currency or frappe.defaults.get_global_default("currency"),
	)


def _build(name, sections, company, from_date, to_date, refresh):
	f = _resolve_filters(company, from_date, to_date)
	key = f"benchmark_dashboard|{name}|{frappe.session.user}|{f.company}|{f.from_date}|{f.to_date}"
	cache = frappe.cache()

	if not cint(refresh):
		hit = cache.get_value(key)
		if hit:
			return hit

	ctx = _Ctx(f)
	data = {section: _section(fn, ctx) for section, fn in sections.items()}
	data["filters"] = f
	data["generated_at"] = now_datetime()
	if not any(isinstance(v, dict) and v.get("error") for v in data.values()):
		cache.set_value(key, data, expires_in_sec=CACHE_TTL)
	return data


@frappe.whitelist()
def get_filter_options():
	companies = frappe.get_list("Company", fields=["name", "default_currency"], order_by="name asc")
	default = frappe.defaults.get_user_default("Company")
	if default not in [c.name for c in companies]:
		default = companies[0].name if companies else None
	return {"companies": companies, "default_company": default, "fiscal_year": _fiscal_year(default)}


def _fiscal_year(company):
	"""Current fiscal year as {name, from, to}, or None if ERPNext has none set up."""
	try:
		from erpnext.accounts.utils import get_fiscal_year

		fy = get_fiscal_year(today(), company=company, as_dict=True)
		return {"name": fy.name, "from": fy.year_start_date, "to": fy.year_end_date}
	except Exception:
		frappe.local.message_log = []
		return None


# --------------------------------------------------------------------------- #
# Accounting
# --------------------------------------------------------------------------- #


def _acc_accounts(c):
	"""Leaf accounts of the company, sorted into income / expense / cash, in one query."""

	def load():
		rows = frappe.get_list(
			"Account",
			filters={"company": c.f.company},
			fields=["name", "account_name", "root_type", "account_type", "is_group", "lft", "rgt"],
			limit_page_length=0,
		)
		leaves = [r for r in rows if not r.is_group]
		# Bank accounts are often created under the "Bank Accounts" / "Cash In Hand"
		# groups without their own account type, so a leaf counts as cash when it
		# or any group above it is typed Cash or Bank.
		cash_groups = [(r.lft, r.rgt) for r in rows if r.is_group and r.account_type in ("Cash", "Bank")]
		return frappe._dict(
			income={r.name: r.account_name for r in leaves if r.root_type == "Income"},
			expense={r.name: r.account_name for r in leaves if r.root_type == "Expense"},
			cash=[
				r.name
				for r in leaves
				if r.account_type in ("Cash", "Bank") or any(lo < cint(r.lft) < hi for lo, hi in cash_groups)
			],
		)

	return c.once("accounts", load)


def _acc_gl_by_account(c, from_date, to_date):
	"""{account: debit - credit} for every account with postings in the range (one query)."""

	def load():
		rows = _agg(
			"GL Entry",
			"account",
			{"dr": "sum(debit)", "cr": "sum(credit)"},
			[
				["company", "=", c.f.company],
				["is_cancelled", "=", 0],
				["posting_date", "between", [from_date, to_date]],
			],
		)
		return {r.grp: flt(r.dr) - flt(r.cr) for r in rows}

	return c.once(("gl", from_date, to_date), load)


def _acc_pl(c, from_date, to_date):
	acc = _acc_accounts(c)
	net = _acc_gl_by_account(c, from_date, to_date)
	income = -sum(v for a, v in net.items() if a in acc.income)
	expense = sum(v for a, v in net.items() if a in acc.expense)
	return income, expense


def _acc_open_receivables(c):
	"""Open sales-invoice outstanding grouped by due date (feeds KPIs and aging)."""
	return c.once(
		"receivables",
		lambda: _agg(
			"Sales Invoice",
			"due_date",
			{"amt": "sum(outstanding_amount)"},
			[["company", "=", c.f.company], ["docstatus", "=", 1], ["outstanding_amount", ">", 0]],
			order_by="grp asc",
		),
	)


def _acc_kpis(c):
	f = c.f
	income, expense = _acc_pl(c, f.from_date, f.to_date)
	prev_income, prev_expense = _acc_pl(c, f.prev_from, f.prev_to)

	cash = 0.0
	cash_accounts = _acc_accounts(c).cash
	if cash_accounts:
		t = _totals(
			"GL Entry",
			{"dr": "sum(debit)", "cr": "sum(credit)"},
			[
				["company", "=", f.company],
				["is_cancelled", "=", 0],
				["account", "in", cash_accounts],
				["posting_date", "<=", f.to_date],
			],
		)
		cash = t.dr - t.cr

	now = getdate(today())
	open_si = _acc_open_receivables(c)
	receivable = sum(flt(r.amt) for r in open_si)
	overdue = sum(flt(r.amt) for r in open_si if r.grp and getdate(r.grp) < now)

	payable = _sum(
		"Purchase Invoice",
		"outstanding_amount",
		[["company", "=", f.company], ["docstatus", "=", 1], ["outstanding_amount", ">", 0]],
	)

	return {
		"income": income,
		"prev_income": prev_income,
		"expense": expense,
		"prev_expense": prev_expense,
		"net_profit": income - expense,
		"prev_net_profit": prev_income - prev_expense,
		"cash": cash,
		"receivable": receivable,
		"overdue_receivable": overdue,
		"payable": payable,
	}


def _acc_trend(c):
	f = c.f
	acc = _acc_accounts(c)
	frame = _trend_frame(f)
	base = [["company", "=", f.company], ["is_cancelled", "=", 0]]
	gl = {"dr": "sum(debit)", "cr": "sum(credit)"}
	zero = [0.0] * len(frame.bucket_keys)

	def credit_side(r):
		return flt(r.cr) - flt(r.dr)

	def debit_side(r):
		return flt(r.dr) - flt(r.cr)

	income = expense = prev_income = zero
	if acc.income:
		inc_filters = [*base, ["account", "in", list(acc.income)]]
		income = _series(frame, "GL Entry", "posting_date", gl, inc_filters, credit_side)
		prev_income = _series(frame, "GL Entry", "posting_date", gl, inc_filters, credit_side, previous=True)
	if acc.expense:
		expense = _series(
			frame, "GL Entry", "posting_date", gl, [*base, ["account", "in", list(acc.expense)]], debit_side
		)

	return _trend_payload(
		frame,
		[
			{"key": "income", "name": _("Income"), "values": income},
			{"key": "expense", "name": _("Expense"), "values": expense},
		],
		prev_income,
	)


def _acc_expense_breakdown(c):
	acc = _acc_accounts(c)
	net = _acc_gl_by_account(c, c.f.from_date, c.f.to_date)
	rows = sorted(
		((a, v) for a, v in net.items() if a in acc.expense and v > 0), key=lambda x: x[1], reverse=True
	)
	items = [{"label": acc.expense[a], "value": v, "account": a} for a, v in rows[:6]]
	rest = sum(v for _a, v in rows[6:])
	if rest:
		items.append({"label": _("Other"), "value": rest})
	return {"items": items}


def _acc_aging(c):
	labels = [_("Not due"), "1-30", "31-60", "61-90", "90+"]
	values = [0.0] * 5
	now = getdate(today())
	for r in _acc_open_receivables(c):
		age = date_diff(now, r.grp) if r.grp else 0
		idx = 0 if age <= 0 else 1 if age <= 30 else 2 if age <= 60 else 3 if age <= 90 else 4
		values[idx] += flt(r.amt)
	return {"buckets": [{"label": label, "value": v} for label, v in zip(labels, values, strict=True)]}


def _acc_top_debtors(c):
	rows = _agg(
		"Sales Invoice",
		"customer",
		{"amt": "sum(outstanding_amount)", "cname": "max(customer_name)"},
		[["company", "=", c.f.company], ["docstatus", "=", 1], ["outstanding_amount", ">", 0]],
		limit=6,
	)
	return {"items": [{"label": r.cname or r.grp, "value": flt(r.amt), "customer": r.grp} for r in rows]}


def _acc_overdue_invoices(c):
	_require_read("Sales Invoice")
	rows = frappe.get_list(
		"Sales Invoice",
		filters=[
			["company", "=", c.f.company],
			["docstatus", "=", 1],
			["outstanding_amount", ">", 0],
			["due_date", "<", today()],
		],
		fields=["name", "customer_name", "due_date", "outstanding_amount", "currency"],
		order_by="due_date asc",
		limit_page_length=8,
	)
	now = getdate(today())
	for r in rows:
		r.days_overdue = date_diff(now, r.due_date)
	return {"rows": rows}


def _acc_recent_payments(c):
	_require_read("Payment Entry")
	rows = frappe.get_list(
		"Payment Entry",
		filters=[["company", "=", c.f.company], ["docstatus", "=", 1]],
		fields=[
			"name",
			"payment_type",
			"party_name",
			"paid_amount",
			"base_paid_amount",
			"posting_date",
			"mode_of_payment",
		],
		order_by="posting_date desc, creation desc",
		limit_page_length=6,
	)
	return {"rows": rows}


def _acc_tax(c):
	f = c.f
	period = [
		["company", "=", f.company],
		["docstatus", "=", 1],
		["posting_date", "between", [f.from_date, f.to_date]],
	]
	output_tax = _sum("Sales Invoice", "base_total_taxes_and_charges", period)
	input_tax = _sum("Purchase Invoice", "base_total_taxes_and_charges", period)
	return {"output_tax": output_tax, "input_tax": input_tax, "net": output_tax - input_tax}


def _acc_expense_entries(c):
	f = c.f
	rows = _agg(
		"Expense Entry",
		"status",
		{"amt": "sum(grand_total)", "n": "count(name)"},
		[
			["company", "=", f.company],
			["docstatus", "=", 1],
			["posting_date", "between", [f.from_date, f.to_date]],
		],
	)
	paid = sum(flt(r.amt) for r in rows if r.grp == "Paid")
	unpaid_rows = [r for r in rows if r.grp != "Paid"]
	return {
		"paid": paid,
		"unpaid": sum(flt(r.amt) for r in unpaid_rows),
		"unpaid_count": sum(cint(r.n) for r in unpaid_rows),
	}


def _acc_coverage(c):
	return _coverage(
		"GL Entry",
		"posting_date",
		[["company", "=", c.f.company], ["is_cancelled", "=", 0]],
		_("ledger entries"),
	)


ACCOUNTING_SECTIONS = {
	"coverage": _acc_coverage,
	"kpis": _acc_kpis,
	"trend": _acc_trend,
	"expense_breakdown": _acc_expense_breakdown,
	"aging": _acc_aging,
	"top_debtors": _acc_top_debtors,
	"overdue_invoices": _acc_overdue_invoices,
	"recent_payments": _acc_recent_payments,
	"tax": _acc_tax,
	"expense_entries": _acc_expense_entries,
}


@frappe.whitelist()
def get_accounting_dashboard(company=None, from_date=None, to_date=None, refresh=0):
	return _build("accounting", ACCOUNTING_SECTIONS, company, from_date, to_date, refresh)


# --------------------------------------------------------------------------- #
# Sales
# --------------------------------------------------------------------------- #


def _sales_quotations(c):
	"""Submitted quotations in the period by status: value and count (feeds 3 cards)."""
	f = c.f
	return c.once(
		"quotations",
		lambda: _agg(
			"Quotation",
			"status",
			{"n": "count(name)", "amt": "sum(base_net_total)"},
			[
				["company", "=", f.company],
				["docstatus", "=", 1],
				["transaction_date", "between", [f.from_date, f.to_date]],
			],
		),
	)


def _sales_leads(c):
	"""Leads created in the period by status (feeds 3 cards)."""
	f = c.f
	return c.once(
		"leads",
		lambda: _agg(
			"Lead",
			"status",
			{"n": "count(name)"},
			[["creation", "between", [f.from_date, add_days(f.to_date, 1)]]],
		),
	)


def _sales_kpis(c):
	f = c.f

	def invoiced(frm, to):
		return _totals(
			"Sales Invoice",
			{"amt": "sum(base_net_total)", "n": "count(name)"},
			[["company", "=", f.company], ["docstatus", "=", 1], ["posting_date", "between", [frm, to]]],
		)

	cur = invoiced(f.from_date, f.to_date)
	prev = invoiced(f.prev_from, f.prev_to)

	quotes = _sales_quotations(c)
	quotations = sum(cint(r.n) for r in quotes)
	won = sum(cint(r.n) for r in quotes if r.grp in WON_QUOTATION_STATUSES)
	lost = sum(cint(r.n) for r in quotes if r.grp == "Lost")
	prev_quoted = _sum(
		"Quotation",
		"base_net_total",
		[
			["company", "=", f.company],
			["docstatus", "=", 1],
			["transaction_date", "between", [f.prev_from, f.prev_to]],
		],
	)

	invoices = cint(cur.n)
	return {
		"sales": cur.amt,
		"prev_sales": prev.amt,
		"invoices": invoices,
		"avg_invoice": cur.amt / invoices if invoices else 0,
		"quoted": sum(flt(r.amt) for r in quotes),
		"prev_quoted": prev_quoted,
		"quotations": quotations,
		"won": won,
		"lost": lost,
		"win_rate": (won * 100.0 / quotations) if quotations else 0,
		"leads": sum(cint(r.n) for r in _sales_leads(c)),
		"prev_leads": _count("Lead", [["creation", "between", [f.prev_from, add_days(f.prev_to, 1)]]]),
	}


def _sales_trend(c):
	f = c.f
	frame = _trend_frame(f)
	base = [["company", "=", f.company], ["docstatus", "=", 1]]
	amt = {"amt": "sum(base_net_total)"}

	def value(r):
		return flt(r.amt)

	invoiced = _series(frame, "Sales Invoice", "posting_date", amt, base, value)
	prev_invoiced = _series(frame, "Sales Invoice", "posting_date", amt, base, value, previous=True)
	quoted = _series(frame, "Quotation", "transaction_date", amt, base, value)
	return _trend_payload(
		frame,
		[
			{"key": "invoiced", "name": _("Invoiced"), "values": invoiced},
			{"key": "quoted", "name": _("Quoted"), "values": quoted},
		],
		prev_invoiced,
	)


def _sales_funnel(c):
	f = c.f
	quotes = _sales_quotations(c)
	stages = [
		{"label": _("Leads"), "doctype": "Lead", "value": sum(cint(r.n) for r in _sales_leads(c))},
		{
			"label": _("Site visits"),
			"doctype": "Site Visit",
			"value": _count(
				"Site Visit", [["docstatus", "=", 1], ["visit_date", "between", [f.from_date, f.to_date]]]
			),
		},
		{
			"label": _("Bills of quantity"),
			"doctype": "Bill of Quantity",
			"value": _count(
				"Bill of Quantity",
				[["docstatus", "=", 1], ["posting_date", "between", [f.from_date, f.to_date]]],
			),
		},
		{"label": _("Quotations"), "doctype": "Quotation", "value": sum(cint(r.n) for r in quotes)},
		{
			"label": _("Won"),
			"doctype": "Quotation",
			"value": sum(cint(r.n) for r in quotes if r.grp in WON_QUOTATION_STATUSES),
		},
	]
	return {"stages": stages}


def _sales_lead_status(c):
	rows = sorted(_sales_leads(c), key=lambda r: cint(r.n), reverse=True)
	return {"items": [{"label": r.grp or _("Not set"), "value": cint(r.n), "status": r.grp} for r in rows]}


def _sales_lead_source(c):
	f = c.f
	rows = _agg(
		"Lead",
		"source",
		{"n": "count(name)"},
		[["creation", "between", [f.from_date, add_days(f.to_date, 1)]]],
	)
	items = [{"label": r.grp or _("Not set"), "value": cint(r.n), "source": r.grp} for r in rows[:5]]
	rest = sum(cint(r.n) for r in rows[5:])
	if rest:
		items.append({"label": _("Other"), "value": rest})
	return {"items": items}


def _sales_quotation_status(c):
	order = ["Open", "Replied", "Partially Ordered", "Ordered", "Lost", "Expired", "Cancelled"]
	rows = sorted(_sales_quotations(c), key=lambda r: order.index(r.grp) if r.grp in order else len(order))
	return {"items": [{"label": _(r.grp), "value": cint(r.n), "status": r.grp} for r in rows]}


def _sales_top_customers(c):
	f = c.f
	rows = _agg(
		"Sales Invoice",
		"customer",
		{"amt": "sum(base_net_total)", "cname": "max(customer_name)"},
		[
			["company", "=", f.company],
			["docstatus", "=", 1],
			["posting_date", "between", [f.from_date, f.to_date]],
		],
		limit=6,
	)
	return {"items": [{"label": r.cname or r.grp, "value": flt(r.amt), "customer": r.grp} for r in rows]}


def _sales_recent_quotations(c):
	_require_read("Quotation")
	rows = frappe.get_list(
		"Quotation",
		filters=[["company", "=", c.f.company], ["docstatus", "<", 2]],
		fields=[
			"name",
			"customer_name",
			"party_name",
			"transaction_date",
			"base_grand_total",
			"status",
			"docstatus",
		],
		order_by="transaction_date desc, creation desc",
		limit_page_length=7,
	)
	return {"rows": rows}


def _sales_upcoming_visits(c):
	_require_read("Site Visit")
	rows = frappe.get_list(
		"Site Visit",
		filters=[["visit_date", ">=", today()], ["docstatus", "<", 2]],
		fields=["name", "lead_name", "visit_date", "site_location", "status"],
		order_by="visit_date asc",
		limit_page_length=6,
	)
	return {"rows": rows}


def _sales_coverage(c):
	return _coverage(
		"Sales Invoice",
		"posting_date",
		[["company", "=", c.f.company], ["docstatus", "=", 1]],
		_("submitted sales invoices"),
	)


SALES_SECTIONS = {
	"coverage": _sales_coverage,
	"kpis": _sales_kpis,
	"trend": _sales_trend,
	"funnel": _sales_funnel,
	"lead_status": _sales_lead_status,
	"lead_source": _sales_lead_source,
	"quotation_status": _sales_quotation_status,
	"top_customers": _sales_top_customers,
	"recent_quotations": _sales_recent_quotations,
	"upcoming_visits": _sales_upcoming_visits,
}


@frappe.whitelist()
def get_sales_dashboard(company=None, from_date=None, to_date=None, refresh=0):
	return _build("sales", SALES_SECTIONS, company, from_date, to_date, refresh)


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #


def _project_health(p, now):
	if p.status != "Open":
		return p.status
	end = getdate(p.expected_end_date) if p.expected_end_date else None
	if end and end < now:
		return "Overdue"
	start = getdate(p.expected_start_date) if p.expected_start_date else None
	if start and end and end > start:
		elapsed = max(0.0, min(100.0, date_diff(now, start) * 100.0 / date_diff(end, start)))
		if elapsed - flt(p.percent_complete) > 15:
			return "At risk"
	return "On track"


def _proj_open(c):
	"""All open projects of the company with health (feeds KPIs, list and health cards)."""

	def load():
		_require_read("Project")
		rows = frappe.get_list(
			"Project",
			filters=[["company", "=", c.f.company], ["status", "=", "Open"]],
			fields=[
				"name",
				"project_name",
				"customer",
				"status",
				"percent_complete",
				"expected_start_date",
				"expected_end_date",
				"estimated_costing",
				"total_billed_amount",
			],
			order_by="expected_end_date asc",
			limit_page_length=0,
		)
		now = getdate(today())
		for r in rows:
			r.health = _project_health(r, now)
		return rows

	return c.once("open_projects", load)


def _proj_task_status_rows(c):
	return c.once(
		"task_status",
		lambda: _agg(
			"Task",
			"status",
			{"n": "count(name)"},
			[["company", "=", c.f.company], ["status", "!=", "Template"]],
		),
	)


def _proj_kpis(c):
	f = c.f
	projects = _proj_open(c)
	active = len(projects)
	overdue = sum(1 for p in projects if p.health == "Overdue")
	avg_progress = sum(flt(p.percent_complete) for p in projects) / active if active else 0
	completed = _count(
		"Project",
		[
			["company", "=", f.company],
			["status", "=", "Completed"],
			["modified", "between", [f.from_date, add_days(f.to_date, 1)]],
		],
	)

	open_tasks = overdue_tasks = 0
	if frappe.has_permission("Task", "read"):
		open_tasks = sum(cint(r.n) for r in _proj_task_status_rows(c) if r.grp in OPEN_TASK_STATUSES)
		overdue_tasks = _count(
			"Task",
			[
				["company", "=", f.company],
				["status", "in", OPEN_TASK_STATUSES],
				["exp_end_date", "<", today()],
			],
		)

	return {
		"active": active,
		"overdue": overdue,
		"completed": completed,
		"avg_progress": avg_progress,
		"open_tasks": open_tasks,
		"overdue_tasks": overdue_tasks,
		"estimated": sum(flt(p.estimated_costing) for p in projects),
		"billed": sum(flt(p.total_billed_amount) for p in projects),
	}


def _proj_status(c):
	rows = _agg("Project", "status", {"n": "count(name)"}, [["company", "=", c.f.company]])
	order = ["Open", "Completed", "Cancelled"]
	rows.sort(key=lambda r: order.index(r.grp) if r.grp in order else len(order))
	return {"items": [{"label": _(r.grp), "value": cint(r.n), "status": r.grp} for r in rows]}


def _proj_list(c):
	rank = {"Overdue": 0, "At risk": 1, "On track": 2}
	rows = sorted(_proj_open(c), key=lambda r: (rank.get(r.health, 3), str(r.expected_end_date or "9999")))
	counts = {"On track": 0, "At risk": 0, "Overdue": 0}
	for r in rows:
		if r.health in counts:
			counts[r.health] += 1
	return {"rows": rows[:10], "total": len(rows), "health": counts}


def _proj_budget(c):
	rows = _agg(
		"Project Budget",
		"project",
		{"estimated": "sum(total_estimated_cost)", "actual": "sum(total_actual_cost)"},
		[["docstatus", "=", 1], ["project", "is", "set"]],
	)
	projects = (
		{
			p.name: p
			for p in frappe.get_all(
				"Project",
				filters={"name": ["in", [r.grp for r in rows]]},
				fields=["name", "project_name", "company"],
			)
		}
		if rows
		else {}
	)
	rows = [r for r in rows if r.grp in projects and projects[r.grp].company == c.f.company][:8]
	return {
		"items": [
			{
				"project": r.grp,
				"label": projects[r.grp].project_name or r.grp,
				"estimated": flt(r.estimated),
				"actual": flt(r.actual),
			}
			for r in rows
		]
	}


def _proj_task_status(c):
	order = ["Open", "Working", "Pending Review", "Overdue", "Completed", "Cancelled"]
	rows = sorted(
		_proj_task_status_rows(c), key=lambda r: order.index(r.grp) if r.grp in order else len(order)
	)
	return {"items": [{"label": _(r.grp), "value": cint(r.n), "status": r.grp} for r in rows]}


def _proj_due_tasks(c):
	_require_read("Task")
	rows = frappe.get_list(
		"Task",
		filters=[
			["company", "=", c.f.company],
			["status", "in", OPEN_TASK_STATUSES],
			["exp_end_date", "is", "set"],
			["exp_end_date", "<=", add_days(today(), 7)],
		],
		fields=["name", "subject", "project", "exp_end_date", "progress", "status", "priority"],
		order_by="exp_end_date asc",
		limit_page_length=8,
	)
	now = getdate(today())
	for r in rows:
		r.days_left = date_diff(r.exp_end_date, now)
	return {"rows": rows}


def _proj_trend(c):
	"""Tasks completed vs tasks falling due, per bucket of the selected period."""
	f = c.f
	frame = _trend_frame(f)
	n = {"n": "count(name)"}

	def value(r):
		return cint(r.n)

	done_filters = [["company", "=", f.company], ["status", "=", "Completed"]]
	completed = _series(frame, "Task", "completed_on", n, done_filters, value)
	prev_completed = _series(frame, "Task", "completed_on", n, done_filters, value, previous=True)
	due = _series(
		frame,
		"Task",
		"exp_end_date",
		n,
		[["company", "=", f.company], ["status", "not in", ["Cancelled", "Template"]]],
		value,
	)
	return _trend_payload(
		frame,
		[
			{"key": "completed", "name": _("Completed"), "values": completed},
			{"key": "due", "name": _("Due"), "values": due},
		],
		prev_completed,
	)


def _proj_subcontract(c):
	f = c.f
	period = [
		["company", "=", f.company],
		["docstatus", "=", 1],
		["transaction_date", "between", [f.from_date, f.to_date]],
	]
	orders = _totals("Subcontract Work Order", {"amt": "sum(base_grand_total)", "n": "count(name)"}, period)
	invoices = _totals(
		"Subcontract Invoice", {"amt": "sum(base_grand_total)", "paid": "sum(paid_amount)"}, period
	)
	return {"ordered": orders.amt, "orders": cint(orders.n), "invoiced": invoices.amt, "paid": invoices.paid}


def _proj_coverage(c):
	return _coverage("Project", "creation", [["company", "=", c.f.company]], _("projects"))


PROJECT_SECTIONS = {
	"coverage": _proj_coverage,
	"kpis": _proj_kpis,
	"status": _proj_status,
	"projects": _proj_list,
	"trend": _proj_trend,
	"budget": _proj_budget,
	"task_status": _proj_task_status,
	"due_tasks": _proj_due_tasks,
	"subcontract": _proj_subcontract,
}


@frappe.whitelist()
def get_project_dashboard(company=None, from_date=None, to_date=None, refresh=0):
	return _build("projects", PROJECT_SECTIONS, company, from_date, to_date, refresh)
