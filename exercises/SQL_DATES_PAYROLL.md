# SQL Level 4 — Date, Time, and Payroll

Keep filtering logic separate from display formatting.

1. Return entries starting on September 1, 2026, regardless of time of day.
2. Return entries from August 2026 using a start-inclusive/end-exclusive range.
3. Calculate minutes and decimal hours between `StartTime` and `EndTime`. Decide how incomplete entries behave.
4. Find shifts that cross midnight.
5. Total approved hours per employee for each pay period.
6. Find the pay period containing `2026-08-18`.
7. Find the pay period immediately before the latest period.
8. Return entries from the last 30 days relative to `GETDATE()`.
9. Group approved hours by calendar day, then month, then year.
10. Identify entries longer than eight hours and calculate the amount above eight.
11. Compare stored `HoursWorked` with duration calculated from timestamps; show meaningful discrepancies.
12. Format `2026-09-21 14:35:42` as `2026-09-21`, `Sep 21, 2026`, and a 24-hour time. Keep the original value available for sorting.
13. Show total hours in the current open pay period.
14. Find employees who have approved entries but no approved timesheet in the same pay period.
15. Explain why `BETWEEN '2026-08-01' AND '2026-08-31'` is risky for a datetime column.

Targeted AI practice: if needed, ask AI only which SQL Server `CONVERT` style returns ISO `yyyy-mm-dd`, then apply that fact yourself.

