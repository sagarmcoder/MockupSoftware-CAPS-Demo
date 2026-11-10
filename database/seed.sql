USE MockupSoftware;
GO

-- Reference data is intentionally recognizable while all people and businesses are fictional.
INSERT dbo.Departments (DepartmentName, CostCentreCode) VALUES
('Engineering','ENG'), ('Client Services','CS'), ('Finance','FIN'), ('Human Resources','HR'),
('Operations','OPS'), ('Sales','SAL'), ('Quality Assurance','QA'), ('Product','PROD');

INSERT dbo.Roles (RoleName, DefaultHourlyRate) VALUES
('Junior Developer',38), ('Software Developer',55), ('Senior Developer',78), ('Business Analyst',60),
('Project Manager',72), ('QA Analyst',48), ('Accountant',58), ('Support Specialist',42),
('Sales Representative',46), ('Product Manager',80), ('Department Manager',88), ('Administrator',40);

;WITH Numbers AS (
    SELECT TOP (84) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
    FROM sys.all_objects
), Names AS (
    SELECT n,
        CHOOSE(((n - 1) % 12) + 1, 'Alex','Jordan','Taylor','Morgan','Casey','Riley','Jamie','Sam','Avery','Cameron','Drew','Robin') AS FirstName,
        CHOOSE(((n * 3 - 1) % 14) + 1, 'Smith','Jones','Chen','Patel','Martin','Brown','Wilson','Garcia','Nguyen','Lee','Young','Clark','Lewis','Walker') AS LastName
    FROM Numbers
)
INSERT dbo.Employees
    (EmployeeNumber, FirstName, LastName, PreferredName, Email, DepartmentId, RoleId, HireDate, TerminationDate, AnnualSalary, IsActive)
SELECT
    CONCAT('EMP', RIGHT('0000' + CAST(n AS varchar(4)), 4)), FirstName, LastName,
    CASE WHEN n % 9 = 0 THEN CONCAT(LEFT(FirstName, 1), 'J') END,
    CASE WHEN n % 17 = 0 THEN NULL ELSE LOWER(CONCAT(FirstName, '.', LastName, n, '@example.test')) END,
    ((n - 1) % 8) + 1, ((n * 5 - 1) % 12) + 1,
    DATEADD(day, -(n * 31), CAST('2026-09-01' AS date)),
    CASE WHEN n IN (11, 37, 68) THEN DATEADD(day, -(n * 2), CAST('2026-09-01' AS date)) END,
    48000 + (n % 11) * 4500,
    CASE WHEN n IN (11, 37, 68) THEN 0 ELSE 1 END
FROM Names;

-- Add manager relationships after every employee exists.
UPDATE e SET ManagerEmployeeId = CASE WHEN e.EmployeeId > 8 THEN ((e.DepartmentId - 1) % 8) + 1 END
FROM dbo.Employees e;

INSERT dbo.UserAccounts (EmployeeId, UserName, LastLoginAt, IsLocked)
SELECT EmployeeId, LOWER(CONCAT(FirstName, '.', LastName, EmployeeId)),
       CASE WHEN EmployeeId % 13 = 0 THEN NULL ELSE DATEADD(day, -(EmployeeId % 30), CAST('2026-09-21T08:00:00' AS datetime2)) END,
       CASE WHEN EmployeeId % 29 = 0 THEN 1 ELSE 0 END
FROM dbo.Employees WHERE EmployeeId <= 78;

;WITH Numbers AS (
    SELECT TOP (24) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects
)
INSERT dbo.Clients (ClientCode, ClientName, Status, BillingEmail, CreatedAt)
SELECT CONCAT('CLI', RIGHT('000' + CAST(n AS varchar(3)),3)),
       CONCAT(CHOOSE(((n-1)%8)+1,'North','Prairie','Summit','Cedar','Aurora','River','Maple','Blue'), ' ',
              CHOOSE(((n*3-1)%6)+1,'Health','Logistics','Consulting','Utilities','Registry','Foods'), ' ', n),
       CASE WHEN n IN (7,18) THEN 'Inactive' WHEN n IN (23,24) THEN 'Prospect' ELSE 'Active' END,
       CASE WHEN n % 6 = 0 THEN NULL ELSE CONCAT('billing',n,'@client.test') END,
       DATEADD(month, -n, CAST('2026-09-01' AS datetime2))
FROM Numbers;

;WITH Numbers AS (
    SELECT TOP (58) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects
)
INSERT dbo.Projects (ClientId, ProjectCode, ProjectName, Status, StartDate, EndDate, BudgetHours, IsBillable)
SELECT ((n-1)%21)+1, CONCAT('PRJ-',RIGHT('0000'+CAST(n AS varchar(4)),4)), CONCAT('Business System ',n),
       CHOOSE(((n-1)%5)+1,'Active','Completed','On Hold','Planned','Cancelled'),
       DATEADD(day,-(n*5),CAST('2026-07-01' AS date)),
       CASE WHEN n%5=2 THEN DATEADD(day,90-(n*2),CAST('2026-07-01' AS date)) END,
       CASE WHEN n%10=0 THEN NULL ELSE 120+(n%8)*80 END,
       CASE WHEN n%6=0 THEN 0 ELSE 1 END
FROM Numbers;

;WITH Numbers AS (
    SELECT TOP (180) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects
)
INSERT dbo.ProjectAssignments (ProjectId, EmployeeId, AssignedAt, AllocationPercent)
SELECT ((n*7-1)%55)+1, ((n*11-1)%80)+1, DATEADD(day,-(n%240),CAST('2026-08-01' AS date)),
       CHOOSE(((n-1)%4)+1,25,50,75,100)
FROM Numbers
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.ProjectAssignments pa
    WHERE pa.ProjectId=((n*7-1)%55)+1 AND pa.EmployeeId=((n*11-1)%80)+1
);

;WITH Numbers AS (
    SELECT TOP (220) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects
)
INSERT dbo.WorkItems (ProjectId, Title, Status, Priority, AssignedEmployeeId, CreatedAt, CompletedAt)
SELECT ((n*5-1)%55)+1, CONCAT('Work item ',n),
       CHOOSE(((n-1)%4)+1,'Backlog','In Progress','Blocked','Done'),
       CHOOSE(((n*3-1)%4)+1,'Low','Normal','High','Urgent'),
       CASE WHEN n%9=0 THEN NULL ELSE ((n*13-1)%80)+1 END,
       DATEADD(day,-(n%250),CAST('2026-09-01' AS datetime2)),
       CASE WHEN n%4=0 THEN DATEADD(day,-(n%90),CAST('2026-09-10' AS datetime2)) END
FROM Numbers;

;WITH Periods AS (
    SELECT TOP (18) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n FROM sys.all_objects
)
INSERT dbo.PayPeriods (PeriodName, StartDate, EndDate, PayDate, Status)
SELECT CONCAT('PP-',CONVERT(char(10),DATEADD(day,n*14,CAST('2026-01-01' AS date)),23)),
       DATEADD(day,n*14,CAST('2026-01-01' AS date)),
       DATEADD(day,n*14+13,CAST('2026-01-01' AS date)),
       DATEADD(day,n*14+18,CAST('2026-01-01' AS date)),
       CASE WHEN n<17 THEN 'Closed' ELSE 'Open' END
FROM Periods;

-- Most employees have timesheets, but deliberate gaps make LEFT JOIN exercises meaningful.
INSERT dbo.Timesheets (EmployeeId, PayPeriodId, Status, SubmittedAt, ApprovedAt, ApprovedByEmployeeId)
SELECT e.EmployeeId, pp.PayPeriodId,
       CHOOSE(((e.EmployeeId+pp.PayPeriodId)%4)+1,'Approved','Approved','Submitted','Draft'),
       CASE WHEN (e.EmployeeId+pp.PayPeriodId)%4<>3 THEN DATEADD(hour,17,CAST(pp.EndDate AS datetime2)) END,
       CASE WHEN (e.EmployeeId+pp.PayPeriodId)%4 IN (0,1) THEN DATEADD(day,1,CAST(pp.EndDate AS datetime2)) END,
       CASE WHEN (e.EmployeeId+pp.PayPeriodId)%4 IN (0,1) THEN ((e.DepartmentId-1)%8)+1 END
FROM dbo.Employees e
CROSS JOIN dbo.PayPeriods pp
WHERE e.EmployeeId <= 80 AND (e.EmployeeId + pp.PayPeriodId) % 11 <> 0;

-- Generate ~4,000 entries across eight months. A few employees/projects intentionally have none.
;WITH Numbers AS (
    SELECT TOP (4200) ROW_NUMBER() OVER (ORDER BY a.object_id, b.object_id) AS n
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
), EntryBase AS (
    SELECT n,
       ((n*17-1)%80)+1 AS EmployeeId,
       ((n*19-1)%54)+1 AS ProjectId,
       DATEADD(day,(n%238),CAST('2026-01-01' AS datetime2)) AS WorkDay,
       6 + (n%7) AS StartHour,
       CAST(6.00 + (n%7)*0.50 AS decimal(6,2)) AS DurationHours
    FROM Numbers
)
INSERT dbo.TimeEntries
    (TimesheetId, EmployeeId, ProjectId, WorkItemId, StartTime, EndTime, HoursWorked, EntryStatus, IsBillable, Notes, CreatedAt)
SELECT ts.TimesheetId, eb.EmployeeId, eb.ProjectId,
       CASE WHEN eb.n%5=0 THEN NULL ELSE ((eb.n*7-1)%220)+1 END,
       DATEADD(hour,CASE WHEN eb.n%97=0 THEN 22 ELSE eb.StartHour END,eb.WorkDay),
       CASE WHEN eb.n%113=0 THEN NULL
            ELSE DATEADD(minute,CAST(eb.DurationHours*60 AS int),DATEADD(hour,CASE WHEN eb.n%97=0 THEN 22 ELSE eb.StartHour END,eb.WorkDay)) END,
       CASE WHEN eb.n%113=0 THEN NULL ELSE eb.DurationHours END,
       CHOOSE(((eb.n-1)%5)+1,'Approved','Approved','Approved','Pending','Rejected'),
       CASE WHEN eb.ProjectId%6=0 THEN 0 ELSE 1 END,
       CASE WHEN eb.n%12=0 THEN NULL ELSE CONCAT('Synthetic work entry ',eb.n) END,
       DATEADD(hour,18,eb.WorkDay)
FROM EntryBase eb
LEFT JOIN dbo.PayPeriods pp ON CAST(eb.WorkDay AS date) BETWEEN pp.StartDate AND pp.EndDate
LEFT JOIN dbo.Timesheets ts ON ts.EmployeeId=eb.EmployeeId AND ts.PayPeriodId=pp.PayPeriodId;
GO
