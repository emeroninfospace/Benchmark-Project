# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

"""Data endpoints for the Accounting, Sales and Project dashboards.

Every query goes through ``frappe.get_list`` so role permissions, user
permissions and ``permission_query_conditions`` (e.g. the Task rules for
supervisors) are respected. Each dashboard section is computed independently:
a section whose doctype the user cannot read comes back as ``{"denied": 1}``
and the page shows a "no access" state for that card only.
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
	today,
)

OPEN_TASK_STATUSES = ["Open", "Working", "Pending Review", "Overdue"]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _section(fn, *args):
	"""Run one dashboard section; isolate permission errors to that section."""
	try:
		return fn(*args)
	except frappe.PermissionError:
		# keep the "not permitted" popup from surfacing for a section we simply hide
		frappe.local.message_log = []
		return {"denied": 1}


def _can_read(doctype):
	return frappe.has_permission(doctype, "read")


def _sum(doctype, field, filters):
	if not _can_read(doctype):
		raise frappe.PermissionError
	row = frappe.get_list(doctype, filters=filters, fields=[f"sum({field}) as total"])
	return flt(row[0].total) if row else 0.0


def _count(doctype, filters):
	if not _can_read(doctype):
		raise frappe.PermissionError
	row = frappe.get_list(doctype, filters=filters, fields=["count(name) as total"])
	return cint(row[0].total) if row else 0


def _group(doctype, group_field, aggregates, filters, order_by=None, limit=None):
	"""Group ``doctype`` by ``group_field``.

	``aggregates`` is either a single SQL aggregate (e.g. ``"sum(grand_total)"``) or
	a ``(debit_expr, credit_expr)`` pair whose difference is the value.
	Returns ``[{key, value}]`` sorted by value (descending) unless ``order_by`` is given.
	"""
	if not _can_read(doctype):
		raise frappe.PermissionError
	pair = isinstance(aggregates, tuple | list)
	fields = [f"`tab{doctype}`.`{group_field}` as grp"]
	fields += [f"{aggregates[0]} as v1", f"{aggregates[1]} as v2"] if pair else [f"{aggregates} as v1"]
	rows = frappe.get_list(
		doctype,
		filters=filters,
		fields=fields,
		group_by=f"`tab{doctype}`.`{group_field}`",
		order_by=order_by or "v1 desc",
		limit_page_length=0 if pair else (limit or 0),
	)
	out = [{"key": r.grp, "value": flt(r.v1) - flt(r.v2) if pair else flt(r.v1)} for r in rows]
	if pair and not order_by:
		out.sort(key=lambda r: r["value"], reverse=True)
		if limit:
			out = out[:limit]
	return out


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


def _month_buckets(end_date, months=12):
	"""OrderedDict of 'YYYY-MM' -> 0 for the ``months`` months ending at ``end_date``."""
	end = get_first_day(end_date)
	buckets = OrderedDict()
	for i in range(months - 1, -1, -1):
		buckets[getdate(add_months(end, -i)).strftime("%Y-%m")] = 0.0
	return buckets


def _monthly(doctype, date_field, aggregates, filters, end_date):
	"""Per-month totals for the 12 months ending at ``end_date`` (see ``_group`` for ``aggregates``)."""
	buckets = _month_buckets(end_date)
	start = getdate(get_first_day(add_months(end_date, -11)))
	rows = _group(
		doctype,
		date_field,
		aggregates,
		[*filters, [date_field, "between", [start, getdate(get_last_day(end_date))]]],
		order_by="grp asc",
	)
	for r in rows:
		if not r["key"]:
			continue
		key = getdate(r["key"]).strftime("%Y-%m")
		if key in buckets:
			buckets[key] += r["value"]
	return buckets


def _labels(doctype, names, field):
	names = [n for n in names if n]
	if not names:
		return {}
	rows = frappe.get_all(doctype, filters={"name": ["in", names]}, fields=["name", field])
	return {r.name: r.get(field) or r.name for r in rows}


# --------------------------------------------------------------------------- #
# Shared
# --------------------------------------------------------------------------- #


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


def _accounts(company, **filters):
	return frappe.get_list(
		"Account",
		filters={"company": company, "is_group": 0, **filters},
		fields=["name", "account_name"],
		limit_page_length=0,
	)


def _gl_net(company, accounts, from_date, to_date, sign):
	"""Net movement over ``accounts``; sign=1 -> debit-credit, -1 -> credit-debit."""
	if not accounts:
		return 0.0
	filters = [
		["company", "=", company],
		["is_cancelled", "=", 0],
		["account", "in", accounts],
		["posting_date", "between", [from_date, to_date]],
	]
	debit = _sum("GL Entry", "debit", filters)
	credit = _sum("GL Entry", "credit", filters)
	return (debit - credit) * sign


def _acc_kpis(f):
	income_acc = [a.name for a in _accounts(f.company, root_type="Income")]
	expense_acc = [a.name for a in _accounts(f.company, root_type="Expense")]

	income = _gl_net(f.company, income_acc, f.from_date, f.to_date, -1)
	expense = _gl_net(f.company, expense_acc, f.from_date, f.to_date, 1)
	prev_income = _gl_net(f.company, income_acc, f.prev_from, f.prev_to, -1)
	prev_expense = _gl_net(f.company, expense_acc, f.prev_from, f.prev_to, 1)

	cash_acc = [a.name for a in _accounts(f.company, account_type=["in", ["Cash", "Bank"]])]
	cash = 0.0
	if cash_acc:
		cash_filters = [
			["company", "=", f.company],
			["is_cancelled", "=", 0],
			["account", "in", cash_acc],
			["posting_date", "<=", f.to_date],
		]
		cash = _sum("GL Entry", "debit", cash_filters) - _sum("GL Entry", "credit", cash_filters)

	open_si = [["company", "=", f.company], ["docstatus", "=", 1], ["outstanding_amount", ">", 0]]
	receivable = _sum("Sales Invoice", "outstanding_amount", open_si)
	overdue = _sum("Sales Invoice", "outstanding_amount", [*open_si, ["due_date", "<", today()]])

	open_pi = [["company", "=", f.company], ["docstatus", "=", 1], ["outstanding_amount", ">", 0]]
	payable = _sum("Purchase Invoice", "outstanding_amount", open_pi)

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


def _acc_trend(f):
	income_acc = [a.name for a in _accounts(f.company, root_type="Income")]
	expense_acc = [a.name for a in _accounts(f.company, root_type="Expense")]
	base = [["company", "=", f.company], ["is_cancelled", "=", 0]]

	income = _month_buckets(f.to_date)
	expense = _month_buckets(f.to_date)
	if income_acc:
		income = _monthly(
			"GL Entry",
			"posting_date",
			("sum(credit)", "sum(debit)"),
			[*base, ["account", "in", income_acc]],
			f.to_date,
		)
	if expense_acc:
		expense = _monthly(
			"GL Entry",
			"posting_date",
			("sum(debit)", "sum(credit)"),
			[*base, ["account", "in", expense_acc]],
			f.to_date,
		)
	return {
		"months": list(income.keys()),
		"series": [
			{"key": "income", "name": _("Income"), "values": list(income.values())},
			{"key": "expense", "name": _("Expense"), "values": list(expense.values())},
		],
	}


def _acc_expense_breakdown(f):
	accounts = {a.name: a.account_name for a in _accounts(f.company, root_type="Expense")}
	if not accounts:
		return {"items": []}
	rows = _group(
		"GL Entry",
		"account",
		("sum(debit)", "sum(credit)"),
		[
			["company", "=", f.company],
			["is_cancelled", "=", 0],
			["account", "in", list(accounts)],
			["posting_date", "between", [f.from_date, f.to_date]],
		],
	)
	rows = [r for r in rows if r["value"] > 0]
	rows.sort(key=lambda r: r["value"], reverse=True)
	items = [
		{"label": accounts.get(r["key"], r["key"]), "value": r["value"], "account": r["key"]}
		for r in rows[:6]
	]
	rest = sum(r["value"] for r in rows[6:])
	if rest:
		items.append({"label": _("Other"), "value": rest})
	return {"items": items}


def _acc_aging(f):
	rows = _group(
		"Sales Invoice",
		"due_date",
		"sum(outstanding_amount)",
		[["company", "=", f.company], ["docstatus", "=", 1], ["outstanding_amount", ">", 0]],
		order_by="grp asc",
	)
	labels = [_("Not due"), "1-30", "31-60", "61-90", "90+"]
	values = [0.0] * 5
	now = getdate(today())
	for r in rows:
		age = date_diff(now, r["key"]) if r["key"] else 0
		idx = 0 if age <= 0 else 1 if age <= 30 else 2 if age <= 60 else 3 if age <= 90 else 4
		values[idx] += r["value"]
	return {"buckets": [{"label": label, "value": v} for label, v in zip(labels, values, strict=True)]}


def _acc_top_debtors(f):
	rows = _group(
		"Sales Invoice",
		"customer",
		"sum(outstanding_amount)",
		[["company", "=", f.company], ["docstatus", "=", 1], ["outstanding_amount", ">", 0]],
		limit=6,
	)
	names = _labels("Customer", [r["key"] for r in rows], "customer_name")
	return {
		"items": [
			{"label": names.get(r["key"], r["key"]), "value": r["value"], "customer": r["key"]} for r in rows
		]
	}


def _acc_overdue_invoices(f):
	if not _can_read("Sales Invoice"):
		raise frappe.PermissionError
	rows = frappe.get_list(
		"Sales Invoice",
		filters=[
			["company", "=", f.company],
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


def _acc_recent_payments(f):
	if not _can_read("Payment Entry"):
		raise frappe.PermissionError
	rows = frappe.get_list(
		"Payment Entry",
		filters=[["company", "=", f.company], ["docstatus", "=", 1]],
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


def _acc_tax(f):
	period = [
		["company", "=", f.company],
		["docstatus", "=", 1],
		["posting_date", "between", [f.from_date, f.to_date]],
	]
	output_tax = _sum("Sales Invoice", "base_total_taxes_and_charges", period)
	input_tax = _sum("Purchase Invoice", "base_total_taxes_and_charges", period)
	return {"output_tax": output_tax, "input_tax": input_tax, "net": output_tax - input_tax}


def _acc_expense_entries(f):
	period = [
		["company", "=", f.company],
		["docstatus", "=", 1],
		["posting_date", "between", [f.from_date, f.to_date]],
	]
	paid = _sum("Expense Entry", "grand_total", [*period, ["status", "=", "Paid"]])
	unpaid = _sum("Expense Entry", "grand_total", [*period, ["status", "!=", "Paid"]])
	unpaid_count = _count("Expense Entry", [*period, ["status", "!=", "Paid"]])
	return {"paid": paid, "unpaid": unpaid, "unpaid_count": unpaid_count}


@frappe.whitelist()
def get_accounting_dashboard(company=None, from_date=None, to_date=None):
	f = _resolve_filters(company, from_date, to_date)
	return {
		"filters": f,
		"kpis": _section(_acc_kpis, f),
		"trend": _section(_acc_trend, f),
		"expense_breakdown": _section(_acc_expense_breakdown, f),
		"aging": _section(_acc_aging, f),
		"top_debtors": _section(_acc_top_debtors, f),
		"overdue_invoices": _section(_acc_overdue_invoices, f),
		"recent_payments": _section(_acc_recent_payments, f),
		"tax": _section(_acc_tax, f),
		"expense_entries": _section(_acc_expense_entries, f),
	}


# --------------------------------------------------------------------------- #
# Sales
# --------------------------------------------------------------------------- #


def _sales_kpis(f):
	def period(frm, to, date_field="posting_date"):
		return [["company", "=", f.company], ["docstatus", "=", 1], [date_field, "between", [frm, to]]]

	sales = _sum("Sales Invoice", "base_net_total", period(f.from_date, f.to_date))
	prev_sales = _sum("Sales Invoice", "base_net_total", period(f.prev_from, f.prev_to))
	invoices = _count("Sales Invoice", period(f.from_date, f.to_date))

	q_period = period(f.from_date, f.to_date, "transaction_date")
	quoted = _sum("Quotation", "base_net_total", q_period)
	prev_quoted = _sum("Quotation", "base_net_total", period(f.prev_from, f.prev_to, "transaction_date"))
	quotations = _count("Quotation", q_period)
	won = _count("Quotation", [*q_period, ["status", "in", ["Ordered", "Partially Ordered"]]])
	lost = _count("Quotation", [*q_period, ["status", "=", "Lost"]])

	lead_period = [["creation", "between", [f.from_date, add_days(f.to_date, 1)]]]
	prev_lead_period = [["creation", "between", [f.prev_from, add_days(f.prev_to, 1)]]]
	leads = _count("Lead", lead_period)
	prev_leads = _count("Lead", prev_lead_period)

	return {
		"sales": sales,
		"prev_sales": prev_sales,
		"invoices": invoices,
		"avg_invoice": sales / invoices if invoices else 0,
		"quoted": quoted,
		"prev_quoted": prev_quoted,
		"quotations": quotations,
		"won": won,
		"lost": lost,
		"win_rate": (won * 100.0 / quotations) if quotations else 0,
		"leads": leads,
		"prev_leads": prev_leads,
	}


def _sales_trend(f):
	base = [["company", "=", f.company], ["docstatus", "=", 1]]
	invoiced = _monthly("Sales Invoice", "posting_date", "sum(base_net_total)", base, f.to_date)
	quoted = _monthly("Quotation", "transaction_date", "sum(base_net_total)", base, f.to_date)
	return {
		"months": list(invoiced.keys()),
		"series": [
			{"key": "invoiced", "name": _("Invoiced"), "values": list(invoiced.values())},
			{"key": "quoted", "name": _("Quoted"), "values": list(quoted.values())},
		],
	}


def _sales_funnel(f):
	created = [["creation", "between", [f.from_date, add_days(f.to_date, 1)]]]
	stages = [
		{"label": _("Leads"), "doctype": "Lead", "value": _count("Lead", created)},
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
		{
			"label": _("Quotations"),
			"doctype": "Quotation",
			"value": _count(
				"Quotation",
				[
					["company", "=", f.company],
					["docstatus", "=", 1],
					["transaction_date", "between", [f.from_date, f.to_date]],
				],
			),
		},
		{
			"label": _("Won"),
			"doctype": "Quotation",
			"value": _count(
				"Quotation",
				[
					["company", "=", f.company],
					["docstatus", "=", 1],
					["transaction_date", "between", [f.from_date, f.to_date]],
					["status", "in", ["Ordered", "Partially Ordered"]],
				],
			),
		},
	]
	return {"stages": stages}


def _sales_lead_status(f):
	rows = _group(
		"Lead",
		"status",
		"count(name)",
		[["creation", "between", [f.from_date, add_days(f.to_date, 1)]]],
	)
	return {
		"items": [{"label": r["key"] or _("Not set"), "value": r["value"], "status": r["key"]} for r in rows]
	}


def _sales_lead_source(f):
	rows = _group(
		"Lead",
		"source",
		"count(name)",
		[["creation", "between", [f.from_date, add_days(f.to_date, 1)]]],
	)
	rows.sort(key=lambda r: r["value"], reverse=True)
	items = [{"label": r["key"] or _("Not set"), "value": r["value"], "source": r["key"]} for r in rows[:5]]
	rest = sum(r["value"] for r in rows[5:])
	if rest:
		items.append({"label": _("Other"), "value": rest})
	return {"items": items}


def _sales_quotation_status(f):
	rows = _group(
		"Quotation",
		"status",
		"count(name)",
		[
			["company", "=", f.company],
			["docstatus", "=", 1],
			["transaction_date", "between", [f.from_date, f.to_date]],
		],
	)
	order = ["Open", "Replied", "Partially Ordered", "Ordered", "Lost", "Expired", "Cancelled"]
	rows.sort(key=lambda r: order.index(r["key"]) if r["key"] in order else len(order))
	return {"items": [{"label": _(r["key"]), "value": r["value"], "status": r["key"]} for r in rows]}


def _sales_top_customers(f):
	rows = _group(
		"Sales Invoice",
		"customer",
		"sum(base_net_total)",
		[
			["company", "=", f.company],
			["docstatus", "=", 1],
			["posting_date", "between", [f.from_date, f.to_date]],
		],
		limit=6,
	)
	names = _labels("Customer", [r["key"] for r in rows], "customer_name")
	return {
		"items": [
			{"label": names.get(r["key"], r["key"]), "value": r["value"], "customer": r["key"]} for r in rows
		]
	}


def _sales_recent_quotations(f):
	if not _can_read("Quotation"):
		raise frappe.PermissionError
	rows = frappe.get_list(
		"Quotation",
		filters=[["company", "=", f.company], ["docstatus", "<", 2]],
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


def _sales_upcoming_visits(f):
	if not _can_read("Site Visit"):
		raise frappe.PermissionError
	rows = frappe.get_list(
		"Site Visit",
		filters=[["visit_date", ">=", today()], ["docstatus", "<", 2]],
		fields=["name", "lead_name", "visit_date", "site_location", "status"],
		order_by="visit_date asc",
		limit_page_length=6,
	)
	return {"rows": rows}


@frappe.whitelist()
def get_sales_dashboard(company=None, from_date=None, to_date=None):
	f = _resolve_filters(company, from_date, to_date)
	return {
		"filters": f,
		"kpis": _section(_sales_kpis, f),
		"trend": _section(_sales_trend, f),
		"funnel": _section(_sales_funnel, f),
		"lead_status": _section(_sales_lead_status, f),
		"lead_source": _section(_sales_lead_source, f),
		"quotation_status": _section(_sales_quotation_status, f),
		"top_customers": _section(_sales_top_customers, f),
		"recent_quotations": _section(_sales_recent_quotations, f),
		"upcoming_visits": _section(_sales_upcoming_visits, f),
	}


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


def _proj_kpis(f):
	base = [["company", "=", f.company]]
	active = _count("Project", [*base, ["status", "=", "Open"]])
	overdue = _count("Project", [*base, ["status", "=", "Open"], ["expected_end_date", "<", today()]])
	completed = _count(
		"Project",
		[*base, ["status", "=", "Completed"], ["modified", "between", [f.from_date, add_days(f.to_date, 1)]]],
	)
	if not _can_read("Project"):
		raise frappe.PermissionError
	avg_row = frappe.get_list(
		"Project",
		filters=[*base, ["status", "=", "Open"]],
		fields=["avg(percent_complete) as total"],
	)
	avg_progress = flt(avg_row[0].total) if avg_row else 0

	task_base = [["company", "=", f.company], ["status", "in", OPEN_TASK_STATUSES]]
	open_tasks = overdue_tasks = 0
	if _can_read("Task"):
		open_tasks = _count("Task", task_base)
		overdue_tasks = _count("Task", [*task_base, ["exp_end_date", "<", today()]])

	estimated = _sum("Project", "estimated_costing", [*base, ["status", "=", "Open"]])
	billed = _sum("Project", "total_billed_amount", [*base, ["status", "=", "Open"]])

	return {
		"active": active,
		"overdue": overdue,
		"completed": completed,
		"avg_progress": avg_progress,
		"open_tasks": open_tasks,
		"overdue_tasks": overdue_tasks,
		"estimated": estimated,
		"billed": billed,
	}


def _proj_status(f):
	rows = _group("Project", "status", "count(name)", [["company", "=", f.company]])
	order = ["Open", "Completed", "Cancelled"]
	rows.sort(key=lambda r: order.index(r["key"]) if r["key"] in order else len(order))
	return {"items": [{"label": _(r["key"]), "value": r["value"], "status": r["key"]} for r in rows]}


def _proj_list(f):
	if not _can_read("Project"):
		raise frappe.PermissionError
	rows = frappe.get_list(
		"Project",
		filters=[["company", "=", f.company], ["status", "=", "Open"]],
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
	rank = {"Overdue": 0, "At risk": 1, "On track": 2}
	rows.sort(key=lambda r: (rank.get(r.health, 3), str(r.expected_end_date or "9999")))
	counts = {"On track": 0, "At risk": 0, "Overdue": 0}
	for r in rows:
		if r.health in counts:
			counts[r.health] += 1
	return {"rows": rows[:10], "total": len(rows), "health": counts}


def _proj_budget(f):
	if not _can_read("Project Budget"):
		raise frappe.PermissionError
	rows = frappe.get_list(
		"Project Budget",
		filters=[["docstatus", "=", 1]],
		fields=[
			"`tabProject Budget`.`project` as project",
			"sum(total_estimated_cost) as estimated",
			"sum(total_actual_cost) as actual",
		],
		group_by="`tabProject Budget`.`project`",
		order_by="estimated desc",
		limit_page_length=0,
	)
	project_names = _labels("Project", [r.project for r in rows], "project_name")
	companies = _labels("Project", [r.project for r in rows], "company")
	rows = [r for r in rows if r.project and companies.get(r.project) == f.company][:8]
	return {
		"items": [
			{
				"project": r.project,
				"label": project_names.get(r.project, r.project),
				"estimated": flt(r.estimated),
				"actual": flt(r.actual),
			}
			for r in rows
		]
	}


def _proj_task_status(f):
	rows = _group(
		"Task",
		"status",
		"count(name)",
		[["company", "=", f.company], ["status", "!=", "Template"]],
	)
	order = ["Open", "Working", "Pending Review", "Overdue", "Completed", "Cancelled"]
	rows.sort(key=lambda r: order.index(r["key"]) if r["key"] in order else len(order))
	return {"items": [{"label": _(r["key"]), "value": r["value"], "status": r["key"]} for r in rows]}


def _proj_due_tasks(f):
	if not _can_read("Task"):
		raise frappe.PermissionError
	rows = frappe.get_list(
		"Task",
		filters=[
			["company", "=", f.company],
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


def _proj_subcontract(f):
	period = [
		["company", "=", f.company],
		["docstatus", "=", 1],
		["transaction_date", "between", [f.from_date, f.to_date]],
	]
	ordered = _sum("Subcontract Work Order", "base_grand_total", period)
	invoiced = _sum("Subcontract Invoice", "base_grand_total", period)
	paid = _sum("Subcontract Invoice", "paid_amount", period)
	orders = _count("Subcontract Work Order", period)
	return {"ordered": ordered, "invoiced": invoiced, "paid": paid, "orders": orders}


@frappe.whitelist()
def get_project_dashboard(company=None, from_date=None, to_date=None):
	f = _resolve_filters(company, from_date, to_date)
	return {
		"filters": f,
		"kpis": _section(_proj_kpis, f),
		"status": _section(_proj_status, f),
		"projects": _section(_proj_list, f),
		"budget": _section(_proj_budget, f),
		"task_status": _section(_proj_task_status, f),
		"due_tasks": _section(_proj_due_tasks, f),
		"subcontract": _section(_proj_subcontract, f),
	}
