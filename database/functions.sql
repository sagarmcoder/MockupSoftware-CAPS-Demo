USE MockupSoftware;
GO

CREATE OR ALTER FUNCTION dbo.fn_EmployeeHoursForPeriod
(
    @EmployeeId int,
    @StartDate date,
    @EndDate date
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        te.EmployeeId,
        CAST(COALESCE(SUM(te.HoursWorked), 0) AS decimal(10,2)) AS TotalHours,
        CAST(COALESCE(SUM(CASE WHEN te.HoursWorked > 8 THEN te.HoursWorked - 8 ELSE 0 END), 0) AS decimal(10,2)) AS DailyOvertimeHours
    FROM dbo.TimeEntries te
    WHERE te.EmployeeId = @EmployeeId
      AND te.EntryStatus = 'Approved'
      AND te.StartTime >= @StartDate
      AND te.StartTime < DATEADD(day, 1, @EndDate)
    GROUP BY te.EmployeeId
);
GO

CREATE OR ALTER FUNCTION dbo.fn_DisplayEmployeeName(@EmployeeId int)
RETURNS nvarchar(130)
AS
BEGIN
    DECLARE @Name nvarchar(130);
    SELECT @Name = CONCAT(COALESCE(PreferredName, FirstName), ' ', LastName)
    FROM dbo.Employees WHERE EmployeeId = @EmployeeId;
    RETURN @Name;
END;
GO
