// Copyright (c) 2026, Balaji B and contributors
// For license information, please see license.txt

frappe.ui.form.on("Subcontract Work Order", {
    refresh(frm) {

        if (!frm.doc.purchase_order && frm.doc.supplier) {

            frm.add_custom_button("Create Purchase Order", () => {
                frappe.call({
                    method: "benchmark_test.benchmark_test.doctype.subcontract_work_order.subcontract_work_order.create_purchase_order",
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
            });

        }

    }
});