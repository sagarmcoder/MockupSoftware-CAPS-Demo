USE MockupSoftware;
GO

CREATE OR ALTER VIEW dbo.vw_TimeEntryDetails
AS
SELECT te.TimeEntryId, te.EmployeeId, CONCAT(e.FirstName, ' ', e.LastName) AS EmployeeName,
       e.DepartmentId, d.DepartmentName, te.ProjectId, p.ProjectName, c.ClientName,
       te.StartTime, te.EndTime, te.HoursWorked, te.EntryStatus, te.IsBillable
FROM dbo.TimeEntries te
JOIN dbo.Employees e ON e.EmployeeId=te.EmployeeId
JOIN dbo.Departments d ON d.DepartmentId=e.DepartmentId
JOIN dbo.Projects p ON p.ProjectId=te.ProjectId
JOIN dbo.Clients c ON c.ClientId=p.ClientId;
GO
