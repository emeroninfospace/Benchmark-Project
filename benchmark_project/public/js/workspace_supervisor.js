frappe.after_ajax(() => {
	const ALLOWED    = ['Task'];
	const WORKSPACE  = 'Projects';

	function is_restricted_supervisor() {
		return frappe.user.has_role('Supervisor')
			&& !frappe.user.has_role('System Manager')
			&& frappe.session.user !== 'Administrator';
	}

	function on_projects_workspace() {
		const route = frappe.get_route ? frappe.get_route() : [];
		return route[0] === 'Workspaces' && route[1] === WORKSPACE;
	}

	function apply_restrictions() {
		document.querySelectorAll('.widget.shortcut-widget-box').forEach(el => {
			const text = el.querySelector('.widget-title')?.textContent.trim() || '';
			if (!ALLOWED.some(a => text.startsWith(a))) {
				el.style.setProperty('display', 'none', 'important');
			}
		});

		document.querySelectorAll('.widget.links-widget-box').forEach(card => {
			let visible = 0;
			card.querySelectorAll('a.link-item').forEach(link => {
				const text = link.getAttribute('title')
					|| link.querySelector('.link-text')?.textContent.trim()
					|| '';
				if (!ALLOWED.some(a => text.startsWith(a))) {
					link.style.setProperty('display', 'none', 'important');
				} else {
					visible++;
				}
			});
			if (visible === 0) card.style.setProperty('display', 'none', 'important');
		});

		document.querySelectorAll('.widget.dashboard-widget-box, .widget.number_card_widget').forEach(el => {
			el.style.setProperty('display', 'none', 'important');
		});

		document.querySelectorAll('.btn-new-workspace, .btn').forEach(btn => {
			if (btn.textContent.trim() === 'New' || btn.textContent.includes('+ New')) {
				btn.style.setProperty('display', 'none', 'important');
			}
		});
	}

	function schedule_restrict(initial_delay) {
		setTimeout(function attempt(retries) {
			if (!is_restricted_supervisor() || !on_projects_workspace()) return;

			const has_widgets = document.querySelector(
				'.widget.shortcut-widget-box, .widget.links-widget-box'
			);

			if (has_widgets) {
				apply_restrictions();
			} else if (retries > 0) {
				setTimeout(() => attempt(retries - 1), 400);
			}
		}, initial_delay, 15);
	}

	frappe.router.on('change', () => schedule_restrict(300));
	schedule_restrict(600);
});
