# SQL Level 6 — Debugging

Each query is broken or misleading. Diagnose it before editing it. State the expected grain of one output row.

## 1 — Missing employees

```sql
SELECT e.EmployeeId, SUM(te.HoursWorked) AS TotalHours
FROM dbo.Employees e
JOIN dbo.TimeEntries te ON te.EmployeeId = e.EmployeeId
GROUP BY e.EmployeeId;
```

Requirement: include employees who never submitted time.

## 2 — LEFT JOIN surprise

```sql
SELECT e.EmployeeId, ts.Status
FROM dbo.Employees e
LEFT JOIN dbo.Timesheets ts ON ts.EmployeeId = e.EmployeeId
WHERE ts.Status = 'Approved';
```

Requirement: keep every employee and show approved timesheets when present.

## 3 — Date boundary

```sql
SELECT * FROM dbo.TimeEntries
WHERE StartTime BETWEEN '2026-08-01' AND '2026-08-31';
```

Requirement: include every August entry.

## 4 — Inflated payroll

```sql
SELECT e.EmployeeId, SUM(te.HoursWorked) AS Hours
FROM dbo.Employees e
JOIN dbo.ProjectAssignments pa ON pa.EmployeeId = e.EmployeeId
JOIN dbo.TimeEntries te ON te.EmployeeId = e.EmployeeId
GROUP BY e.EmployeeId;
```

Requirement: one correct total per employee.

## 5 — NULL arithmetic

```sql
SELECT TimeEntryId, DATEDIFF(minute, StartTime, EndTime) / 60 AS Hours
FROM dbo.TimeEntries;
```

Requirement: preserve fractional hours and handle incomplete entries intentionally.

## 6 — Duplicate-looking employees

```sql
SELECT DISTINCT FirstName, LastName FROM dbo.Employees;
```

Requirement: one row per actual employee.

## 7 — Grouping error

```sql
SELECT EmployeeId, ProjectId, SUM(HoursWorked)
FROM dbo.TimeEntries
GROUP BY EmployeeId;
```

Requirement: total by employee and project.

