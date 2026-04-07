# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from erpnext.accounts.general_ledger import make_gl_entries
from frappe.utils import getdate


class SubcontractInvoice(Document):

    def on_submit(self):
        self.make_gl_entries()

    def on_cancel(self):
        make_gl_entries([], cancel=1, voucher_type=self.doctype, voucher_no=self.name)

    def make_gl_entries(self):

        company = frappe.get_doc("Company", self.company)

        payable_account = company.default_payable_account
        expense_account = company.custom_subcontract_account

        if not payable_account or not expense_account:
            frappe.throw("Set Default Payable Account and Subcontract Account in Company")
        
        if not self.cost_center:
            self.cost_center = frappe.db.get_value("Company", self.company, "cost_center")

        posting_date = getdate(self.transaction_date)

        gl_entries = []

        gl_entries.append(frappe._dict({
		"account": expense_account,
		"debit": self.total_amount,
		"debit_in_account_currency": self.total_amount,
		"against": payable_account,
		"voucher_type": self.doctype,
		"voucher_no": self.name,
		"company": self.company,
		"posting_date": posting_date,
		"cost_center": self.cost_center,  
		"project": self.project           
	}))

        gl_entries.append(frappe._dict({
		"account": payable_account,
		"credit": self.total_amount,
		"credit_in_account_currency": self.total_amount,
		"against": expense_account,
		"party_type": "Supplier",
		"party": self.supplier,
		"voucher_type": self.doctype,
		"voucher_no": self.name,
		"company": self.company,
		"posting_date": posting_date,
		"cost_center": self.cost_center,  
		"project": self.project
	}))

        make_gl_entries(gl_entries)


@frappe.whitelist()
def make_payment_entry(invoice, mode_of_payment, amount):
    invoice_doc = frappe.get_doc("Subcontract Invoice", invoice)

    company = invoice_doc.company
    project = invoice_doc.project

    mop = frappe.get_doc("Mode of Payment", mode_of_payment)

    default_account = None
    for acc in mop.accounts:
        if acc.company == company:
            default_account = acc.default_account
            break

    if not default_account:
        frappe.throw("No default account found for Mode of Payment")

    payable_account = frappe.get_value("Company", company, "default_payable_account")

    amount = frappe.utils.flt(amount, 2)

    paid_amount = frappe.utils.flt(invoice_doc.paid_amount or 0)
    grand_total = frappe.utils.flt(invoice_doc.grand_total)

    outstanding = grand_total - paid_amount

    if outstanding <= 0:
        frappe.throw("Invoice already fully paid")

    if amount > outstanding:
        frappe.throw(f"Amount cannot exceed outstanding amount: {outstanding}")

    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Journal Entry"
    je.company = company
    je.posting_date = frappe.utils.nowdate()

    je.cheque_no = invoice_doc.name
    je.cheque_date = invoice_doc.creation

    je.append("accounts", {
        "account": default_account,
        "debit_in_account_currency": amount,
        "project": project
    })

    je.append("accounts", {
        "account": payable_account,
        "credit_in_account_currency": amount,
        "party_type": "Supplier",
        "party": invoice_doc.supplier,
        "project": project
    })

    je.insert(ignore_permissions=True)
    je.submit()

    paid_amount += amount
    outstanding = grand_total - paid_amount

    frappe.db.set_value("Subcontract Invoice", invoice, "paid_amount", paid_amount)
    

    if paid_amount >= grand_total:
        if invoice_doc.subcontract_work_order:
            frappe.db.set_value("Subcontract Work Order", invoice_doc.subcontract_work_order, "status", "Paid")
    else:
        if invoice_doc.subcontract_work_order:
            frappe.db.set_value("Subcontract Work Order", invoice_doc.subcontract_work_order, "status", "Partially Billed")

    return je.name