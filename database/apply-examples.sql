USE MockupSoftware;
GO

-- CROSS APPLY: only employees with approved hours in the selected period remain.
SELECT e.EmployeeId, dbo.fn_DisplayEmployeeName(e.EmployeeId) AS EmployeeName,
       totals.TotalHours, totals.DailyOvertimeHours
FROM dbo.Employees e
CROSS APPLY dbo.fn_EmployeeHoursForPeriod(e.EmployeeId, '2026-08-01', '2026-08-31') totals;

-- OUTER APPLY: every employee remains, even when no latest entry exists.
SELECT e.EmployeeId, dbo.fn_DisplayEmployeeName(e.EmployeeId) AS EmployeeName,
       latest.TimeEntryId, latest.StartTime, latest.ProjectName
FROM dbo.Employees e
OUTER APPLY (
    SELECT TOP (1) te.TimeEntryId, te.StartTime, p.ProjectName
    FROM dbo.TimeEntries te
    JOIN dbo.Projects p ON p.ProjectId = te.ProjectId
    WHERE te.EmployeeId = e.EmployeeId
    ORDER BY te.StartTime DESC, te.TimeEntryId DESC
) latest
ORDER BY e.EmployeeId;
GO
