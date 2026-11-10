# Frontend and full-stack solution notes

These are check points, not copy-paste completions.

- Layout rules are intentionally concentrated in `frontend/src/styles.css`. When changing sidebar width, update both the sidebar basis and the main-content calculation.
- New display fields follow the same path as existing fields: SQL alias → JSON property → component prop/value → table heading and cell.
- Department requires `Employees → Departments`; client requires `TimeEntries → Projects → Clients`.
- Business rules such as “approved only” usually belong closest to the data/API when every consumer needs the rule. A user-selectable view filter can remain a query parameter and be enforced in SQL.
- Date presentation belongs in the UI when only display changes; date range filtering should use real datetime boundaries in SQL.
- Use the browser Network panel to inspect the response before debugging JSX.

