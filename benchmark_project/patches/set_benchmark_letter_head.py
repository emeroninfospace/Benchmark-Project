"""Make the Benchmark Building Contracting letter head the one used everywhere.

Runs once on ``bench migrate``:
1. create the Letter Head from the app fixture if it is not there yet
   (patches run before fixtures are synced) and make it the default;
2. make it every Company's default letter head (new documents copy it);
3. repeat the header and footer on every PDF page (Print Settings);
4. point existing documents that store a different letter head at it, so
   old documents print with it too (blank ones already use the default).
"""

import frappe

from benchmark_project.letterhead import LETTER_HEAD_NAME


def execute():
	ensure_letter_head()

	if frappe.get_meta("Company").has_field("default_letter_head"):
		frappe.db.sql(
			"update `tabCompany` set default_letter_head = %s where ifnull(default_letter_head, '') != %s",
			(LETTER_HEAD_NAME, LETTER_HEAD_NAME),
		)

	frappe.db.set_single_value("Print Settings", "repeat_header_footer", 1)

	for doctype in doctypes_with_letter_head():
		frappe.db.sql(
			f"update `tab{doctype}` set letter_head = %s where ifnull(letter_head, '') not in ('', %s)",
			(LETTER_HEAD_NAME, LETTER_HEAD_NAME),
		)

	frappe.clear_cache()


def ensure_letter_head():
	if not frappe.db.exists("Letter Head", LETTER_HEAD_NAME):
		from frappe.core.doctype.data_import.data_import import import_doc

		import_doc(frappe.get_app_path("benchmark_project", "fixtures", "letter_head.json"))

	frappe.db.set_value("Letter Head", {"name": ["!=", LETTER_HEAD_NAME]}, "is_default", 0)
	frappe.db.set_value("Letter Head", LETTER_HEAD_NAME, {"is_default": 1, "disabled": 0})
	frappe.db.set_default("letter_head", LETTER_HEAD_NAME)
	frappe.db.set_default(
		"default_letter_head_content", frappe.db.get_value("Letter Head", LETTER_HEAD_NAME, "content")
	)


def doctypes_with_letter_head():
	"""Doctypes with a real `letter_head` Link column (standard or custom field)."""
	fields = frappe.get_all(
		"DocField",
		filters={"fieldname": "letter_head", "fieldtype": "Link", "options": "Letter Head"},
		pluck="parent",
	) + frappe.get_all(
		"Custom Field",
		filters={"fieldname": "letter_head", "fieldtype": "Link", "options": "Letter Head"},
		pluck="dt",
	)
	out = []
	for doctype in sorted(set(fields)):
		meta = frappe.get_meta(doctype)
		if meta.issingle or meta.is_virtual or not frappe.db.table_exists(doctype):
			continue
		if frappe.db.has_column(doctype, "letter_head"):
			out.append(doctype)
	return out
