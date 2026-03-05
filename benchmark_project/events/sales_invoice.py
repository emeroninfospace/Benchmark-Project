import frappe

def on_submit(doc, method=None):

    if doc.custom_quotation:
        _set_quotation_status(doc.custom_quotation, "Ordered")


def on_cancel(doc, method=None):

    if not doc.custom_quotation:
        return

    active_invoice_exists = frappe.db.exists(
        "Sales Invoice",
        {
            "quotation": doc.custom_quotation,
            "docstatus": 1,
            "name": ["!=", doc.name]
        }
    )

    if not active_invoice_exists:
        _set_quotation_status(doc.custom_quotation, "Open")


def _set_quotation_status(quotation_name, status):
    quotation = frappe.get_doc("Quotation", quotation_name)

    if quotation.docstatus != 1:
        return

    if quotation.status in ("Lost", "Closed"):
        return

    if quotation.status != status:
        quotation.db_set("status", status, update_modified=False)
