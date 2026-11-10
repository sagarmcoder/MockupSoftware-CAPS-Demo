# SQLite Practice Track

The executable answer workspace is [`../../exercises/SQLITE_WORKBOOK.sql`](../../exercises/SQLITE_WORKBOOK.sql). It repeats the questions as SQL comments and provides a blank area below each prompt. Use this Markdown file only as a compact overview.

Use this file when working in DB Browser for SQLite. The business schema and data mirror the SQL Server sandbox, but SQLite syntax is not T-SQL.

## 1 — Explore and filter

1. Inspect every table and identify its primary and foreign keys.
2. Show active employees, sorted by hire date.
3. Find the ten most recently hired employees. SQLite uses `LIMIT`, not SQL Server's `TOP`.
4. Count employees by department.

## 2 — Group and join

5. Calculate approved hours by employee.
6. Show every employee and total hours, including employees with no entries.
7. Calculate approved billable hours by client for August 2026.
8. Find clients with no projects and projects with no time entries.

## 3 — Dates and payroll

9. Return entries in August using an inclusive lower and exclusive upper boundary.
10. Calculate shift duration from `StartTime` and `EndTime` using SQLite date functions.
11. Total approved hours by employee for each pay period.
12. Find overnight and incomplete shifts.

## 4 — Debugging

13. Diagnose a join that multiplies totals after adding project assignments.
14. Diagnose a `LEFT JOIN` accidentally changed by a `WHERE` condition.
15. Trace one value from a SQLite column through the API JSON into a React `<td>`.

## 5 — SQL Server comparison

After each solution, identify how it would differ in T-SQL. SQLite does not implement stored procedures, SQL Server `CONVERT` styles, `CROSS APPLY`, or `OUTER APPLY`. Use [`SQL_ADVANCED.md`](SQL_ADVANCED.md) and the files in [`../../database/`](../../database/) to study those SQL Server-specific topics separately.
