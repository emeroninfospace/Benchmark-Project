import frappe

FULL_ACCESS_ROLES = {"System Manager", "Projects Manager"}
RESTRICTED_ROLES = {"Projects User", "Supervisor"}


def get_permission_query_conditions(user=None):
	"""Projects Users and Supervisors only see tasks they own or are assigned to."""
	user = user or frappe.session.user

	if user == "Administrator":
		return ""

	roles = set(frappe.get_roles(user))

	if roles & FULL_ACCESS_ROLES or not roles & RESTRICTED_ROLES:
		return ""

	# Escape the user id for SQL, and its LIKE wildcards (% and _) for the
	# `_assign` JSON-array match. LIKE also copes with an empty or NULL
	# `_assign`, where JSON_CONTAINS can fail on invalid JSON.
	like_user = user.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
	return "({owner} = {user} OR {assign} LIKE {pattern})".format(
		owner="`tabTask`.`owner`",
		assign="`tabTask`.`_assign`",
		user=frappe.db.escape(user),
		pattern=frappe.db.escape(f'%"{like_user}"%'),
	)
