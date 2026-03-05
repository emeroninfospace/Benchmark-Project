// Copyright (c) 2026, Emeron Infospace and contributors
// For license information, please see license.txt

frappe.ui.form.on("Project Schedule Child", {
    expected_start_date(frm, cdt, cdn) {
        calculate_total_work(cdt, cdn);
    },

    expected_end_date(frm, cdt, cdn) {
        calculate_total_work(cdt, cdn);
    }
});

function calculate_total_work(cdt, cdn) {
    let row = locals[cdt][cdn];

    if (row.expected_start_date && row.expected_end_date) {
        let days = frappe.datetime.get_day_diff(
            row.expected_end_date,
            row.expected_start_date
        );

        row.total_work = days + 1;
    } else {
        row.total_work = 0;
    }
}
