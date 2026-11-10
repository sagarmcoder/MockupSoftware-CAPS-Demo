function SortButton({label, column, sortBy, sortDir, onSort}) {
  const active=sortBy===column;
  return <button type="button" className="sort-button" onClick={() => onSort(column)}>{label} {active?(sortDir==="asc"?"↑":"↓"):"↕"}</button>;
}

export default function TimeEntriesTable({ entries, loading, sortBy, sortDir, onSort, page, totalPages, onPageChange }) {
  if (loading) return <p>Loading time entries…</p>;

  const visibleHours=entries.reduce((sum,entry)=>sum+Number(entry.HoursWorked||0),0);
  const approved=entries.filter((entry)=>entry.EntryStatus==="Approved").length;
  const billable=entries.filter((entry)=>Number(entry.IsBillable)===1).length;
  const overtime=entries.filter((entry)=>Number(entry.HoursWorked)>8).length;
  const dateLabel=(value)=>value?new Date(`${value}T00:00:00`).toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"}):"—";

  return (
    <section className="table-card" id="time-entries">
      <div className="table-heading"><div><span className="eyebrow">Detailed record</span><h2>Time entries</h2></div><span>{entries.length} rows on this page</span></div>
      <div className="entry-strip">
        <div><span>Visible hours</span><strong>{visibleHours.toFixed(1)}</strong></div>
        <div><span>Approved</span><strong>{approved}</strong></div>
        <div><span>Billable</span><strong>{billable}</strong></div>
        <div><span>Overtime</span><strong>{overtime}</strong></div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th><SortButton label="Employee" column="EmployeeName" sortBy={sortBy} sortDir={sortDir} onSort={onSort}/></th><th><SortButton label="Work date" column="WorkDate" sortBy={sortBy} sortDir={sortDir} onSort={onSort}/></th><th><SortButton label="Project" column="ProjectName" sortBy={sortBy} sortDir={sortDir} onSort={onSort}/></th><th><SortButton label="Hours" column="HoursWorked" sortBy={sortBy} sortDir={sortDir} onSort={onSort}/></th><th>Billing</th><th><SortButton label="Status" column="EntryStatus" sortBy={sortBy} sortDir={sortDir} onSort={onSort}/></th><th>Work note</th></tr>
          </thead>
          <tbody>
            {entries.length===0 ? <tr><td colSpan="7" className="empty-state">No time entries match these filters.</td></tr> : entries.map((row) => (
              <tr key={row.TimeEntryId} className={Number(row.HoursWorked) > 8 ? "overtime" : ""}>
                <td><div className="table-primary">{row.EmployeeName}<span>{row.EmployeeNumber} · {row.RoleName}</span></div></td>
                <td><div className="table-primary">{dateLabel(row.WorkDate)}<span>Started {row.StartTime}</span></div></td>
                <td><div className="table-primary">{row.ProjectName}<span>{row.ProjectCode}</span></div></td>
                <td className="number hours-cell"><strong>{Number(row.HoursWorked).toFixed(1)}</strong><span>hours</span></td>
                <td><span className={`billing-pill ${Number(row.IsBillable)===1?"is-billable":"is-internal"}`}>{Number(row.IsBillable)===1?"Billable":"Internal"}</span></td>
                <td><span className={`status status-${row.EntryStatus.toLowerCase()}`}>{row.EntryStatus}</span></td>
                <td className="note-cell" title={row.Notes||"No note"}>{row.Notes||"—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination" aria-label="Time entry pages">
        <button type="button" disabled={page<=1} onClick={() => onPageChange(page-1)}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button type="button" disabled={page>=totalPages} onClick={() => onPageChange(page+1)}>Next</button>
      </div>
    </section>
  );
}
