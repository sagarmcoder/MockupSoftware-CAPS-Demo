import { useEffect, useMemo, useState } from "react";

const number=(value)=>Number(value||0).toLocaleString(undefined,{maximumFractionDigits:1});

export default function EmployeeScorecards(){
  const [employees,setEmployees]=useState([]);
  const [query,setQuery]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    fetch("/api/employee-scorecards")
      .then((response)=>{if(!response.ok) throw new Error(`API returned ${response.status}`);return response.json();})
      .then((rows)=>{setEmployees(rows);setError("");})
      .catch((requestError)=>setError(requestError.message));
  },[]);

  const visible=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    if(!needle) return employees;
    return employees.filter((employee)=>`${employee.EmployeeName} ${employee.RoleName} ${employee.DepartmentName}`.toLowerCase().includes(needle));
  },[employees,query]);

  return <section className="view-section" id="employees">
    <div className="section-heading">
      <div><span className="eyebrow">People</span><h1>Employee time scorecards</h1><p>Compact summaries calculated only from synthetic time entries.</p></div>
      <label className="compact-search">Find employee<input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Name, title, department"/></label>
    </div>
    {error?<p className="error card">Unable to load employees: {error}</p>:null}
    <div className="scorecard-grid employee-grid">
      {visible.map((employee)=><article className="scorecard employee-card" key={employee.EmployeeId}>
        <div className="card-topline"><span>{employee.EmployeeNumber}</span><span className={`availability ${employee.IsActive?"is-active":"is-inactive"}`}>{employee.IsActive?"Active":"Inactive"}</span></div>
        <h2>{employee.EmployeeName}</h2>
        <p className="card-title">{employee.RoleName}</p>
        <p className="card-subtitle">{employee.DepartmentName}</p>
        <div className="hours-hero"><strong>{number(employee.TotalHours)}</strong><span>total hours</span></div>
        <div className="mini-metrics">
          <div><strong>{number(employee.ApprovedHours)}</strong><span>approved</span></div>
          <div><strong>{number(employee.PendingHours)}</strong><span>pending</span></div>
          <div><strong>{employee.ProjectCount}</strong><span>projects</span></div>
        </div>
        <div className="card-footer"><span>{employee.EntryCount} entries</span><span>{employee.RejectedEntries} rejected</span><span>Last {employee.LatestWorkDate||"—"}</span></div>
      </article>)}
    </div>
  </section>;
}
