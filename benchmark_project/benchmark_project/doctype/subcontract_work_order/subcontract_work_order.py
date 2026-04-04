# Copyright (c) 2026, Balaji B and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, add_days


class SubcontractWorkOrder(Document):
	pass



@frappe.whitelist()
def create_subcontract_invoice(docname):
    doc = frappe.get_doc("Subcontract Work Order", docname)
    
    existing = frappe.db.exists("Subcontract Invoice", {
		"subcontract_work_order": doc.name,
		"docstatus": ["!=", 2] 
	})

    if existing:
        frappe.throw(f"Subcontract Invoice already exists: {existing}")

    invoice = frappe.new_doc("Subcontract Invoice")
    invoice.supplier = doc.supplier
    invoice.company = doc.company
    invoice.bill_of_quantity = doc.bill_of_quantity
    invoice.transaction_date = doc.transaction_date
    invoice.project = doc.project
    invoice.cost_center = doc.cost_center
    invoice.subcontract_work_order = doc.name

    total_qty = 0
    total_amt = 0

    for item in doc.items:
        row = invoice.append("items", {})
        row.item_code = item.item_code
        row.item_name = item.item_name
        row.quantity = item.quantity
        row.rate = item.rate
        row.amount = item.amount

        total_qty += item.quantity or 0
        total_amt += item.amount or 0

    invoice.total_quantity = total_qty
    invoice.total_amount = total_amt

    invoice.insert(ignore_permissions=True)

    return invoice.name


@frappe.whitelist()
def create_purchase_order(docname):
    doc = frappe.get_doc("Subcontract Work Order", docname)

    po = frappe.new_doc("Purchase Order")
    po.supplier = doc.supplier
    po.company = doc.company
    po.transaction_date = getdate(doc.transaction_date)

    for item in doc.items:
        row = po.append("items", {})
        row.item_code = item.item_code
        row.qty = item.quantity
        row.rate = item.rate
        row.amount = item.amount

        row.schedule_date = getdate(doc.transaction_date)  # or any logic

    po.insert(ignore_permissions=True)

    return po.name


