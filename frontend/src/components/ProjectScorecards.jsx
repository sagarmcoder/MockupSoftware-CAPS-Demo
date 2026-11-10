import { useEffect, useMemo, useState } from "react";

const number=(value)=>Number(value||0).toLocaleString(undefined,{maximumFractionDigits:1});

export default function ProjectScorecards(){
  const [projects,setProjects]=useState([]);
  const [status,setStatus]=useState("All");
  const [error,setError]=useState("");

  useEffect(()=>{
    fetch("/api/project-scorecards")
      .then((response)=>{if(!response.ok) throw new Error(`API returned ${response.status}`);return response.json();})
      .then((rows)=>{setProjects(rows);setError("");})
      .catch((requestError)=>setError(requestError.message));
  },[]);

  const statuses=useMemo(()=>["All",...new Set(projects.map((project)=>project.Status))],[projects]);
  const visible=status==="All"?projects:projects.filter((project)=>project.Status===status);

  return <section className="view-section" id="projects">
    <div className="section-heading">
      <div><span className="eyebrow">Delivery</span><h1>Project scorecards</h1><p>Workload, team coverage, and budget-hour signals from the existing synthetic database.</p></div>
      <label className="compact-search">Project status<select value={status} onChange={(event)=>setStatus(event.target.value)}>{statuses.map((option)=><option key={option}>{option}</option>)}</select></label>
    </div>
    {error?<p className="error card">Unable to load projects: {error}</p>:null}
    <div className="scorecard-grid project-grid">
      {visible.map((project)=>{
        const utilization=project.BudgetHours?Math.round((project.TotalHours/project.BudgetHours)*100):null;
        return <article className="scorecard project-card" key={project.ProjectId}>
          <div className="card-topline"><span>{project.ProjectCode}</span><span className={`project-status status-${project.Status.toLowerCase().replaceAll(" ","-")}`}>{project.Status}</span></div>
          <h2>{project.ProjectName}</h2>
          <p className="card-subtitle">{project.ClientName}</p>
          <div className="hours-hero"><strong>{number(project.TotalHours)}</strong><span>logged hours</span></div>
          <div className="progress-track" aria-label={utilization===null?"No hour budget":`${utilization}% of hour budget`}><span style={{width:`${Math.min(100,utilization||0)}%`}}/></div>
          <div className="mini-metrics">
            <div><strong>{number(project.BillableHours)}</strong><span>billable</span></div>
            <div><strong>{project.TeamSize}</strong><span>people</span></div>
            <div><strong>{project.OpenWorkItems}</strong><span>open items</span></div>
          </div>
          <div className="card-footer"><span>{project.BudgetHours?`${utilization}% of ${number(project.BudgetHours)}h budget`:"No hour budget"}</span><span>Last {project.LatestWorkDate||"—"}</span></div>
        </article>;
      })}
    </div>
  </section>;
}
