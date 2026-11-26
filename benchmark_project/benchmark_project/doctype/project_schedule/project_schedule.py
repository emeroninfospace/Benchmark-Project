# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.desk.form import assign_to
from frappe.model.document import Document


class ProjectSchedule(Document):
	@frappe.whitelist()
	def create_tasks(self):
		"""Create a group task per BOQ template and a child task per scheduled item.

		Rows carry the BOQ item they schedule (``item_code``), so each row makes
		exactly one child task. A row without an item (a template-level row)
		expands to that template's items from the Bill of Quantity, once.
		"""
		if self.docstatus != 1:
			frappe.throw(_("Submit the Project Schedule before creating tasks"))

		if frappe.db.exists("Task", {"custom_project_schedule": self.name}):
			frappe.throw(_("Tasks already created for this Project Schedule"))

		boq_items = []
		if self.bill_of_quantity:
			boq_items = frappe.get_all(
				"Bill of Quantity Item",
				filters={"parent": self.bill_of_quantity, "parenttype": "Bill of Quantity"},
				fields=["item_code", "boq_template_id"],
				order_by="idx asc",
			)

		item_codes = {r.item_code for r in self.project_schedule_tasks if r.item_code}
		item_codes |= {r.item_code for r in boq_items if r.item_code}
		item_names = (
			dict(
				frappe.get_all(
					"Item", filters={"name": ["in", list(item_codes)]}, fields=["name", "item_name"], as_list=True
				)
			)
			if item_codes
			else {}
		)

		team_users = {}
		parent_tasks = {}
		expanded_templates = set()

		def users_for(team):
			if team not in team_users:
				team_users[team] = frappe.get_all(
					"Project Team Child",
					filters={"parent": team, "parenttype": "Project Team", "user": ["is", "set"]},
					pluck="user",
					order_by="idx asc",
				)
			return team_users[team]

		def make_child(row, subject, item_code=None):
			task = frappe.new_doc("Task")
			task.project = self.project
			task.subject = subject
			task.parent_task = parent_tasks[row.boq_template]
			task.custom_bill_of_quantity = self.bill_of_quantity
			task.custom_project_schedule = self.name
			task.exp_start_date = row.expected_start_date
			task.exp_end_date = row.expected_end_date
			task.description = row.description
			if item_code:
				task.custom_item_code = item_code
			task.insert(ignore_permissions=True)

			users = users_for(row.project_team) if row.project_team else []
			if users:
				assign_to.add(
					{"assign_to": users, "doctype": "Task", "name": task.name, "description": task.subject}
				)

		for row in self.project_schedule_tasks:
			if not row.boq_template:
				continue

			if row.boq_template not in parent_tasks:
				parent = frappe.new_doc("Task")
				parent.project = self.project
				parent.subject = row.boq_template
				parent.custom_bill_of_quantity = self.bill_of_quantity
				parent.custom_project_schedule = self.name
				parent.is_group = 1
				parent.insert(ignore_permissions=True)
				parent_tasks[row.boq_template] = parent.name

			if row.item_code:
				make_child(row, item_names.get(row.item_code) or row.description or row.item_code, row.item_code)
				continue

			template_items = [i for i in boq_items if i.item_code and i.boq_template_id == row.boq_template]
			if template_items:
				if row.boq_template in expanded_templates:
					continue
				expanded_templates.add(row.boq_template)
				for item in template_items:
					make_child(row, item_names.get(item.item_code) or item.item_code, item.item_code)
			else:
				make_child(row, row.description or row.boq_template)

		return len(parent_tasks)
