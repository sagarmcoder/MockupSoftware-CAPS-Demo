const baseUrl = process.env.API_URL || "http://localhost:3001";

const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
if (health.status !== "ok") throw new Error(`Health check failed: ${JSON.stringify(health)}`);

const result = await fetch(`${baseUrl}/api/time-entries?date=2026-08-26&page=1&pageSize=25`).then((response) => response.json());
if (!Array.isArray(result.items) || result.items.length === 0) throw new Error("No August 26 time-entry rows returned");
if (result.total < result.items.length || result.totalPages < 1) throw new Error(`Invalid pagination metadata: ${JSON.stringify(result)}`);

for (const field of ["TimeEntryId", "EmployeeName", "WorkDate", "HoursWorked"]) {
  if (!(field in result.items[0])) throw new Error(`Expected JSON field missing: ${field}`);
}

const summary = await fetch(`${baseUrl}/api/summary-dashboard`).then((response) => response.json());
if (!summary.metrics || !Array.isArray(summary.monthly) || summary.orchestration?.mcpToolCount !== 3) throw new Error("Summary dashboard incomplete or MCP orchestration state misstated");

const employees = await fetch(`${baseUrl}/api/employee-scorecards`).then((response) => response.json());
if (!Array.isArray(employees) || employees.length < 80) throw new Error("Employee scorecards missing");

const projects = await fetch(`${baseUrl}/api/project-scorecards`).then((response) => response.json());
if (!Array.isArray(projects) || projects.length < 50) throw new Error("Project scorecards missing");

const payroll = await fetch(`${baseUrl}/api/payroll-dashboard`).then((response) => response.json());
if (!payroll.period || !Array.isArray(payroll.employees) || !payroll.approval) throw new Error("Payroll dashboard incomplete");

console.log(`Smoke test passed: summary metrics, ${result.items.length} August 26 entries, ${employees.length} employee cards, ${projects.length} project cards, and ${payroll.employees.length} payroll cards.`);
