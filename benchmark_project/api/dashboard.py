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
	get_last_day,
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


def _month_buckets(end_date, months=12):
	"""OrderedDict of 'YYYY-MM' -> 0 for the ``months`` months ending at ``end_date``."""
	end = get_first_day(end_date)
	buckets = OrderedDict()
	for i in range(months - 1, -1, -1):
		buckets[getdate(add_months(end, -i)).strftime("%Y-%m")] = 0.0
	return buckets


def _monthly(doctype, date_field, aggregates, filters, end_date, value):
	"""Per-month totals for the 12 months ending at ``end_date``.

	Rows are grouped by day in SQL and folded into months here; ``value(row)``
	turns one row's aggregates into the number to add.
	"""
	buckets = _month_buckets(end_date)
	start = getdate(get_first_day(add_months(end_date, -11)))
	rows = _agg(
		doctype,
		date_field,
		aggregates,
		[*filters, [date_field, "between", [start, getdate(get_last_day(end_date))]]],
		order_by="grp asc",
	)
	for r in rows:
		if r.grp:
			key = getdate(r.grp).strftime("%Y-%m")
			if key in buckets:
				buckets[key] += value(r)
	return buckets


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
	cache.set_value(key, data, expires_in_sec=CACHE_TTL)
	return data


@frappe.whitelist()
def get_filter_options():
	companies = frappe.get_list("Company", fields=["name", "default_currency"], order_by="name asc")
	default = frappe.defaults.get_user_default("Company")
	if default not in [c.name for c in companies]:
		default = companies[0].name if companies else None
	return {"companies": companies, "default_company": default}


# --------------------------------------------------------------------------- #
# Accounting
# --------------------------------------------------------------------------- #


def _acc_accounts(c):
	"""Leaf accounts of the company, sorted into income / expense / cash, in one query."""

	def load():
		rows = frappe.get_list(
			"Account",
			filters={"company": c.f.company, "is_group": 0},
			fields=["name", "account_name", "root_type", "account_type"],
			limit_page_length=0,
		)
		return frappe._dict(
			income={r.name: r.account_name for r in rows if r.root_type == "Income"},
			expense={r.name: r.account_name for r in rows if r.root_type == "Expense"},
			cash=[r.name for r in rows if r.account_type in ("Cash", "Bank")],
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
	base = [["company", "=", f.company], ["is_cancelled", "=", 0]]
	gl = {"dr": "sum(debit)", "cr": "sum(credit)"}

	income = _month_buckets(f.to_date)
	expense = _month_buckets(f.to_date)
	if acc.income:
		income = _monthly(
			"GL Entry",
			"posting_date",
			gl,
			[*base, ["account", "in", list(acc.income)]],
			f.to_date,
			lambda r: flt(r.cr) - flt(r.dr),
		)
	if acc.expense:
		expense = _monthly(
			"GL Entry",
			"posting_date",
			gl,
			[*base, ["account", "in", list(acc.expense)]],
			f.to_date,
			lambda r: flt(r.dr) - flt(r.cr),
		)
	return {
		"months": list(income.keys()),
		"series": [
			{"key": "income", "name": _("Income"), "values": list(income.values())},
			{"key": "expense", "name": _("Expense"), "values": list(expense.values())},
		],
	}


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


ACCOUNTING_SECTIONS = {
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
	base = [["company", "=", f.company], ["docstatus", "=", 1]]
	amt = {"amt": "sum(base_net_total)"}
	invoiced = _monthly("Sales Invoice", "posting_date", amt, base, f.to_date, lambda r: flt(r.amt))
	quoted = _monthly("Quotation", "transaction_date", amt, base, f.to_date, lambda r: flt(r.amt))
	return {
		"months": list(invoiced.keys()),
		"series": [
			{"key": "invoiced", "name": _("Invoiced"), "values": list(invoiced.values())},
			{"key": "quoted", "name": _("Quoted"), "values": list(quoted.values())},
		],
	}


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


SALES_SECTIONS = {
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


PROJECT_SECTIONS = {
	"kpis": _proj_kpis,
	"status": _proj_status,
	"projects": _proj_list,
	"budget": _proj_budget,
	"task_status": _proj_task_status,
	"due_tasks": _proj_due_tasks,
	"subcontract": _proj_subcontract,
}


@frappe.whitelist()
def get_project_dashboard(company=None, from_date=None, to_date=None, refresh=0):
	return _build("projects", PROJECT_SECTIONS, company, from_date, to_date, refresh)
