import frappe
from frappe.model.mapper import get_mapped_doc
from frappe.utils import date_diff,nowdate
from frappe.utils import flt
from frappe import _

@frappe.whitelist()
def make_project(source_name, target_doc=None):
    """Create Project from Quotation"""
    
    def set_missing_values(source, target):
        if source.custom_bill_of_quantity:
            boq = frappe.get_doc(
                "Bill of Quantity",
                source.custom_bill_of_quantity
            )

            target.set("custom_boq_items", [])
            for row in boq.table_kfog: 
                item_name = frappe.db.get_value(
                    "Item",
                    row.item_code,
                    "item_name"
                )
                target.append("custom_boq_items", {
                    "item_code": row.item_code,
                    "item_name": item_name,
                    "uom":row.uom,
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
                    "party_name": "customer",
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
        target.customer = source.party_name
        target.custom_bill_of_quantity = source.custom_bill_of_quantity

        target.remarks = f"Sales Invoice created from Quotation {source.name}"

    doclist = get_mapped_doc(
        "Quotation",
        source_name,
        {
            "Quotation": {
                "doctype": "Sales Invoice",
                "field_map": {
                    "party_name": "customer",
                    "name": "quotation",
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


import frappe
import re
from erpnext.selling.doctype.quotation.quotation import Quotation

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
            self.amended_from = self.amended_from 
            self.reload()