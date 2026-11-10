# SQL Level 5 — Advanced T-SQL

1. Use `CASE` to label entry lengths as Short, Standard, or Overtime.
2. Use a CTE to find employees whose approved August hours exceed the August average per employee.
3. Use `EXISTS` to find employees with approved time; use `NOT EXISTS` to find those without any time.
4. Use a correlated subquery to show each employee's latest entry date.
5. Rank employees by approved hours within each department.
6. Number each employee's entries newest-first with `ROW_NUMBER()`.
7. Show entry hours plus a running approved-hours total per employee.
8. Return the latest time entry per employee. First choose between `ROW_NUMBER`, a correlated query, or `APPLY`, and explain your choice.
9. Use `CROSS APPLY` with `dbo.fn_EmployeeHoursForPeriod` for August. Explain which employees disappear and why.
10. Change Exercise 9 to `OUTER APPLY`. Explain the result difference.
11. Return each project and its most recent entry with `OUTER APPLY`, including projects with no entries.
12. Solve Exercise 11 with a window function and compare readability and behavior.

Targeted AI practice: if you forget syntax, ask for the signature of SQL Server `DATEADD` or `ROW_NUMBER`, not a solution to the prompt.

