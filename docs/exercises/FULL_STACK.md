# Database-to-UI Exercises

For each exercise, first say where you think the change belongs and why. Inspect the actual API JSON in browser developer tools.

1. Display Employee Department in the time-entry table.
2. Display Client Name in each time-entry row.
3. Only display approved entries. Decide whether SQL, API, or frontend should own this rule.
4. Display each employee's total hours for the current open pay period.
5. Sort time entries by work date, newest first. Identify the current source of ordering.
6. Change the displayed date to a friendly form while preserving reliable filtering and sorting.
7. Add a start/end date filter that requests filtered API data.
8. Give overtime rows a more obvious visual treatment and define overtime precisely.
9. Add project status to the table.
10. Add a small employee dropdown populated from `/api/employees`, then filter entries by the selected employee.

## Data-flow debugging

### A — Blank cells

Temporarily change a cell to read `row.employee_name` even though the API returns `EmployeeName`. Trace the value from SQL alias through JSON to JSX and repair the mismatch.

### B — Wrong response shape

Temporarily change the API response to `{ results: result.recordset }` while React still assumes an array. Use the network panel and console error to locate the broken assumption. Decide which layer to change back.

### C — Duplicate rows

Join `ProjectAssignments` only by employee in the time-entry route. Observe the row count and identifiers, explain why the SQL changed the result grain, and repair it.

