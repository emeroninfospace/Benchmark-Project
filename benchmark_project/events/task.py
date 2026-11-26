import json

import frappe
from frappe.utils import cint, flt

@frappe.whitelist()
def get_my_tasks(filters=None):
    user = frappe.session.user

    if isinstance(filters, str):
        try:
            filters = json.loads(filters)
        except Exception:
            filters = {}

    filters = filters or {}

    conditions = ""
    values = {}

    if filters.get("project"):
        conditions += " AND t.project = %(project)s"
        values["project"] = filters["project"]

    if user == "Administrator" or "System Manager" in frappe.get_roles(user):
        return frappe.db.sql(f"""
            SELECT
                t.name,
                t.subject,
                t.project,
                t.status,
                t.progress,
                t.description,
                t.parent_task,
                t.is_group,
                t.priority,
                t.exp_start_date,
                t.exp_end_date
            FROM `tabTask` t
            WHERE 1=1
            {conditions}
            ORDER BY t.parent_task, t.idx
        """, values, as_dict=True)

    values["user"] = user

    return frappe.db.sql(f"""
        SELECT DISTINCT
            t.name,
            t.subject,
            t.project,
            t.status,
            t.progress,
            t.description,
            t.parent_task,
            t.is_group,
            t.priority,
            t.exp_start_date,
            t.exp_end_date
        FROM `tabTask` t
        INNER JOIN `tabToDo` td
            ON td.reference_name = t.name
        WHERE
            td.reference_type = 'Task'
            AND td.allocated_to = %(user)s
            AND td.status != 'Cancelled'
            {conditions}
        ORDER BY t.parent_task, t.idx
    """, values, as_dict=True)


def update_parent_task_progress(doc, method=None):
    """Roll child progress up the task tree (Task on_update hook).

    The parent is written with ``db.set_value`` (no hooks fire), so walk up the
    tree here; otherwise only the first level above the edited task is updated.
    """
    parent = doc.parent_task
    seen = set()

    while parent and parent not in seen:
        seen.add(parent)

        totals = frappe.get_all(
            "Task",
            filters={"parent_task": parent, "status": ["!=", "Cancelled"]},
            fields=["count(name) as n", "sum(progress) as total"],
        )
        count = cint(totals[0].n) if totals else 0
        if not count:
            return

        avg_progress = round(flt(totals[0].total) / count, 2)
        if avg_progress == 0:
            status = "Open"
        elif avg_progress >= 100:
            status = "Completed"
        else:
            status = "Working"

        current = frappe.db.get_value("Task", parent, ["progress", "status", "parent_task"], as_dict=True)
        if not current:
            return

        if flt(current.progress) == avg_progress and current.status == status:
            return  # nothing changed, so nothing above it changes either

        frappe.db.set_value("Task", parent, {"progress": avg_progress, "status": status})
        parent = current.parent_task
