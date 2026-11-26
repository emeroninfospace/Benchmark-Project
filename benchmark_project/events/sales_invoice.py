import frappe
from erpnext.crm.doctype.lead.lead import _make_customer


def on_submit(doc, method=None):
    if doc.custom_quotation:
        _set_quotation_status(doc.custom_quotation, "Ordered")
        _convert_lead_to_customer(doc.custom_quotation, doc.customer)


def on_cancel(doc, method=None):
    if not doc.custom_quotation:
        return

    # The link to the quotation lives in `custom_quotation` on Sales Invoice.
    active_invoice_exists = frappe.db.exists(
        "Sales Invoice",
        {
            "custom_quotation": doc.custom_quotation,
            "docstatus": 1,
            "name": ["!=", doc.name],
        },
    )

    if not active_invoice_exists:
        _set_quotation_status(doc.custom_quotation, "Open")


def _set_quotation_status(quotation_name, status):
    quotation = frappe.db.get_value("Quotation", quotation_name, ["docstatus", "status"], as_dict=True)

    if not quotation or quotation.docstatus != 1:
        return

    if quotation.status in ("Lost", "Closed"):
        return

    if quotation.status != status:
        frappe.db.set_value("Quotation", quotation_name, "status", status, update_modified=False)


def _convert_lead_to_customer(quotation_name, invoice_customer=None):
    quotation = frappe.db.get_value(
        "Quotation", quotation_name, ["quotation_to", "party_name"], as_dict=True
    )

    if not quotation or quotation.quotation_to != "Lead" or not quotation.party_name:
        return

    lead_name = quotation.party_name

    if frappe.db.exists("Customer", {"lead_name": lead_name}):
        return

    # The invoice already points at a customer made for this lead (e.g. by
    # "Create > Sales Invoice" on the quotation): link it instead of creating a
    # duplicate customer.
    if invoice_customer and not frappe.db.get_value("Customer", invoice_customer, "lead_name"):
        frappe.db.set_value("Customer", invoice_customer, "lead_name", lead_name, update_modified=False)
        frappe.db.set_value("Lead", lead_name, "status", "Converted", update_modified=False)
        return

    customer_doc = _make_customer(lead_name, ignore_permissions=True)
    customer_doc.flags.ignore_mandatory = True
    customer_doc.insert(ignore_permissions=True)
