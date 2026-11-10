# Debugging solutions

1. Start from `Employees` and `LEFT JOIN` entries. Put entry-status filtering in the join condition or conditional aggregate, then `COALESCE` the result.
2. A right-side condition in `WHERE` removes the null-extended rows. Move the status condition into `ON`.
3. Use `StartTime >= '2026-08-01' AND StartTime < '2026-09-01'`.
4. Project assignments and time entries are two independent one-to-many sets. Joining both by employee multiplies rows. Aggregate entries before the assignment join, or omit the unrelated join.
5. `DATEDIFF` returns `NULL` for incomplete entries; integer division also removes fractions. Decide whether to preserve `NULL`, and divide by `60.0`.
6. Names are not identifiers. Select `EmployeeId` and do not use `DISTINCT` to hide an unexplained join or grain problem.
7. Add `ProjectId` to `GROUP BY` because the requested grain is employee plus project.

