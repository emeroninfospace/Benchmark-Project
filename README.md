### Benchmark Project

Benchmark Project

### Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch develop
bench install-app benchmark_project
```

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/benchmark_project
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### CI

This app can use GitHub Actions for CI. The following workflows are configured:

- CI: Installs this app and runs unit tests on every push to `develop` branch.
- Linters: Runs [Frappe Semgrep Rules](https://github.com/frappe/semgrep-rules) and [pip-audit](https://pypi.org/project/pip-audit/) on every pull request.


### License

mit

### Dashboards

Three workspaces ship with the app, each topped by a live dashboard (a Custom HTML Block):

| Workspace | Block | Data endpoint |
|---|---|---|
| Accounting Dashboard | Accounting Overview | `benchmark_project.api.dashboard.get_accounting_dashboard` |
| Sales Dashboard | Sales Overview | `benchmark_project.api.dashboard.get_sales_dashboard` |
| Project Dashboard | Project Overview | `benchmark_project.api.dashboard.get_project_dashboard` |

Charts and styling live in `public/js/benchmark_dashboards.js`, loaded on demand by the dashboard blocks (not on every desk page). Responses are cached per user for 2 minutes; the refresh button fetches fresh data. All queries go through `frappe.get_list`, so role and user permissions apply; a card the user can't read shows a "no access" state. After pulling, run `bench migrate` (syncs the workspaces and HTML-block fixtures) and `bench build --app benchmark_project`.
