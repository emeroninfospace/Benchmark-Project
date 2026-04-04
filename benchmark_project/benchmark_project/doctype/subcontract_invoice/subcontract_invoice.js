// Copyright (c) 2026, Emeron Infospace and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Subcontract Invoice", {
// 	refresh(frm) {

// 	},
// });


frappe.ui.form.on('Subcontract Invoice Item', {

    quantity: function(frm, cdt, cdn) {
        calculate_invoice_row(frm, cdt, cdn);
    },

    rate: function(frm, cdt, cdn) {
        calculate_invoice_row(frm, cdt, cdn);
    }

});


function calculate_invoice_row(frm, cdt, cdn) {
    let row = locals[cdt][cdn];

    row.amount = (row.quantity || 0) * (row.rate || 0);

    refresh_field('items');
    calculate_invoice_totals(frm);
}


function calculate_invoice_totals(frm) {
    let total_qty = 0;
    let total_amt = 0;

    (frm.doc.items || []).forEach(row => {
        total_qty += row.quantity || 0;
        total_amt += row.amount || 0;
    });

    frm.set_value('total_quantity', total_qty);
    frm.set_value('total_amount', total_amt);
}