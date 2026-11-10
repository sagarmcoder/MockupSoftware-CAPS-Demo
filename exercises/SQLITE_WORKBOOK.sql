/*
  MOCKUP SOFTWARE — SQLITE QUERY WORKBOOK

  Database: ../database/mockup-practice.db

  In DB Browser for SQLite:
  1. Open database/mockup-practice.db.
  2. Open the Execute SQL tab.
  3. Open this SQLITE_WORKBOOK.sql file, or copy its contents into the editor.
  4. Write your answer inside the blank area below one question.
  5. Highlight only your query and click Execute selected SQL (the play button).
  6. Leave completed answers here so you can review your progress.

  Do not open exercises/solutions while working.
*/


/* ========================================================================== */
/* LEVEL 1 — SELECTING, FILTERING, AND SORTING                                */
/* ========================================================================== */

/* Exercise 1
   Show every column for every employee.
*/

-- Write Exercise 1 below:
SELECT * FROM Employees;


/* Exercise 2
   Show EmployeeNumber, FirstName, LastName, and HireDate for active employees.
*/

-- Write Exercise 2 below:

SELECT EmployeeNumber, FirstName, LastName, HireDate 
FROM Employees 
WHERE IsActive="1";

/* Exercise 3
   Find employees hired between January 1, 2024 and December 31, 2025.
*/

-- Write Exercise 3 below:
SELECT EmployeeNumber, FirstName, LastName, HireDate
FROM EMPLOYEES WHERE HireDate BETWEEN '2024-01-01' AND '2025-12-31';


/* Exercise 4
   Find employees whose last name begins with S or W.
*/

-- Write Exercise 4 below:
SELECT EmployeeNumber, FirstName, LastName
FROM Employees
WHERE LastName LIKE 'S%' OR LastName LIKE 'W%';


/* Exercise 5
   Show the 10 most recently hired employees.
   Remember: SQLite uses LIMIT rather than SQL Server TOP.
*/

-- Write Exercise 5 below:
SELECT FirstName, LastName , HireDate
FROM EMPLOYEES
ORDER BY  HireDate DESC 
 LIMIT 10 ;


/* Exercise 6
   List the distinct project statuses.
*/

-- Write Exercise 6 below:
SELECT DISTINCT Status 
FROM Projects ;

/* Exercise 7
   Find clients whose status is Active or Prospect, sorted by ClientName.
*/

-- Write Exercise 7 below:
SELECT ClientName, Status 
FROM Clients
WHERE Status NOT IN ('Inactive')
ORDER BY ClientName ASC;


/* Exercise 8
   Show active employees in departments 1, 3, or 5. Sort newest hire first.
*/

-- Write Exercise 8 below:
SELECT FirstName, LastName ,  Employees.DepartmentId , Employees.HireDate
FROM Employees 
WHERE Employees.DepartmentId IN (1,3,5) AND Employees.IsActive = 1
ORDER BY Employees.HireDate DESC ;


/* Exercise 9
   Return the total number of employees and the number of active employees.
*/

-- Write Exercise 9 below:



/* Exercise 10
   Count employees in each department. Show the department name, not only its ID.
*/

-- Write Exercise 10 below:



/* ========================================================================== */
/* LEVEL 2 — GROUPING AND AGGREGATION                                         */
/* ========================================================================== */

/* Exercise 11
   Calculate total approved hours per employee. Show employee ID and name.
*/

-- Write Exercise 11 below:



/* Exercise 12
   Show the average, minimum, and maximum completed time-entry duration.
*/

-- Write Exercise 12 below:



/* Exercise 13
   Calculate total billable hours per project.
*/

-- Write Exercise 13 below:



/* Exercise 14
   Calculate total approved hours per department.
*/

-- Write Exercise 14 below:



/* Exercise 15
   Calculate total approved billable hours per client.
*/

-- Write Exercise 15 below:



/* Exercise 16
   Count the distinct employees assigned to each project.
*/

-- Write Exercise 16 below:



/* Exercise 17
   Find employees with more than 120 approved hours during August 2026.
*/

-- Write Exercise 17 below:



/* Exercise 18
   Find projects with more than 200 total recorded hours.
*/

-- Write Exercise 18 below:



/* ========================================================================== */
/* LEVEL 3 — JOINS AND MISSING DATA                                           */
/* ========================================================================== */

/* Exercise 19
   Show each employee with their department and role names.
*/

-- Write Exercise 19 below:



/* Exercise 20
   Show every project with its client name.
*/

-- Write Exercise 20 below:



/* Exercise 21
   Show time entries with employee, project, and client names.
*/

-- Write Exercise 21 below:



/* Exercise 22
   Show every employee and their total approved hours, including employees who
   have never submitted a time entry. Employees without hours should show zero.
*/

-- Write Exercise 22 below:



/* Exercise 23
   Show every client and its project count, including clients with no projects.
*/

-- Write Exercise 23 below:



/* Exercise 24
   Find projects that have no time entries.
*/

-- Write Exercise 24 below:



/* Exercise 25
   List every work item and its assigned employee name. Keep unassigned items.
*/

-- Write Exercise 25 below:



/* Exercise 26
   Show employees assigned to more than one active project.
*/

-- Write Exercise 26 below:



/* ========================================================================== */
/* LEVEL 4 — DATES, TIMES, AND PAYROLL                                        */
/* ========================================================================== */

/* Exercise 27
   Return entries that started on August 1, 2026, regardless of time of day.
*/

-- Write Exercise 27 below:



/* Exercise 28
   Return every entry from August 2026 using an inclusive lower boundary and an
   exclusive upper boundary.
*/

-- Write Exercise 28 below:



/* Exercise 29
   Calculate the duration between StartTime and EndTime in minutes and decimal
   hours. Decide how incomplete entries should appear.
*/

-- Write Exercise 29 below:



/* Exercise 30
   Find shifts that cross midnight.
*/

-- Write Exercise 30 below:



/* Exercise 31
   Calculate total approved hours per employee for each pay period.
*/

-- Write Exercise 31 below:



/* Exercise 32
   Find the pay period containing August 18, 2026.
*/

-- Write Exercise 32 below:



/* Exercise 33
   Find the pay period immediately before the latest pay period.
*/

-- Write Exercise 33 below:



/* Exercise 34
   Group approved hours first by calendar day and then by calendar month.
   Write two separate queries.
*/

-- Write Exercise 34A (by day) below:



-- Write Exercise 34B (by month) below:



/* Exercise 35
   Identify entries longer than eight hours and calculate the overtime amount
   above eight hours.
*/

-- Write Exercise 35 below:



/* Exercise 36
   Compare stored HoursWorked with a duration calculated from StartTime and
   EndTime. Return entries with meaningful discrepancies.
*/

-- Write Exercise 36 below:



/* Exercise 37
   Find employees who have approved time entries but do not have an approved
   timesheet in the same pay period.
*/

-- Write Exercise 37 below:



/* ========================================================================== */
/* LEVEL 5 — SUBQUERIES, CTES, CASE, EXISTS, AND WINDOWS                     */
/* ========================================================================== */

/* Exercise 38
   Use CASE to label entry lengths as Short, Standard, or Overtime.
   Define the boundaries you chose.
*/

-- Write Exercise 38 below:



/* Exercise 39
   Use a CTE to find employees whose approved August hours exceed the August
   average total per employee.
*/

-- Write Exercise 39 below:



/* Exercise 40
   Use EXISTS to find employees with approved time entries.
*/

-- Write Exercise 40 below:



/* Exercise 41
   Use NOT EXISTS to find employees without any time entries.
*/

-- Write Exercise 41 below:



/* Exercise 42
   Show each employee's latest time-entry date using a correlated subquery.
   Keep employees who have no entries.
*/

-- Write Exercise 42 below:



/* Exercise 43
   Rank employees by approved hours within each department.
*/

-- Write Exercise 43 below:



/* Exercise 44
   Number each employee's time entries newest-first using ROW_NUMBER().
*/

-- Write Exercise 44 below:



/* Exercise 45
   Show every entry's hours plus a running approved-hours total per employee.
*/

-- Write Exercise 45 below:



/* Exercise 46
   Return each employee and their most recent time entry using a window function.
   Keep employees who have never submitted time.
*/

-- Write Exercise 46 below:



/* ========================================================================== */
/* LEVEL 6 — DEBUGGING                                                        */
/* ========================================================================== */

/* Exercise 47
   This query incorrectly removes employees who have never submitted time.
   Diagnose it and write a corrected query below.

   SELECT e.EmployeeId, SUM(te.HoursWorked) AS TotalHours
   FROM Employees e
   JOIN TimeEntries te ON te.EmployeeId = e.EmployeeId
   GROUP BY e.EmployeeId;
*/

-- Write corrected Exercise 47 below:



/* Exercise 48
   This WHERE condition defeats the purpose of the LEFT JOIN. Correct it while
   keeping every employee and showing approved timesheets when present.

   SELECT e.EmployeeId, ts.Status
   FROM Employees e
   LEFT JOIN Timesheets ts ON ts.EmployeeId = e.EmployeeId
   WHERE ts.Status = 'Approved';
*/

-- Write corrected Exercise 48 below:



/* Exercise 49
   This date filter may exclude timestamps on the final day. Write a safer query.

   SELECT * FROM TimeEntries
   WHERE StartTime BETWEEN '2026-08-01' AND '2026-08-31';
*/

-- Write corrected Exercise 49 below:



/* Exercise 50
   This query multiplies employee hours when an employee has multiple project
   assignments. Explain the output grain, then write a corrected query.

   SELECT e.EmployeeId, SUM(te.HoursWorked) AS Hours
   FROM Employees e
   JOIN ProjectAssignments pa ON pa.EmployeeId = e.EmployeeId
   JOIN TimeEntries te ON te.EmployeeId = e.EmployeeId
   GROUP BY e.EmployeeId;
*/

-- Write corrected Exercise 50 below:



/* ========================================================================== */
/* LEVEL 7 — SCHEMA EXPLORATION                                               */
/* ========================================================================== */

/* Exercise 51
   Management wants total approved billable hours per client for August 2026.
   Determine the required table path without being told which joins to use.
*/

-- Write Exercise 51 below:



/* Exercise 52
   Which employees logged time against inactive or cancelled projects?
*/

-- Write Exercise 52 below:



/* Exercise 53
   Which clients had activity during the pay period before the latest one?
*/

-- Write Exercise 53 below:



/* Exercise 54
   Which employees worked overtime but do not have an approved timesheet for
   the corresponding pay period?
*/

-- Write Exercise 54 below:



/* Exercise 55
   Which active clients have no active projects?
*/

-- Write Exercise 55 below:



/* Exercise 56
   Which projects exceed their hour budget, and by how much?
*/

-- Write Exercise 56 below:



/* Exercise 57
   Find incomplete entries and include enough employee, project, client, and
   date information for a manager to follow up.
*/

-- Write Exercise 57 below:



/* Exercise 58
   Produce a payroll-review dataset for one pay period containing employee,
   department, timesheet status, regular hours, overtime hours, and incomplete
   entry count. State the intended output grain before writing the query.
*/

-- Write Exercise 58 below:



/* END OF WORKBOOK — keep your attempted queries in this file. */
