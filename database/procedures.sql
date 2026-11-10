USE MockupSoftware;
GO

CREATE OR ALTER PROCEDURE dbo.usp_GetTimeEntries
    @StartDate date = NULL,
    @EndDate date = NULL,
    @Status varchar(20) = NULL,
    @Top int = 100
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@Top)
        te.TimeEntryId,
        CONCAT(e.FirstName, ' ', e.LastName) AS EmployeeName,
        CAST(te.StartTime AS date) AS WorkDate,
        te.StartTime,
        te.EndTime,
        te.HoursWorked,
        te.EntryStatus,
        p.ProjectName,
        c.ClientName
    FROM dbo.TimeEntries te
    JOIN dbo.Employees e ON e.EmployeeId = te.EmployeeId
    JOIN dbo.Projects p ON p.ProjectId = te.ProjectId
    JOIN dbo.Clients c ON c.ClientId = p.ClientId
    WHERE (@StartDate IS NULL OR te.StartTime >= @StartDate)
      AND (@EndDate IS NULL OR te.StartTime < DATEADD(day, 1, @EndDate))
      AND (@Status IS NULL OR te.EntryStatus = @Status)
    ORDER BY te.StartTime DESC, te.TimeEntryId DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_GetPayrollSummary
    @PayPeriodId int
AS
BEGIN
    SET NOCOUNT ON;

    SELECT e.EmployeeId, dbo.fn_DisplayEmployeeName(e.EmployeeId) AS EmployeeName,
           d.DepartmentName, pp.PeriodName, h.TotalHours, h.DailyOvertimeHours
    FROM dbo.Employees e
    JOIN dbo.Departments d ON d.DepartmentId = e.DepartmentId
    JOIN dbo.PayPeriods pp ON pp.PayPeriodId = @PayPeriodId
    CROSS APPLY dbo.fn_EmployeeHoursForPeriod(e.EmployeeId, pp.StartDate, pp.EndDate) h
    ORDER BY e.LastName, e.FirstName;
END;
GO
