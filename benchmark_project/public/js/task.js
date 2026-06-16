frappe.ui.form.on('Task', {
 
	refresh(frm) {
		const is_supervisor    = frappe.user.has_role('Supervisor');
		const is_system_manager = frappe.user.has_role('System Manager');
		const is_admin          = frappe.session.user === 'Administrator';
 
		if (is_supervisor && !is_system_manager && !is_admin) {
			lock_fields_for_supervisor(frm);
		}
	}
});
 
 
 
function lock_fields_for_supervisor(frm) {
	const allowed_fields = ['status', 'progress'];
 
	frm.fields.forEach(field => {
		const fieldname = field.df.fieldname;
		const fieldtype = field.df.fieldtype;
 
		if (['Section Break', 'Column Break', 'Tab Break', 'HTML', 'Heading'].includes(fieldtype)) {
			return;
		}
 
		if (allowed_fields.includes(fieldname)) {
			frm.set_df_property(fieldname, 'read_only', 0);
		} else {
			frm.set_df_property(fieldname, 'read_only', 1);
		}
	});
 
	frm.refresh_fields();
 
	setTimeout(() => {
		frm.$wrapper.find('[data-action="assign"]').hide();
		frm.$wrapper.find('.assigned-users .avatar-group').css('pointer-events', 'none');
		frm.$wrapper.find('.form-assignments .btn').hide();
	}, 500);
}