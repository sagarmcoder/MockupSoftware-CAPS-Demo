USE MockupSoftware;
GO

-- Quick data checks after seeding.
SELECT 'Employees' AS Entity, COUNT(*) AS RowCount FROM dbo.Employees
UNION ALL SELECT 'Clients', COUNT(*) FROM dbo.Clients
UNION ALL SELECT 'Projects', COUNT(*) FROM dbo.Projects
UNION ALL SELECT 'TimeEntries', COUNT(*) FROM dbo.TimeEntries
UNION ALL SELECT 'PayPeriods', COUNT(*) FROM dbo.PayPeriods;

EXEC dbo.usp_GetTimeEntries @Status='Approved', @Top=5;
GO
