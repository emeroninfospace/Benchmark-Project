// Copyright (c) 2025, Emeron Infospace and contributors
// For license information, please see license.txt

frappe.ui.form.on('Project', {
    refresh: function(frm) {
         setTimeout(() => {
        frm.remove_custom_button('Gantt Chart', 'View');
        }, 10);
        if (!frm.is_new()) {
            frm.add_custom_button(
                __("Project Schedule"),
                () => {
                    frappe.call({
                        method: "benchmark_project.events.project.create_project_schedule",
                        args: {
                            project: frm.doc.name
                        },
                        callback: function (r) {
                            if (r.message) {
                                frappe.set_route("Form", "Project Schedule", r.message);
                            }
                        }
                    });
                },
                __("Create")
            );
            frm.add_custom_button(
                __("Project Budget"),
                () => {
                    frappe.call({
                        method: "benchmark_project.events.project.make_project_budget",
                        args: {
                            project: frm.doc.name
                        },
                        callback: function (r) {
                            console.log(r);
                            if (r.message) {
                                frappe.set_route("Form", "Project Budget", r.message);
                            }
                        }
                    });
                },
                __("Create")
            );
            if (frm.doc.custom_boq_items) {
            frm.add_custom_button(__('Material Request'), function () {
                frappe.call({
                    method: 'benchmark_project.events.project.create_material_request',
                    args: {
                        name: frm.doc.name
                    },
                    callback: function (r) {
                        if (r.message) {
                            frappe.set_route("Form", "Material Request", r.message);
                        }
                    }
                });
            }, __("Create"));
        }
           

            const btn = frm.add_custom_button(
                __("Project Report"),
                () => {
                    frappe.set_route("query-report", "Project Wise", {
                        project: frm.doc.name
                    });
                },__('View'));
            $(btn).addClass("btn-primary");

            frm.add_custom_button(
					__("Gantt View"),
					function () {
						frappe.route_options = {
							project: frm.doc.name,
						};
						frappe.set_route("List", "Project", "Gantt");
					},
					__("View")
				);
        }
        frm.add_custom_button(__('Subcontract Work Order'), function() {
            create_subcontracting_order(frm);
        }, __('Create'));
        
        frm.add_custom_button(__('Subcontracting Receipt'), function() {
            create_subcontracting_receipt(frm);
        }, __('Create'));
        
    }
});



function create_subcontracting_order(frm) {
    frappe.new_doc('Subcontract Work Order', {
        'project': frm.doc.name,
        'company': frm.doc.company || frappe.defaults.get_default('company'),
        'transaction_date': frappe.datetime.nowdate()
    });
}

function create_subcontracting_receipt(frm) {
    frappe.new_doc('Subcontracting Receipt', {
        'project': frm.doc.name,
        'company': frm.doc.company || frappe.defaults.get_default('company'),
        'posting_date': frappe.datetime.nowdate()
    });
}