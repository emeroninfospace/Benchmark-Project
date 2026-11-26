import frappe
from frappe import _
from frappe.utils import flt, nowdate

@frappe.whitelist()
def create_project_schedule(project):
    project_doc = frappe.get_doc("Project", project)

    ps = frappe.new_doc("Project Schedule")
    ps.project = project_doc.name
    ps.bill_of_quantity = project_doc.custom_bill_of_quantity
    for row in project_doc.custom_boq_items:
        task = ps.append("project_schedule_tasks")
        task.description = row.item_name
        task.boq_template = row.boq_template_id
        task.item_code = row.item_code


    ps.insert(ignore_permissions=True)
    return ps.name


@frappe.whitelist()
def create_material_request(name):
    project = frappe.get_doc("Project", name)

    if not project.custom_boq_items:
        frappe.throw(_("No BOQ Items found for this project."))

    request = frappe.new_doc("Material Request")
    request.custom_project = name
    request.material_request_type = "Purchase"

    # Quantity already requested for this project, per item, in one query.
    item_codes = list({item.item_code for item in project.custom_boq_items if item.item_code})
    requested = dict(
        frappe.db.sql(
            """
            SELECT mri.item_code, SUM(mri.qty)
            FROM `tabMaterial Request Item` mri
            WHERE mri.project = %(project)s AND mri.item_code IN %(items)s AND mri.docstatus != 2
            GROUP BY mri.item_code
            """,
            {"project": name, "items": tuple(item_codes)},
        )
    ) if item_codes else {}

    for item in project.custom_boq_items:
        already = flt(requested.get(item.item_code))
        available_qty = flt(item.qty) - already
        # Earlier requests cover BOQ rows of the same item one after another.
        requested[item.item_code] = max(0.0, already - flt(item.qty))

        if available_qty > 0:
            request.append("items", {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "uom": item.uom,
                "qty": available_qty,
                "schedule_date": nowdate(),
                "project": name
            })

    if not request.items:
        frappe.throw(_("No items with available quantity found."))

    request.save(ignore_permissions=True)
    # request.submit()

    return request.name

@frappe.whitelist()
def make_project_budget(project):
    project_doc = frappe.get_doc("Project", project)

    ps = frappe.new_doc("Project Budget")
    ps.project = project_doc.name
    ps.boq_reference = project_doc.custom_bill_of_quantity

    if project_doc.custom_bill_of_quantity:
        boq = frappe.get_doc(
            "Bill of Quantity",
            project_doc.custom_bill_of_quantity
        )

        for row in boq.boq_template:
            budget = ps.append("budget_items")
            budget.category = row.boq_template
            budget.actual_amount = row.total_amount


    ps.insert(ignore_permissions=True)
    return ps.name