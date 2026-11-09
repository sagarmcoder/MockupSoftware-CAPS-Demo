import { useEffect, useMemo, useState } from "react";
import ExecutionGraph from "./ExecutionGraph";

const number=(value)=>Number(value||0).toLocaleString(undefined,{maximumFractionDigits:1});
const dateLabel=(value)=>value?new Date(`${value}T00:00:00`).toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"}):"—";
const createTraceId=(prefix)=>`${prefix}-${Date.now().toString(36)}-${globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2,12)}`;
const intentPrompts=Object.freeze({
  view_hours:"Show Sarah hours",
  change_rate:"Change Sarah hourly rate to $35",
  release_payment:"Release payment for Sarah"
});

export default function OperationsSummary(){
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  const [agentResult,setAgentResult]=useState(null);
  const [agentLoading,setAgentLoading]=useState("");
  const [agentError,setAgentError]=useState("");
  const [agentTraceId,setAgentTraceId]=useState("");

  useEffect(()=>{
    fetch("/api/summary-dashboard")
      .then((response)=>{if(!response.ok) throw new Error(`API returned ${response.status}`);return response.json();})
      .then((result)=>{setData(result);setError("");})
      .catch((requestError)=>setError(requestError.message));
  },[]);

  const maxMonth=useMemo(()=>Math.max(1,...(data?.monthly||[]).map((month)=>month.Hours)),[data]);

  const routeAgentIntent=async(intent)=>{
    const traceId=createTraceId("summary-agent");
    setAgentLoading(intent);
    setAgentError("");
    setAgentResult(null);
    setAgentTraceId(traceId);
    try{
      const response=await fetch("/api/mcp/local-agent",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt:intentPrompts[intent],trace_id:traceId})
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||`MCP agent returned ${response.status}`);
      setAgentTraceId(result.lifecycleTraceId||traceId);
      setAgentResult(result);
    }catch(requestError){setAgentError(requestError.message);}
    finally{setAgentLoading("");}
  };

  const resolveAgentReview=async(decision)=>{
    const reviewId=agentResult?.review?.reviewId;
    if(!reviewId) return;
    setAgentLoading(decision);
    setAgentError("");
    try{
      const response=await fetch(`/api/mcp/local-agent/reviews/${encodeURIComponent(reviewId)}/${decision}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trace_id:agentTraceId||agentResult.lifecycleTraceId})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||`MCP review returned ${response.status}`);
      setAgentTraceId(result.lifecycleTraceId||agentTraceId);
      setAgentResult(result);
    }catch(requestError){setAgentError(requestError.message);}
    finally{setAgentLoading("");}
  };

  if(error) return <section className="view-section"><p className="error card">Unable to load summary: {error}</p></section>;
  if(!data) return <section className="view-section"><p>Loading operational summary…</p></section>;
  const {metrics}=data;

  return <section className="view-section" id="summary">
    <div className="section-heading summary-heading">
      <div><span className="eyebrow">Operations overview</span><h1>Time administration command centre</h1><p>{dateLabel(metrics.FirstWorkDate)}–{dateLabel(metrics.LatestWorkDate)} · Synthetic SQLite operating record</p></div>
      <div className="summary-health"><span className="health-dot"/>API and database connected</div>
    </div>

    <div className="summary-kpis">
      <article><span>Total hours</span><strong>{number(metrics.TotalHours)}</strong><small>{number(metrics.BillableHours)} billable</small></article>
      <article><span>Approval rate</span><strong>{metrics.ApprovalRate}%</strong><small>{number(metrics.ApprovedHours)} approved hours</small></article>
      <article><span>Active employees</span><strong>{metrics.ActiveEmployeeCount}</strong><small>of {metrics.EmployeeCount} synthetic employees</small></article>
      <article><span>Active projects</span><strong>{metrics.ActiveProjectCount}</strong><small>of {metrics.ProjectCount} total projects</small></article>
      <article><span>Billable mix</span><strong>{metrics.BillableRate}%</strong><small>{metrics.OvertimeEntries} overtime entries</small></article>
    </div>

    <div className="summary-layout">
      <div className="summary-primary">
        <article className="summary-card workload-card">
          <div className="panel-heading"><div><span className="eyebrow">Eight-month trend</span><h2>Logged hours by month</h2></div><strong>{number(metrics.EntryCount)} entries</strong></div>
          <div className="month-bars">
            {data.monthly.map((month)=><div className="month-bar" key={month.Month}>
              <span>{new Date(`${month.Month}-01T00:00:00`).toLocaleDateString("en-CA",{month:"short"})}</span>
              <div><i style={{height:`${Math.max(8,month.Hours/maxMonth*100)}%`}}/></div>
              <strong>{number(month.Hours)}</strong>
            </div>)}
          </div>
        </article>

        <article className="summary-card">
          <div className="panel-heading"><div><span className="eyebrow">Recent activity</span><h2>Latest time entries</h2></div><span>Newest first</span></div>
          <div className="activity-list">
            {data.recentEntries.map((entry)=><div key={entry.TimeEntryId}>
              <span className={`activity-status status-${entry.EntryStatus.toLowerCase()}`}/>
              <div><strong>{entry.EmployeeName}</strong><span>{entry.RoleName} · {entry.ProjectCode}</span></div>
              <div><strong>{number(entry.HoursWorked)}h</strong><span>{dateLabel(entry.WorkDate)}</span></div>
            </div>)}
          </div>
        </article>
      </div>

      <aside className="summary-secondary">
        <article className="summary-card status-overview">
          <span className="eyebrow">Workflow</span><h2>Entry status</h2>
          {data.statuses.map((status)=><div className="status-line" key={status.Status}>
            <div><span className={`status status-${status.Status.toLowerCase()}`}>{status.Status}</span><strong>{status.Entries}</strong></div>
            <div className="status-track"><i style={{width:`${status.Entries/metrics.EntryCount*100}%`}}/></div>
            <small>{number(status.Hours)} hours</small>
          </div>)}
        </article>

        <article className="summary-card top-projects">
          <span className="eyebrow">Capacity</span><h2>Top projects by hours</h2>
          {data.topProjects.map((project,index)=><div key={project.ProjectCode}><span>{index+1}</span><div><strong>{project.ProjectName}</strong><small>{project.ProjectCode} · {project.TeamSize} people</small></div><strong>{number(project.Hours)}h</strong></div>)}
        </article>

        <article className="summary-card orchestration-card">
          <div className="orchestration-title"><div><span className="eyebrow">Agent readiness</span><h2>MCP orchestration</h2></div><span className="connected">Connected</span></div>
          <p>{data.orchestration.note}</p>
          <div className="tool-chips">{data.orchestration.proposedTools.map((tool)=><code key={tool}>{tool}</code>)}</div>
          <div className="agent-intent-actions">
            <button onClick={()=>routeAgentIntent("view_hours")} disabled={Boolean(agentLoading)}>{agentLoading==="view_hours"?"Checking…":"Ask for hours"}</button>
            <button onClick={()=>routeAgentIntent("change_rate")} disabled={Boolean(agentLoading)}>{agentLoading==="change_rate"?"Checking…":"Ask to change rate"}</button>
            <button onClick={()=>routeAgentIntent("release_payment")} disabled={Boolean(agentLoading)}>{agentLoading==="release_payment"?"Checking…":"Ask to release payment"}</button>
          </div>
          {agentLoading&&<p className="agent-progress" role="status">The local agent is contacting the official MCP server and CAPS Guard. A cold local start can take up to two minutes; the page remains responsive.</p>}
          {agentError&&<p className="error">{agentError}</p>}
          <ExecutionGraph result={agentResult} source="agent" loading={Boolean(agentLoading)} error={agentError} streamId={agentTraceId} />
          {agentResult&&<div className="agent-result" aria-live="polite">
            <strong>{agentResult.status||"RESULT"}</strong>
            <span>{agentResult.orchestration?.intent||agentResult.plan?.[0]?.intent||"bounded request"} → {agentResult.orchestration?.scenarioKey||agentResult.steps?.[0]?.scenarioKey||"server-owned scenario"} · {agentResult.decision||"—"} · sink {agentResult.executor||"NOT_CALLED"}</span>
            {agentResult.status==="PENDING_REVIEW"&&<div className="agent-result-actions"><button onClick={()=>resolveAgentReview("approve")} disabled={Boolean(agentLoading)}>Approve</button><button onClick={()=>resolveAgentReview("reject")} disabled={Boolean(agentLoading)}>Reject</button></div>}
            {agentResult.artifacts?.trace&&<a href={agentResult.artifacts.trace} target="_blank" rel="noreferrer">Open trace.json</a>}
          </div>}
          <div className="orchestration-footer"><span>Boundary</span><strong>{data.orchestration.boundary}</strong><span>Live tools</span><strong>{data.orchestration.mcpToolCount}</strong></div>
        </article>
      </aside>
    </div>
  </section>;
}
