# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import strip_html



class BillofQuantity(Document):

    def validate(self):
        self.calculate_boq_totals()
        self.calculate_template_totals()
        self.calculate_template_grand_total()

    def calculate_boq_totals(self):
        total_quantity = 0
        total_amount = 0

        for row in self.table_kfog:
            row.amount = (row.qty or 0) * (row.rate or 0)

            total_quantity += row.qty or 0
            total_amount += row.amount or 0

        self.total_quantity_boq = total_quantity
        self.total_amount_boq = total_amount


    def calculate_template_totals(self):
        totals = {}

        for row in self.table_kfog:
            if not row.boq_template_id:
                continue
            if row.boq_template_id not in totals:
                totals[row.boq_template_id] = {"budget": 0}
            totals[row.boq_template_id]["budget"] += row.amount or 0

        for row in self.boq_template:
            computed = totals.get(row.boq_template, {}).get("budget", 0)
            if computed > 0:
                row.total_amount = computed
    
    def calculate_template_grand_total(self):
        grand_total = 0
        for row in self.boq_template:
            grand_total += row.total_amount or 0
        self.total_amount = grand_total



@frappe.whitelist()
def make_quotation(source_name, target_doc=None):

    def set_missing_values(source, target):
        source_data = source
        setting = frappe.db.get_single_value("Benchmark Settings", "default_service_item")
        if not setting:
            frappe.throw("Please set Default Service Item in Benchmark Settings")
        item = frappe.get_cached_value("Item", setting, ["item_code", "item_name", "stock_uom"], as_dict=True)

        target_fields = {
            "quotation_to":source_data.party_type,
            "party_name": source_data.party_name,
            "custom_bill_of_quantity": source.name,
            "transaction_date": source_data.posting_date,
            "custom_project": source_data.project_name,
            "custom_scope_of_work": source_data.scope_of_work,
            "ignore_pricing_rule": 1
        }

        for field, value in target_fields.items():
            target.set(field, value)

        target.append("items", {
            'item_code': item.item_code,
            'item_name': item.item_name,
            'uom': item.stock_uom,
            'qty': 1,
            'price_list_rate': source_data.total_amount_boq,
            'rate': source_data.total_amount_boq,
        })

    doc = get_mapped_doc(
        "Bill of Quantity",
        source_name,
        {
            "Bill of Quantity": {
                "doctype": "Quotation",
                "field_map": {}
            },

        },
        
        target_doc,
        set_missing_values
    )

    doc.insert(ignore_permissions=True)
    return doc

@frappe.whitelist()
def get_items(item_group):
    items = frappe.get_all(
        "Item",
        filters={"item_group": item_group, "disabled": 0},
        fields=["item_code", "description", "stock_uom", "standard_rate"],
    )
    return [
        {
            "item_code": item.item_code,
            "description": strip_html(item.description or ""),
            "uom": item.stock_uom,
            "rate": item.standard_rate,
        }
        for item in items
    ]
