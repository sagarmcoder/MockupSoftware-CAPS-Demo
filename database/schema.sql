USE master;
GO

IF DB_ID(N'MockupSoftware') IS NULL
BEGIN
    CREATE DATABASE MockupSoftware;
END;
GO

USE MockupSoftware;
GO

-- Drop child tables first so this script can be rerun while practicing.
DROP TABLE IF EXISTS dbo.TimeEntries;
DROP TABLE IF EXISTS dbo.Timesheets;
DROP TABLE IF EXISTS dbo.ProjectAssignments;
DROP TABLE IF EXISTS dbo.WorkItems;
DROP TABLE IF EXISTS dbo.Projects;
DROP TABLE IF EXISTS dbo.Clients;
DROP TABLE IF EXISTS dbo.PayPeriods;
DROP TABLE IF EXISTS dbo.UserAccounts;
DROP TABLE IF EXISTS dbo.Employees;
DROP TABLE IF EXISTS dbo.Roles;
DROP TABLE IF EXISTS dbo.Departments;
GO

CREATE TABLE dbo.Departments (
    DepartmentId int IDENTITY(1,1) PRIMARY KEY,
    DepartmentName nvarchar(100) NOT NULL UNIQUE,
    CostCentreCode varchar(10) NOT NULL UNIQUE,
    IsActive bit NOT NULL CONSTRAINT DF_Departments_IsActive DEFAULT (1)
);

CREATE TABLE dbo.Roles (
    RoleId int IDENTITY(1,1) PRIMARY KEY,
    RoleName nvarchar(100) NOT NULL UNIQUE,
    DefaultHourlyRate decimal(10,2) NOT NULL CHECK (DefaultHourlyRate > 0)
);

CREATE TABLE dbo.Employees (
    EmployeeId int IDENTITY(1,1) PRIMARY KEY,
    EmployeeNumber varchar(12) NOT NULL UNIQUE,
    FirstName nvarchar(60) NOT NULL,
    LastName nvarchar(60) NOT NULL,
    PreferredName nvarchar(60) NULL,
    Email nvarchar(150) NULL,
    DepartmentId int NOT NULL REFERENCES dbo.Departments(DepartmentId),
    RoleId int NOT NULL REFERENCES dbo.Roles(RoleId),
    ManagerEmployeeId int NULL REFERENCES dbo.Employees(EmployeeId),
    HireDate date NOT NULL,
    TerminationDate date NULL,
    AnnualSalary decimal(12,2) NULL CHECK (AnnualSalary IS NULL OR AnnualSalary > 0),
    IsActive bit NOT NULL CONSTRAINT DF_Employees_IsActive DEFAULT (1),
    CONSTRAINT CK_Employees_Dates CHECK (TerminationDate IS NULL OR TerminationDate >= HireDate)
);

CREATE TABLE dbo.UserAccounts (
    UserAccountId int IDENTITY(1,1) PRIMARY KEY,
    EmployeeId int NOT NULL UNIQUE REFERENCES dbo.Employees(EmployeeId),
    UserName nvarchar(100) NOT NULL UNIQUE,
    LastLoginAt datetime2(0) NULL,
    IsLocked bit NOT NULL CONSTRAINT DF_UserAccounts_IsLocked DEFAULT (0)
);

CREATE TABLE dbo.Clients (
    ClientId int IDENTITY(1,1) PRIMARY KEY,
    ClientCode varchar(12) NOT NULL UNIQUE,
    ClientName nvarchar(150) NOT NULL,
    Status varchar(20) NOT NULL CHECK (Status IN ('Active', 'Inactive', 'Prospect')),
    BillingEmail nvarchar(150) NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_Clients_CreatedAt DEFAULT (SYSDATETIME())
);

CREATE TABLE dbo.Projects (
    ProjectId int IDENTITY(1,1) PRIMARY KEY,
    ClientId int NOT NULL REFERENCES dbo.Clients(ClientId),
    ProjectCode varchar(16) NOT NULL UNIQUE,
    ProjectName nvarchar(150) NOT NULL,
    Status varchar(20) NOT NULL CHECK (Status IN ('Planned', 'Active', 'On Hold', 'Completed', 'Cancelled')),
    StartDate date NOT NULL,
    EndDate date NULL,
    BudgetHours decimal(10,2) NULL CHECK (BudgetHours IS NULL OR BudgetHours >= 0),
    IsBillable bit NOT NULL,
    CONSTRAINT CK_Projects_Dates CHECK (EndDate IS NULL OR EndDate >= StartDate)
);

CREATE TABLE dbo.ProjectAssignments (
    ProjectId int NOT NULL REFERENCES dbo.Projects(ProjectId),
    EmployeeId int NOT NULL REFERENCES dbo.Employees(EmployeeId),
    AssignedAt date NOT NULL,
    AllocationPercent tinyint NULL CHECK (AllocationPercent BETWEEN 0 AND 100),
    PRIMARY KEY (ProjectId, EmployeeId)
);

CREATE TABLE dbo.WorkItems (
    WorkItemId int IDENTITY(1,1) PRIMARY KEY,
    ProjectId int NOT NULL REFERENCES dbo.Projects(ProjectId),
    Title nvarchar(200) NOT NULL,
    Status varchar(20) NOT NULL CHECK (Status IN ('Backlog', 'In Progress', 'Blocked', 'Done')),
    Priority varchar(10) NOT NULL CHECK (Priority IN ('Low', 'Normal', 'High', 'Urgent')),
    AssignedEmployeeId int NULL REFERENCES dbo.Employees(EmployeeId),
    CreatedAt datetime2(0) NOT NULL,
    CompletedAt datetime2(0) NULL
);

CREATE TABLE dbo.PayPeriods (
    PayPeriodId int IDENTITY(1,1) PRIMARY KEY,
    PeriodName varchar(30) NOT NULL UNIQUE,
    StartDate date NOT NULL,
    EndDate date NOT NULL,
    PayDate date NOT NULL,
    Status varchar(20) NOT NULL CHECK (Status IN ('Open', 'Processing', 'Closed')),
    CONSTRAINT CK_PayPeriods_Dates CHECK (EndDate >= StartDate AND PayDate >= EndDate)
);

CREATE TABLE dbo.Timesheets (
    TimesheetId int IDENTITY(1,1) PRIMARY KEY,
    EmployeeId int NOT NULL REFERENCES dbo.Employees(EmployeeId),
    PayPeriodId int NOT NULL REFERENCES dbo.PayPeriods(PayPeriodId),
    Status varchar(20) NOT NULL CHECK (Status IN ('Draft', 'Submitted', 'Approved', 'Rejected')),
    SubmittedAt datetime2(0) NULL,
    ApprovedAt datetime2(0) NULL,
    ApprovedByEmployeeId int NULL REFERENCES dbo.Employees(EmployeeId),
    CONSTRAINT UQ_Timesheets_EmployeePeriod UNIQUE (EmployeeId, PayPeriodId)
);

CREATE TABLE dbo.TimeEntries (
    TimeEntryId bigint IDENTITY(1,1) PRIMARY KEY,
    TimesheetId int NULL REFERENCES dbo.Timesheets(TimesheetId),
    EmployeeId int NOT NULL REFERENCES dbo.Employees(EmployeeId),
    ProjectId int NOT NULL REFERENCES dbo.Projects(ProjectId),
    WorkItemId int NULL REFERENCES dbo.WorkItems(WorkItemId),
    StartTime datetime2(0) NOT NULL,
    EndTime datetime2(0) NULL,
    HoursWorked decimal(6,2) NULL CHECK (HoursWorked IS NULL OR HoursWorked BETWEEN 0 AND 24),
    EntryStatus varchar(20) NOT NULL CHECK (EntryStatus IN ('Pending', 'Approved', 'Rejected')),
    IsBillable bit NOT NULL,
    Notes nvarchar(500) NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_TimeEntries_CreatedAt DEFAULT (SYSDATETIME()),
    CONSTRAINT CK_TimeEntries_EndAfterStart CHECK (EndTime IS NULL OR EndTime > StartTime)
);
GO

CREATE INDEX IX_TimeEntries_Employee_StartTime ON dbo.TimeEntries(EmployeeId, StartTime);
CREATE INDEX IX_TimeEntries_Project_Status ON dbo.TimeEntries(ProjectId, EntryStatus);
CREATE INDEX IX_Timesheets_Period_Status ON dbo.Timesheets(PayPeriodId, Status);
GO
