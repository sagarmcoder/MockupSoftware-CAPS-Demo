import {DatabaseSync} from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const file = path.resolve("database/mockup-practice.db");
const db = new DatabaseSync(file);
db.exec(fs.readFileSync("database/sqlite-schema.sql", "utf8"));

const day = (n) => new Date(Date.UTC(2026, 0, 1 + n));
const date = (d) => d.toISOString().slice(0, 10);
const stamp = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const departments = ["Engineering", "Client Services", "Finance", "Human Resources", "Operations", "Sales", "Quality Assurance", "Product"];
const roles = ["Junior Developer", "Software Developer", "Senior Developer", "Business Analyst", "Project Manager", "QA Analyst", "Accountant", "Support Specialist", "Sales Representative", "Product Manager", "Department Manager", "Administrator"];
const first = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Sam", "Avery", "Cameron", "Drew", "Robin"];
const last = ["Smith", "Jones", "Chen", "Patel", "Martin", "Brown", "Wilson", "Garcia", "Nguyen", "Lee", "Young", "Clark", "Lewis", "Walker"];

db.exec("BEGIN");
try {
  const dep = db.prepare("INSERT INTO Departments VALUES(?,?,?,1)");
  departments.forEach((name, i) => dep.run(i + 1, name, ["ENG", "CS", "FIN", "HR", "OPS", "SAL", "QA", "PROD"][i]));
  const role = db.prepare("INSERT INTO Roles VALUES(?,?,?)");
  roles.forEach((name, i) => role.run(i + 1, name, 38 + i * 4));
  const emp = db.prepare("INSERT INTO Employees VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let id = 1; id <= 84; id += 1) {
    const f = first[(id - 1) % 12];
    const l = last[(id * 3 - 1) % 14];
    const off = [11, 37, 68].includes(id);
    emp.run(id, `EMP${String(id).padStart(4, "0")}`, f, l, id % 9 === 0 ? `${f[0]}J` : null, id % 17 === 0 ? null : `${f}.${l}${id}@example.test`.toLowerCase(), ((id - 1) % 8) + 1, ((id * 5 - 1) % 12) + 1, id > 8 ? ((id - 1) % 8) + 1 : null, date(day(-id * 31)), off ? date(day(-id * 2)) : null, 48000 + (id % 11) * 4500, off ? 0 : 1);
  }
  const cli = db.prepare("INSERT INTO Clients VALUES(?,?,?,?,?,?)");
  for (let id = 1; id <= 24; id += 1) cli.run(id, `CLI${String(id).padStart(3, "0")}`, `Mockup Business Client ${id}`, [7, 18].includes(id) ? "Inactive" : id > 22 ? "Prospect" : "Active", id % 6 ? `billing${id}@client.test` : null, "2025-01-01 09:00:00");
  const proj = db.prepare("INSERT INTO Projects VALUES(?,?,?,?,?,?,?,?,?)");
  const projectStatuses = ["Active", "Completed", "On Hold", "Planned", "Cancelled"];
  for (let id = 1; id <= 58; id += 1) proj.run(id, ((id - 1) % 21) + 1, `PRJ-${String(id).padStart(4, "0")}`, `Mockup Business System ${id}`, projectStatuses[(id - 1) % 5], "2025-11-01", id % 5 === 2 ? "2026-08-01" : null, id % 10 ? 120 + (id % 8) * 80 : null, id % 6 ? 1 : 0);
  const wi = db.prepare("INSERT INTO WorkItems VALUES(?,?,?,?,?,?,?,?)");
  const workStatuses = ["Backlog", "In Progress", "Blocked", "Done"];
  const priorities = ["Low", "Normal", "High", "Urgent"];
  for (let id = 1; id <= 220; id += 1) wi.run(id, ((id * 5 - 1) % 55) + 1, `Work item ${id}`, workStatuses[(id - 1) % 4], priorities[(id * 3 - 1) % 4], id % 9 ? ((id * 13 - 1) % 80) + 1 : null, "2026-01-01 09:00:00", id % 4 === 0 ? "2026-08-01 17:00:00" : null);
  const pp = db.prepare("INSERT INTO PayPeriods VALUES(?,?,?,?,?,?)");
  for (let id = 1; id <= 18; id += 1) { const start = day((id - 1) * 14); pp.run(id, `PP-${date(start)}`, date(start), date(day((id - 1) * 14 + 13)), date(day((id - 1) * 14 + 18)), id < 18 ? "Closed" : "Open"); }
  const ts = db.prepare("INSERT INTO Timesheets VALUES(?,?,?,?,?,?,?)");
  const lookup = new Map();
  let timesheetId = 1;
  for (let employee = 1; employee <= 80; employee += 1) for (let period = 1; period <= 18; period += 1) if ((employee + period) % 11) { const status = ["Approved", "Approved", "Submitted", "Draft"][(employee + period) % 4]; ts.run(timesheetId, employee, period, status, status !== "Draft" ? "2026-08-01 17:00:00" : null, status === "Approved" ? "2026-08-02 09:00:00" : null, status === "Approved" ? ((employee - 1) % 8) + 1 : null); lookup.set(`${employee}-${period}`, timesheetId++); }
  const te = db.prepare("INSERT INTO TimeEntries VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
  const statuses = ["Approved", "Approved", "Approved", "Pending", "Rejected"];
  for (let id = 1; id <= 4200; id += 1) { const employee = ((id * 17 - 1) % 80) + 1; const project = ((id * 19 - 1) % 54) + 1; const d = day(id % 238); const start = new Date(d); start.setUTCHours(id % 97 === 0 ? 22 : 6 + (id % 7)); const hours = 6 + (id % 7) * 0.5; const incomplete = id % 113 === 0; const end = new Date(start.getTime() + hours * 3600000); const period = Math.floor((id % 238) / 14) + 1; te.run(id, lookup.get(`${employee}-${period}`) ?? null, employee, project, id % 5 ? ((id * 7 - 1) % 220) + 1 : null, stamp(start), incomplete ? null : stamp(end), incomplete ? null : hours, statuses[(id - 1) % 5], project % 6 ? 1 : 0, id % 12 ? `Synthetic work entry ${id}` : null, stamp(new Date(d.getTime() + 64800000))); }
  db.exec("COMMIT");
} catch (error) { db.exec("ROLLBACK"); throw error; }

console.log("SQLite database created:", file, db.prepare("SELECT COUNT(*) AS TimeEntries FROM TimeEntries").get());
db.close();
