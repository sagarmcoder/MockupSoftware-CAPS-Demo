// This array has the same shape as JSON an API could return.
const timeEntries = [
  { EmployeeName: "Alice Smith", WorkDate: "2026-09-01", HoursWorked: 8.5 },
  { EmployeeName: "Bob Jones", WorkDate: "2026-09-01", HoursWorked: 7.5 },
  { EmployeeName: "Alice Smith", WorkDate: "2026-09-02", HoursWorked: 9.0 },
];

const tableBody = document.querySelector("#time-entry-body");

timeEntries.forEach((entry) => {
  const row = document.createElement("tr");

  // textContent safely places each JSON property inside a <td>.
  [entry.EmployeeName, entry.WorkDate, entry.HoursWorked].forEach((value) => {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.appendChild(cell);
  });

  tableBody.appendChild(row);
});

