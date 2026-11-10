/*
  SPOILERS: representative solutions for self-checking only.
  Many prompts have several valid answers. Explain your own choice before comparing.
*/
USE MockupSoftware;
GO

-- Level 1 examples
SELECT * FROM dbo.Employees;
SELECT EmployeeNumber, FirstName, LastName, HireDate FROM dbo.Employees WHERE IsActive=1;
SELECT TOP (10) * FROM dbo.Employees ORDER BY HireDate DESC;
SELECT DepartmentId, COUNT(*) AS EmployeeCount FROM dbo.Employees GROUP BY DepartmentId;

-- Level 2 examples
SELECT EmployeeId, SUM(HoursWorked) AS ApprovedHours
FROM dbo.TimeEntries WHERE EntryStatus='Approved' GROUP BY EmployeeId;

SELECT c.ClientId, c.ClientName, SUM(te.HoursWorked) AS ApprovedBillableHours
FROM dbo.Clients c
JOIN dbo.Projects p ON p.ClientId=c.ClientId
JOIN dbo.TimeEntries te ON te.ProjectId=p.ProjectId
WHERE te.EntryStatus='Approved' AND te.IsBillable=1
GROUP BY c.ClientId, c.ClientName;

-- Level 3: preserve employees with no matching entry.
SELECT e.EmployeeId, CONCAT(e.FirstName,' ',e.LastName) AS EmployeeName,
       COALESCE(SUM(CASE WHEN te.EntryStatus='Approved' THEN te.HoursWorked ELSE 0 END),0) AS ApprovedHours
FROM dbo.Employees e
LEFT JOIN dbo.TimeEntries te ON te.EmployeeId=e.EmployeeId
GROUP BY e.EmployeeId,e.FirstName,e.LastName;

-- Level 4: start-inclusive/end-exclusive protects the entire final day.
SELECT * FROM dbo.TimeEntries
WHERE StartTime >= '2026-08-01' AND StartTime < '2026-09-01';

SELECT TimeEntryId,
       CAST(DATEDIFF(minute,StartTime,EndTime)/60.0 AS decimal(6,2)) AS CalculatedHours
FROM dbo.TimeEntries;

SELECT * FROM dbo.TimeEntries WHERE CAST(EndTime AS date)>CAST(StartTime AS date);

-- Level 5: latest related row per employee while preserving employees without rows.
SELECT e.EmployeeId, latest.TimeEntryId, latest.StartTime
FROM dbo.Employees e
OUTER APPLY (
  SELECT TOP (1) te.TimeEntryId,te.StartTime
  FROM dbo.TimeEntries te
  WHERE te.EmployeeId=e.EmployeeId
  ORDER BY te.StartTime DESC,te.TimeEntryId DESC
) latest;

-- Rank employees inside their departments.
WITH totals AS (
  SELECT e.EmployeeId,e.DepartmentId,COALESCE(SUM(te.HoursWorked),0) AS Hours
  FROM dbo.Employees e
  LEFT JOIN dbo.TimeEntries te ON te.EmployeeId=e.EmployeeId AND te.EntryStatus='Approved'
  GROUP BY e.EmployeeId,e.DepartmentId
)
SELECT *,RANK() OVER(PARTITION BY DepartmentId ORDER BY Hours DESC) AS DepartmentRank
FROM totals;

-- Exploration: approved billable client hours for August.
SELECT c.ClientId,c.ClientName,SUM(te.HoursWorked) AS Hours
FROM dbo.Clients c
JOIN dbo.Projects p ON p.ClientId=c.ClientId
JOIN dbo.TimeEntries te ON te.ProjectId=p.ProjectId
WHERE te.EntryStatus='Approved' AND te.IsBillable=1
  AND te.StartTime>='2026-08-01' AND te.StartTime<'2026-09-01'
GROUP BY c.ClientId,c.ClientName;
GO
