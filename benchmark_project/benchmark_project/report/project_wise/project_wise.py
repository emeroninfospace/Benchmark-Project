# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

from collections import defaultdict
from datetime import datetime

import frappe


def execute(filters=None):
    filters = filters or {}

    columns = get_columns()
    data = []

    start_date = filters.get("start_date")
    end_date = filters.get("end_date")

    project_filters = {}
    if filters.get("project"):
        project_filters["name"] = filters["project"]

    if start_date and end_date:
        project_filters["expected_start_date"] = ["<=", end_date]
        project_filters["expected_end_date"] = [">=", start_date]
    elif start_date:
        project_filters["expected_end_date"] = [">=", start_date]
    elif end_date:
        project_filters["expected_start_date"] = ["<=", end_date]

    projects = frappe.get_all(
        "Project",
        filters=project_filters,
        fields=[
            "name",
            "project_name",
            "expected_start_date",
            "expected_end_date",
            "percent_complete" 
        ],
        order_by="name"
    )

    project_names = [p.name for p in projects]
    task_fields = ["name", "subject", "status", "priority", "progress", "exp_start_date", "exp_end_date"]

    # All top-level tasks for the listed projects, in one query.
    parent_filters = {"project": ["in", project_names], "parent_task": ["is", "not set"]}
    if filters.get("task"):
        parent_filters["name"] = filters["task"]
    parent_rows = frappe.get_all(
        "Task", filters=parent_filters, fields=[*task_fields, "project"], order_by="name"
    ) if project_names else []

    # All their direct children, in one query.
    parent_names = [t.name for t in parent_rows]
    child_rows = frappe.get_all(
        "Task", filters={"parent_task": ["in", parent_names]}, fields=[*task_fields, "parent_task"], order_by="name"
    ) if parent_names else []

    parents_by_project = defaultdict(list)
    for t in parent_rows:
        parents_by_project[t.project].append(t)
    children_by_parent = defaultdict(list)
    for t in child_rows:
        children_by_parent[t.parent_task].append(t)

    # Open assignments for every task shown, in one query; names only for users involved.
    assignees = defaultdict(list)
    task_names = parent_names + [t.name for t in child_rows]
    if task_names:
        for todo in frappe.get_all(
            "ToDo",
            filters={"reference_type": "Task", "reference_name": ["in", task_names], "status": "Open"},
            fields=["reference_name", "allocated_to"],
        ):
            assignees[todo.reference_name].append(todo.allocated_to)
    involved = {u for users in assignees.values() for u in users}
    user_map = dict(
        frappe.get_all("User", filters={"name": ["in", list(involved)]}, fields=["name", "full_name"], as_list=True)
    ) if involved else {}

    def assigned(task_name):
        users = assignees.get(task_name, [])
        return {
            "names": ", ".join(user_map.get(u) or u for u in users),
            "ids": ", ".join(users),
        }

    for project in projects:
        project_duration = calculate_duration(
            project.expected_start_date,
            project.expected_end_date
        )

        data.append({
            "name": project.name,
            "project_task": project.project_name,
            "parent": None,
            "indent": 0,
            "expected_start_date": project.expected_start_date,
            "expected_end_date": project.expected_end_date,
            "duration": project_duration,
            "progress": project.percent_complete,
        })

        for ptask in parents_by_project.get(project.name, []):
            assigned_users = assigned(ptask.name)

            data.append({
                "name": ptask.name,
                "project_task": ptask.subject,
                "parent": project.name,
                "indent": 1,
                "status": ptask.status,
                "priority": ptask.priority,
                "expected_start_date": ptask.exp_start_date or project.expected_start_date,
                "expected_end_date": ptask.exp_end_date or project.expected_end_date,
                "duration": calculate_duration(ptask.exp_start_date, ptask.exp_end_date),
                "progress": ptask.progress,
                "assigned_to": assigned_users["names"],
                "assigned_to_ids": assigned_users["ids"]
            })

            for ctask in children_by_parent.get(ptask.name, []):
                assigned_users = assigned(ctask.name)

                data.append({
                    "name": ctask.name,
                    "project_task": ctask.subject,
                    "parent": ptask.name,
                    "indent": 2,
                    "status": ctask.status,
                    "priority": ctask.priority,
                    "expected_start_date": ctask.exp_start_date or project.expected_start_date,
                    "expected_end_date": ctask.exp_end_date or project.expected_end_date,
                    "duration": calculate_duration(ctask.exp_start_date, ctask.exp_end_date),
                    "progress": ctask.progress,
                    "assigned_to": assigned_users["names"],
                    "assigned_to_ids": assigned_users["ids"]
                })

    return columns, data


def get_columns():
    return [
        {
            "label": "Project / Task",
            "fieldname": "project_task",
            "fieldtype": "Data",
            "width": 300
        },
        {
            "label": "Assigned To",
            "fieldname": "assigned_to",
            "fieldtype": "Data",
            "width": 200
        },
        {
            "label": "Expected Start Date",
            "fieldname": "expected_start_date",
            "fieldtype": "Date",
            "width": 150
        },
        {
            "label": "Expected End Date",
            "fieldname": "expected_end_date",
            "fieldtype": "Date",
            "width": 150
        },
        {
            "label": "Duration (Days)",
            "fieldname": "duration",
            "fieldtype": "Int",
            "width": 120
        },
        {
            "label": "Priority",
            "fieldname": "priority",
            "fieldtype": "Data",
            "width": 100
        },
        {
            "label": "Status",
            "fieldname": "status",
            "fieldtype": "Data",
            "width": 100
        },
        {
            "label": "Progress (%)",
            "fieldname": "progress",
            "fieldtype": "Percent",
            "width": 120
        }
    ]


def calculate_duration(start_date, end_date):
    if not start_date or not end_date:
        return 0
    
    try:
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, "%Y-%m-%d")
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, "%Y-%m-%d")
        
        delta = end_date - start_date
        return delta.days + 1 
    except Exception:
        return 0