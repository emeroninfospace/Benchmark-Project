import re

import frappe
from erpnext.selling.doctype.quotation.quotation import Quotation
from frappe.model.mapper import get_mapped_doc
from frappe.utils import nowdate

def _customer_for_quotation(source):
    """Customer to bill for a quotation; for a Lead, reuse or create one linked to it."""
    if source.quotation_to != "Lead":
        return source.party_name

    lead = source.party_name
    customer = frappe.db.get_value("Customer", {"lead_name": lead}, "name") or frappe.db.get_value(
        "Customer", {"customer_name": source.customer_name}, "name"
    )
    if customer:
        return customer

    customer = frappe.get_doc({
        "doctype": "Customer",
        "customer_name": source.customer_name,
        "customer_type": "Individual",
        "lead_name": lead,
        "customer_group": frappe.db.get_default("customer_group") or "All Customer Groups",
        "territory": frappe.db.get_default("territory") or "All Territories",
    })
    customer.flags.ignore_permissions = True
    # Committed with the request; no explicit commit so a failure rolls it back.
    customer.insert()
    return customer.name


@frappe.whitelist()
def make_project(source_name, target_doc=None):
    """Create Project from Quotation"""

    def set_missing_values(source, target):
        target.customer = _customer_for_quotation(source)

        if source.custom_bill_of_quantity:
            boq = frappe.get_doc("Bill of Quantity", source.custom_bill_of_quantity)
            item_codes = list({row.item_code for row in boq.table_kfog if row.item_code})
            item_names = dict(
                frappe.get_all("Item", filters={"name": ["in", item_codes]}, fields=["name", "item_name"], as_list=True)
            ) if item_codes else {}

            target.set("custom_boq_items", [])
            for row in boq.table_kfog:
                target.append("custom_boq_items", {
                    "item_code": row.item_code,
                    "item_name": item_names.get(row.item_code),
                    "uom": row.uom,
                    "qty": row.qty,
                    "rate": row.rate,
                    "amount": row.amount,
                    "boq_template_id": row.boq_template_id
                })

    doclist = get_mapped_doc(
        "Quotation",
        source_name,
        {
            "Quotation": {
                "doctype": "Project",
                "field_map": {
                    "custom_project": "project_name",
                    "remarks": "notes",
                    "custom_bill_of_quantity": "custom_bill_of_quantity",
                    "custom_scope_of_work": "scope_of_work",
                    "custom_location": "location",
                }
            }
        },
        target_doc,
        set_missing_values
    )

    return doclist


@frappe.whitelist()
def make_sales_invoice(source_name, target_doc=None):

    def set_missing_values(source, target):
        target.posting_date = nowdate()
        target.customer = _customer_for_quotation(source)
        target.custom_bill_of_quantity = source.custom_bill_of_quantity
        target.remarks = f"Sales Invoice created from Quotation {source.name}"

        default_income_account = frappe.get_cached_value("Company", source.company, "default_income_account")
        item_codes = list({item.item_code for item in target.items if item.item_code})
        income_accounts = dict(
            frappe.get_all(
                "Item Default",
                filters={"parent": ["in", item_codes], "company": source.company},
                fields=["parent", "income_account"],
                as_list=True,
            )
        ) if item_codes else {}
        for item in target.items:
            item.income_account = income_accounts.get(item.item_code) or default_income_account

    doclist = get_mapped_doc(
        "Quotation",
        source_name,
        {
            "Quotation": {
                "doctype": "Sales Invoice",
                "field_map": {
                    "name": "custom_quotation",
                    "custom_bill_of_quantity": "custom_bill_of_quantity",
                }
            },
            "Quotation Item": {
                "doctype": "Sales Invoice Item",
                "field_map": {
                    "item_code": "item_code",
                    "item_name": "item_name",
                    "qty": "qty",
                    "rate": "rate",
                    "amount": "amount",
                    "uom": "uom",
                    "description": "description"
                }
            }
        },
        target_doc,
        set_missing_values
    )

    return doclist



class CustomQuotation(Quotation):
    def after_insert(self):
        if self.amended_from:
            base_name = re.sub(r'-R\d+$', '', self.amended_from)
            base_name = re.sub(r'-(\d{1,2})$', '', base_name)
            
            existing = frappe.db.sql("""
                SELECT COUNT(*) FROM `tabQuotation`
                WHERE name LIKE %s
            """, (f"{base_name}-R%",))[0][0]
            
            new_name = f"{base_name}-R{existing + 1}"
            
            frappe.rename_doc("Quotation", self.name, new_name, force=True)
            self.name = new_name
            self.reload()