// Copyright (c) 2026, Balaji B and contributors
// For license information, please see license.txt

frappe.ui.form.on("Subcontract Work Order", {
    refresh(frm) {

        if (frm.doc.docstatus === 1 && frm.doc.supplier) {

            frm.add_custom_button("Purchase Order", () => {
                frappe.call({
                    method: "benchmark_project.benchmark_project.doctype.subcontract_work_order.subcontract_work_order.create_purchase_order",
                    args: {
                        docname: frm.doc.name
                    },
                    callback(r) {
                        if (r.message) {
                            frappe.msgprint("Purchase Order Created: " + r.message);
                            frm.reload_doc();
                        }
                    }
                });
            }, "Create");

            frm.add_custom_button("Subcontract Invoice", () => {
                frappe.call({
                    method: "benchmark_project.benchmark_project.doctype.subcontract_work_order.subcontract_work_order.create_subcontract_invoice",
                    args: {
                        docname: frm.doc.name
                    },
                    callback(r) {
                        if (r.message) {
                            frappe.msgprint("Subcontract Invoice Created: " + r.message);
                            frappe.set_route("Form", "Subcontract Invoice", r.message);
                        }
                    }
                });
            }, "Create");

        }
    }
});

frappe.ui.form.on('Subcontract Work Item', {
    item_code: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (row.item_code) {
            frappe.db.get_value('Item Price', {
                item_code: row.item_code
            }, 'price_list_rate').then(r => {
                if (r.message) {
                    row.rate = r.message.price_list_rate || 0;
                    refresh_field('items');
                }
            });
        }
    },

    quantity: function(frm, cdt, cdn) {
        calculate_row_amount(frm, cdt, cdn);
    },

    rate: function(frm, cdt, cdn) {
        calculate_row_amount(frm, cdt, cdn);
    }
});


function calculate_row_amount(frm, cdt, cdn) {
    let row = locals[cdt][cdn];

    row.amount = (row.quantity || 0) * (row.rate || 0);

    refresh_field('items');
    calculate_totals(frm);
}


function calculate_totals(frm) {
    let total_qty = 0;
    let total_amt = 0;

    (frm.doc.items || []).forEach(row => {
        total_qty += row.quantity || 0;
        total_amt += row.amount || 0;
    });

    frm.set_value('total_quantity', total_qty);
    frm.set_value('total_currency', total_amt);
}