# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.desk.form import assign_to


class ProjectSchedule(Document):

    def on_submit(self):
        self.create_tasks()

    def create_tasks(self):
        parent_tasks = {}

        for row in self.project_schedule_tasks:
            if not row.boq_template:
                continue


            if row.boq_template not in parent_tasks:
                parent_task = frappe.new_doc("Task")
                parent_task.project = self.project
                parent_task.subject = row.boq_template
                parent_task.custom_bill_of_quantity = self.bill_of_quantity
                parent_task.custom_project_schedule = self.name
                parent_task.is_group = 1  
                parent_task.insert(ignore_permissions=True)

                parent_tasks[row.boq_template] = parent_task.name
            else:
                parent_task = parent_tasks[row.boq_template]


            child_task = frappe.new_doc("Task")
            child_task.project = self.project
            child_task.subject = row.description
            child_task.parent_task = parent_task
            child_task.custom_bill_of_quantity = self.bill_of_quantity
            child_task.custom_project_schedule = self.name
            child_task.custom_item_code = row.item_code
            child_task.exp_start_date = row.expected_start_date
            child_task.exp_end_date = row.expected_end_date

            child_task.insert(ignore_permissions=True)


            if row.project_team:
                project_team = frappe.get_doc("Project Team", row.project_team)

                users = [
                    member.user
                    for member in project_team.employee_and_user
                    if member.user
                ]

                if users:
                    assign_to.add({
                        "assign_to": users,
                        "doctype": "Task",
                        "name": child_task.name,
                        "description": child_task.subject
                    })

