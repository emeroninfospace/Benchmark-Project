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
        
    }
});
