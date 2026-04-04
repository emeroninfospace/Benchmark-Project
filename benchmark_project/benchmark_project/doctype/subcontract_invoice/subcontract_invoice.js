frappe.ui.form.on("Subcontract Invoice", {
    refresh(frm) {
        if (frm.doc.docstatus === 1) {
            frm.add_custom_button("Accounting Ledger", () => {
                frappe.route_options = {
                    voucher_no: frm.doc.name,
                    voucher_type: frm.doc.doctype,
                    company: frm.doc.company
                };
                frappe.set_route("query-report", "General Ledger");
            }, "View");
        }
        // calculate_taxes(frm);
    },

    purchase_taxes_and_charges_add(frm) {
        calculate_taxes(frm);
    },

    purchase_taxes_and_charges_remove(frm) {
        calculate_taxes(frm);
    },

    purchase_taxes_and_charges_template(frm) {
        if (!frm.doc.purchase_taxes_and_charges_template) return;

        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Purchase Taxes and Charges Template",
                name: frm.doc.purchase_taxes_and_charges_template
            },
            callback(r) {
                if (r.message) {
                    frm.clear_table("purchase_taxes_and_charges");

                    (r.message.taxes || []).forEach(tax => {
                        let row = frm.add_child("purchase_taxes_and_charges");
                        row.charge_type = tax.charge_type;
                        row.rate = tax.rate;
                        row.account_head = tax.account_head;
                        row.add_deduct_tax = tax.add_deduct_tax;
                    });

                    frm.refresh_field("purchase_taxes_and_charges");
                    calculate_taxes(frm);
                }
            }
        });
    }
});

frappe.ui.form.on("Subcontract Invoice Item", {
    quantity(frm, cdt, cdn) {
        calculate_invoice_row(frm, cdt, cdn);
    },
    rate(frm, cdt, cdn) {
        calculate_invoice_row(frm, cdt, cdn);
    }
});

frappe.ui.form.on("Purchase Taxes and Charges", {
    rate(frm, cdt, cdn) {
        calculate_tax_row(frm, cdt, cdn);
    },
    tax_amount(frm) {
        calculate_taxes(frm);
    },
    charge_type(frm, cdt, cdn) {
        calculate_tax_row(frm, cdt, cdn);
    },
    add_deduct_tax(frm) {
        calculate_taxes(frm);
    }
});

function calculate_invoice_row(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    row.amount = (row.quantity || 0) * (row.rate || 0);
    refresh_field("items");
    calculate_invoice_totals(frm);
}

function calculate_invoice_totals(frm) {
    let total_qty = 0;
    let total_amt = 0;

    (frm.doc.items || []).forEach(row => {
        total_qty += row.quantity || 0;
        total_amt += row.amount || 0;
    });

    frm.set_value("total_quantity", total_qty);
    frm.set_value("total_amount", total_amt);
    calculate_taxes(frm);
}

function calculate_tax_row(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    let base_amount = frm.doc.total_amount || 0;

    if (row.charge_type === "On Net Total") {
        row.tax_amount = (base_amount * (row.rate || 0)) / 100;
    }
    row.total = row.rate * row.tax_amount

    refresh_field("purchase_taxes_and_charges");
    calculate_taxes(frm);
}

function calculate_taxes(frm) {
    let added = 0;
    let deducted = 0;

    (frm.doc.purchase_taxes_and_charges || []).forEach(row => {
        let amt = row.tax_amount || 0;

        if (row.add_deduct_tax === "Add") {
            added += amt;
        } else if (row.add_deduct_tax === "Deduct") {
            deducted += amt;
        }
    });

    let total = added - deducted;
    console.log('total', total)

    frm.set_value("taxes_and_charges_added", added);
    frm.set_value("taxes_and_charges_deducted", deducted);
    frm.set_value("total_taxes_and_charges", total);

    let net_total = frm.doc.total_amount || 0;
    frm.set_value("grand_total", net_total + total);
}