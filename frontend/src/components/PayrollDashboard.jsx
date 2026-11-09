import { useEffect, useState } from "react";
import ExecutionGraph from "./ExecutionGraph";

const money=(value)=>Number(value||0).toLocaleString("en-CA",{style:"currency",currency:"CAD"});
const number=(value)=>Number(value||0).toLocaleString(undefined,{maximumFractionDigits:1});
const createTraceId=(prefix)=>`${prefix}-${Date.now().toString(36)}-${globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2,12)}`;
const guardScenarios=[
  {key:"view_hours",label:"View hours",description:"Read approved time entries",tone:"allow"},
  {key:"change_rate",label:"Change rate",description:"Write action requiring review",tone:"review"},
  {key:"release_payment",label:"Release payment",description:"Irreversible action",tone:"block"}
];

export default function PayrollDashboard(){
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  const [guardResult,setGuardResult]=useState(null);
  const [guardLoading,setGuardLoading]=useState("");
  const [guardError,setGuardError]=useState("");
  const [guardTraceId,setGuardTraceId]=useState("");
  const [agentPrompt,setAgentPrompt]=useState("Change John's hourly rate to $35 per hour");
  const [agentResult,setAgentResult]=useState(null);
  const [agentLoading,setAgentLoading]=useState(false);
  const [agentError,setAgentError]=useState("");
  const [agentTraceId,setAgentTraceId]=useState("");

  useEffect(()=>{
    fetch("/api/payroll-dashboard")
      .then((response)=>{if(!response.ok) throw new Error(`API returned ${response.status}`);return response.json();})
      .then((result)=>{setData(result);setError("");})
      .catch((requestError)=>setError(requestError.message));
  },[]);

  const runGuardScenario=async(scenarioKey)=>{
    const traceId=createTraceId("guard");
    setGuardLoading(scenarioKey);
    setGuardError("");
    setGuardResult(null);
    setGuardTraceId(traceId);
    try{
      const response=await fetch(`/api/caps-guard/scenarios/${scenarioKey}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trace_id:traceId})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||`CAPS Guard returned ${response.status}`);
      setGuardTraceId(result.lifecycleTraceId||traceId);
      setGuardResult(result);
    }catch(requestError){setGuardError(requestError.message);}
    finally{setGuardLoading("");}
  };

  const approveGuardReview=async()=>{
    const reviewId=guardResult?.review?.reviewId;
    if(!reviewId) return;
    setGuardLoading("approval");
    setGuardError("");
    try{
      const response=await fetch(`/api/caps-guard/reviews/${reviewId}/approve`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trace_id:guardTraceId||guardResult.lifecycleTraceId})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||`CAPS Guard returned ${response.status}`);
      setGuardTraceId(result.lifecycleTraceId||guardTraceId);
      setGuardResult(result);
    }catch(requestError){setGuardError(requestError.message);}
    finally{setGuardLoading("");}
  };

  const runLocalAgent=async()=>{
    const traceId=createTraceId("agent");
    setAgentLoading(true);
    setAgentError("");
    setAgentResult(null);
    setAgentTraceId(traceId);
    try{
      const response=await fetch("/api/mcp/local-agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:agentPrompt,trace_id:traceId})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||`Local agent returned ${response.status}`);
      setAgentTraceId(result.lifecycleTraceId||traceId);
      setAgentResult(result);
    }catch(requestError){setAgentError(requestError.message);}
    finally{setAgentLoading(false);}
  };

  const resolveLocalAgent=async(decision)=>{
    const reviewId=agentResult?.review?.reviewId;
    if(!reviewId) return;
    setAgentLoading(true);
    setAgentError("");
    try{
      const response=await fetch(`/api/mcp/local-agent/reviews/${encodeURIComponent(reviewId)}/${decision}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trace_id:agentTraceId||agentResult.lifecycleTraceId})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||`Local agent review returned ${response.status}`);
      setAgentTraceId(result.lifecycleTraceId||agentTraceId);
      setAgentResult(result);
    }catch(requestError){setAgentError(requestError.message);}
    finally{setAgentLoading(false);}
  };

  const selectLocalAgentEmployee=async(employeeId)=>{
    const sessionId=agentResult?.sessionId;
    if(!sessionId) return;
    setAgentLoading(true);
    setAgentError("");
    try{
      const response=await fetch(`/api/mcp/local-agent/sessions/${encodeURIComponent(sessionId)}/employee`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({employeeId,trace_id:agentTraceId||agentResult.lifecycleTraceId})
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||`Employee selection returned ${response.status}`);
      setAgentTraceId(result.lifecycleTraceId||agentTraceId);
      setAgentResult(result);
    }catch(requestError){setAgentError(requestError.message);}
    finally{setAgentLoading(false);}
  };

  if(error) return <section className="view-section"><p className="error card">Unable to load payroll: {error}</p></section>;
  if(!data) return <section className="view-section"><p>Loading synthetic payroll…</p></section>;

  return <section className="view-section" id="payroll">
    <div className="section-heading payroll-heading">
      <div><span className="eyebrow">Finance</span><h1>Payroll and project allocation</h1><p>{data.period.PeriodName} · {data.period.StartDate} to {data.period.EndDate} · Pay date {data.period.PayDate}</p></div>
      <span className="payroll-state">{data.approval.status}</span>
    </div>
    <div className="payroll-kpis">
      <article><span>Approved hours</span><strong>{number(data.totals.approvedHours)}</strong></article>
      <article><span>Estimated gross</span><strong>{money(data.totals.grossPay)}</strong></article>
      <article><span>CPP demo estimate</span><strong>{money(data.totals.cppEstimate)}</strong></article>
      <article><span>Before tax / EI</span><strong>{money(data.totals.netBeforeTax)}</strong></article>
    </div>
    <div className="payroll-layout">
      <div>
        <div className="subsection-title"><h2>Employee pay cards</h2><span>{data.employees.length} employees with approved hours</span></div>
        <div className="compact-card-list">
          {data.employees.map((employee)=><article className="pay-card" key={employee.EmployeeId}>
            <div><h3>{employee.EmployeeName}</h3><p>{employee.RoleName} · {employee.DepartmentName}</p></div>
            <div className="pay-hours"><strong>{number(employee.ApprovedHours)}h</strong><span>{employee.ProjectCount} projects</span></div>
            <div><span>Gross</span><strong>{money(employee.grossPay)}</strong></div>
            <div><span>CPP demo</span><strong>{money(employee.cppEstimate)}</strong></div>
          </article>)}
        </div>
      </div>
      <aside className="payroll-aside">
        <article className="approval-card">
          <span className="eyebrow">Synthetic approval</span><h2>Payroll authorization</h2>
          <div className="signature">{data.approval.signature}</div>
          <strong>{data.approval.signedBy}</strong><p>{data.approval.title}</p><p>Signed {data.approval.signedAt}</p>
        </article>
        <div className="subsection-title"><h2>Project allocation</h2><span>Approved labour</span></div>
        <div className="project-cost-list">
          {data.projects.slice(0,12).map((project)=><article key={project.ProjectId}>
            <div><strong>{project.ProjectName}</strong><span>{project.ProjectCode} · {project.EmployeeCount} people</span></div>
            <div><strong>{number(project.ApprovedHours)}h</strong><span>{money(project.EstimatedLabourCost)}</span></div>
          </article>)}
        </div>
      </aside>
    </div>
    <section className="guard-panel">
      <div className="guard-heading">
        <div><span className="eyebrow">Execution boundary</span><h2>CAPS Guard payroll scenarios</h2><p>Fixed server-owned plans produce native trace artifacts. Agent orchestration is separate.</p></div>
        <span className="guard-boundary-state">Bridge ready</span>
      </div>
      <div className="guard-scenario-grid">
        {guardScenarios.map((scenario)=><button className={`guard-scenario ${scenario.tone}`} key={scenario.key} onClick={()=>runGuardScenario(scenario.key)} disabled={Boolean(guardLoading)}>
          <strong>{scenario.label}</strong><span>{scenario.description}</span>
        </button>)}
      </div>
      {guardError&&<p className="error guard-error">{guardError}</p>}
      <ExecutionGraph result={guardResult} source="guard" loading={Boolean(guardLoading)} error={guardError} streamId={guardTraceId} />
      {guardResult&&<article className={`guard-result guard-result-${guardResult.status.toLowerCase()}`}>
        <div className="guard-result-topline"><div><span className="eyebrow">Structured trace result</span><h3>{guardResult.label}</h3></div><strong>{guardResult.status}</strong></div>
        <div className="guard-result-grid">
          <div><span>Decision</span><strong>{guardResult.decision||"—"}</strong></div>
          <div><span>Executor</span><strong>{guardResult.executor}</strong></div>
          <div><span>Tool</span><strong>{guardResult.tool}</strong></div>
          <div><span>Side effect</span><strong>{guardResult.sideEffectClass}</strong></div>
          <div><span>Reason</span><strong>{guardResult.reasonCode||"—"}</strong></div>
          <div><span>Rule</span><strong>{guardResult.ruleId||"—"}</strong></div>
        </div>
        <p className="guard-evidence">Trace evidence: {guardResult.executionEvidence.toolCallCount} tool call · {guardResult.executionEvidence.toolResultCount} tool result · exit code {guardResult.process.exitCode}</p>
        <div className="guard-actions">
          <a href={guardResult.artifacts.html} target="_blank" rel="noreferrer">Open rendered trace</a>
          <a href={guardResult.artifacts.trace} target="_blank" rel="noreferrer">Open trace.json</a>
          {guardResult.status==="PENDING_REVIEW"&&<button className="guard-approve" onClick={approveGuardReview} disabled={Boolean(guardLoading)}>Approve synthetic action</button>}
        </div>
        {guardResult.status==="PENDING_REVIEW"&&<p className="guard-note">No adapter call was made. Approval is optional for this demo; native prompt-mode HITL is not being used.</p>}
        {guardResult.review?.status==="APPROVED"&&<p className="guard-note">Server-owned review {guardResult.review.reviewId} approved the fixed plan; the trace proves the synthetic adapter call.</p>}
      </article>}
    </section>
    <section className="guard-panel local-agent-panel">
      <div className="guard-heading">
        <div><span className="eyebrow">Real MCP local path</span><h2>Ask the local payroll agent</h2><p>The bounded local agent chooses only advertised MCP capabilities. The MCP server routes them through CAPS Guard, which owns execution, review, and blocking.</p></div>
        <span className="guard-boundary-state">MCP stdio · CAPS Guard</span>
      </div>
      <div className="local-agent-form">
        <label htmlFor="agent-prompt">Natural-language request</label>
        <textarea id="agent-prompt" value={agentPrompt} maxLength="240" onChange={(event)=>setAgentPrompt(event.target.value)} rows="2" />
        <button className="guard-approve" onClick={runLocalAgent} disabled={agentLoading||!agentPrompt.trim()}>Run local agent</button>
      </div>
      {agentLoading&&<p className="agent-progress" role="status">The bounded agent is resolving the request through MCP and CAPS Guard. A cold local start can take several minutes on this machine; the page remains responsive.</p>}
      {agentError&&<p className="error guard-error">{agentError}</p>}
      <ExecutionGraph result={agentResult} source="agent" loading={agentLoading} error={agentError} streamId={agentTraceId} />
      {agentResult&&<article className={`guard-result guard-result-${String(agentResult.status||"").toLowerCase()}`}>
        <div className="guard-result-topline"><div><span className="eyebrow">MCP agent result</span><h3>{agentResult.tool||"Bounded payroll plan"}</h3></div><strong>{agentResult.status}</strong></div>
        <div className="guard-result-grid">
          <div><span>Decision</span><strong>{agentResult.decision||"—"}</strong></div>
          <div><span>Executor</span><strong>{agentResult.executor}</strong></div>
          <div><span>Tool</span><strong>{agentResult.tool||"—"}</strong></div>
          <div><span>Protocol</span><strong>{agentResult.agent?.protocol||"—"}</strong></div>
          <div><span>Plan steps</span><strong>{agentResult.plan?.length??"—"}</strong></div>
          <div><span>Trace calls</span><strong>{agentResult.executionEvidence?.toolCallCount??"—"}</strong></div>
        </div>
        <p className="guard-evidence">{agentResult.assistantMessage||"The agent cannot provide raw tool names, paths, approval flags, or arbitrary arguments. Server-owned mapping and CAPS trace evidence determine execution."}</p>
        {agentResult.clarification?.type==="AMBIGUOUS_EMPLOYEE"&&<div className="agent-result">
          <strong>Choose the employee before CAPS evaluates the payroll action</strong>
          {agentResult.clarification.candidates.map((candidate)=><button key={candidate.employeeId} onClick={()=>selectLocalAgentEmployee(candidate.employeeId)} disabled={agentLoading}>
            {candidate.employeeName} · {candidate.roleName} · {candidate.departmentName} · {candidate.employeeNumber}
          </button>)}
        </div>}
        {agentResult.steps?.length>1&&<div className="agent-result"><strong>Continuation</strong>{agentResult.steps.map((step,index)=><span key={`${step.runId||index}-${index}`}>Step {index+1}: {step.scenarioKey} · {step.status} · {step.decision||"—"} · sink {step.executor}</span>)}</div>}
        <div className="guard-actions">
          {agentResult.artifacts?.trace&&<a href={agentResult.artifacts.trace} target="_blank" rel="noreferrer">Open trace.json</a>}
          {agentResult.status==="PENDING_REVIEW"&&<><button className="guard-approve" onClick={()=>resolveLocalAgent("approve")} disabled={agentLoading}>Approve</button><button onClick={()=>resolveLocalAgent("reject")} disabled={agentLoading}>Reject</button></>}
        </div>
      </article>}
    </section>
    <p className="payroll-disclaimer">{data.disclaimer}</p>
  </section>;
}
