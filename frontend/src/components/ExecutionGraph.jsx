import {useEffect,useState} from "react";

const STATUS_LABELS = {
  completed: "Completed",
  running: "Processing",
  waiting: "Waiting for review",
  attention: "Needs clarification",
  blocked: "Policy blocked",
  failed: "System error",
  skipped: "Not reached",
  ready: "Ready"
};

const STATUS_ICONS = {
  completed: "✓",
  running: "…",
  waiting: "⏸",
  attention: "?",
  blocked: "×",
  failed: "!",
  skipped: "—",
  ready: "○"
};

const upper = (value) => String(value || "").toUpperCase();
const timingLabel = (stage) => String(stage || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const durationLabel = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const milliseconds = Number(value);
  return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(2)}s` : `${Math.round(milliseconds)}ms`;
};

function node(id, label, state, detail) {
  return { id, label, state, detail: detail || STATUS_LABELS[state] };
}

function resultState(result, { loading, error, source }) {
  const status = upper(result?.status);
  const decision = upper(result?.decision);
  const reviewStatus = upper(result?.review?.status);
  const executionEvidence = result?.executionEvidence || {};
  const toolCalls = Number(executionEvidence.toolCallCount || 0);
  const toolResults = Number(executionEvidence.toolResultCount || 0);
  const rejected = status === "REJECTED" || reviewStatus === "REJECTED" || decision === "REJECT";
  const resolved = status === "EXECUTED" || status === "REJECTED" || reviewStatus === "APPROVED" || reviewStatus === "REJECTED";
  const pending = !resolved && (status === "PENDING_REVIEW" || decision === "REVIEW_REQUIRED" || reviewStatus === "PENDING");
  const blocked = status === "BLOCKED" || decision === "BLOCK";
  const failed = Boolean(error) || ["FAILED", "ERROR", "RUNTIME_UNAVAILABLE"].includes(status);
  const clarification = status === "NEEDS_CLARIFICATION" || Boolean(result?.clarification);
  const executed = !failed && !rejected && !pending && !blocked && (
    status === "EXECUTED" ||
    upper(result?.executor) === "CALLED" ||
    toolCalls > 0 ||
    toolResults > 0
  );

  if (!result && loading) {
    return {
      nodes: [
        node("request", "Request received", "completed", "Input accepted"),
        node("intent", "Intent boundary", "running", source === "agent" ? "Local agent is interpreting" : "Preparing fixed plan"),
        node("mcp", "Capability routing", "running", source === "agent" ? "MCP route in progress" : "CAPS bridge in progress"),
        node("policy", "CAPS policy", "skipped", "Waiting for route evidence"),
        node("review", "Human review", "skipped", "No review state yet"),
        node("tool", "Payroll tool", "skipped", "Sink not called"),
        node("audit", "Trace and audit", "skipped", "Waiting for trace")
      ]
    };
  }

  if (!result && !loading && !error) {
    return {
      nodes: [
        node("request", "Request received", "ready", "Run a request to begin"),
        node("intent", "Intent boundary", "skipped", "Waiting for input"),
        node("mcp", "Capability routing", "skipped", "Waiting for input"),
        node("policy", "CAPS policy", "skipped", "Waiting for route evidence"),
        node("review", "Human review", "skipped", "Created only when required"),
        node("tool", "Payroll tool", "skipped", "Sink not called"),
        node("audit", "Trace and audit", "skipped", "Created when the route runs")
      ]
    };
  }

  if (!result && error) {
    return {
      nodes: [
        node("request", "Request received", "completed", "Input accepted"),
        node("intent", "Intent boundary", "completed", "Request reached the boundary"),
        node("mcp", "Capability routing", "failed", error),
        node("policy", "CAPS policy", "skipped", "Fail closed before policy execution"),
        node("review", "Human review", "skipped", "No review created"),
        node("tool", "Payroll tool", "skipped", "Sink not called"),
        node("audit", "Trace and audit", "failed", "Runtime failure recorded by the UI")
      ]
    };
  }

  const policyState = failed ? "failed" : blocked ? "blocked" : pending ? "waiting" : "completed";
  const reviewState = rejected ? "blocked" : pending ? (loading ? "running" : "waiting") : reviewStatus === "APPROVED" ? "completed" : "skipped";
  const toolState = failed ? "failed" : executed ? "completed" : "skipped";
  const tracePresent = Boolean(result?.artifacts?.trace || result?.artifacts?.traceGraph || result?.traceId || result?.runId || Object.keys(executionEvidence).length);

  return {
    nodes: [
      node("request", "Request received", "completed", result?.requestId ? `Request ${result.requestId}` : "Input accepted"),
      node("intent", "Intent boundary", failed ? "failed" : clarification ? "attention" : "completed", clarification ? "Clarification required before policy evaluation" : source === "agent" ? "Bounded intent produced" : "Fixed demo plan selected"),
      node("mcp", "Capability routing", failed ? "failed" : "completed", failed ? "MCP or bridge failed" : source === "agent" ? "Advertised capability routed" : "Server-owned capability routed"),
      node("policy", "CAPS policy", policyState, failed ? "No unsafe continuation" : blocked ? (result?.reasonCode || "Policy denied") : pending ? "Decision requires a human" : decision || "Policy decision recorded"),
      node("review", "Human review", reviewState, rejected ? "Reviewer rejected the action" : pending ? "Execution paused until approval" : reviewStatus === "APPROVED" ? "Reviewer approved the action" : "No review required"),
      node("tool", "Payroll tool", toolState, failed ? "Sink not called" : executed ? `${toolCalls || 1} call · ${toolResults || 1} result` : blocked || rejected || pending ? "Sink not called" : "No sink evidence"),
      node("audit", "Trace and audit", failed ? "failed" : loading ? "running" : tracePresent ? "completed" : "attention", failed ? "Runtime evidence incomplete" : tracePresent ? "Trace evidence available" : "Waiting for trace artifact")
    ]
  };
}

function applyLiveEvents(nodes,events){
  const latest=new Map();
  for(const event of events) latest.set(event.node_id,event);
  return nodes.map((item)=>{
    const event=latest.get(item.id);
    if(!event) return item;
    return {
      ...item,
      state:STATUS_LABELS[event.status]?event.status:item.state,
      detail:event.detail||item.detail
    };
  });
}

export default function ExecutionGraph({ result, source = "agent", loading = false, error = "", streamId = "" }) {
  const [liveEvents,setLiveEvents]=useState([]);
  const [streamState,setStreamState]=useState(streamId?"connecting":"idle");

  useEffect(()=>{
    setLiveEvents([]);
    if(!streamId||typeof EventSource==="undefined"){
      setStreamState(streamId?"unavailable":"idle");
      return undefined;
    }
    setStreamState("connecting");
    const eventSource=new EventSource(`/api/caps-guard/events/${encodeURIComponent(streamId)}`);
    const handleEvent=(message)=>{
      try{
        const event=JSON.parse(message.data);
        setLiveEvents((current)=>[...current,event]);
        setStreamState(event.terminal?"complete":"live");
        if(event.terminal) eventSource.close();
      }catch{
        setStreamState("unavailable");
      }
    };
    eventSource.addEventListener("caps.lifecycle",handleEvent);
    eventSource.onerror=()=>{
      if(eventSource.readyState!==EventSource.CLOSED) setStreamState("unavailable");
    };
    return ()=>{
      eventSource.removeEventListener("caps.lifecycle",handleEvent);
      eventSource.close();
    };
  },[streamId]);

  const baseGraph=resultState(result,{loading,error,source});
  const nodes=applyLiveEvents(baseGraph.nodes,liveEvents);
  const timing=result?.nativeTiming?.length?result.nativeTiming:result?.lifecycleTiming||result?.capsTiming||[];
  const visibleTiming=timing.length<=14?timing:[...timing.slice(0,5),...timing.slice(-9)];
  const traceId=result?.traceId||result?.runId||result?.requestId||streamId||"created when the route runs";
  const executionEvidence = result?.executionEvidence || {};
  const hasBlockingOutcome = nodes.some(({ state }) => state === "blocked");
  const hasFailure = nodes.some(({ state }) => state === "failed");

  return <section className="execution-graph" aria-label="CAPS Guard execution graph">
    <div className="execution-graph-heading">
      <div>
        <span className="eyebrow">Request path</span>
        <h3>Execution graph</h3>
        <p>CAPS Guard isolates the payroll sink from the agent’s request interpretation.</p>
      </div>
      <span className={`execution-graph-outcome ${hasFailure ? "is-failed" : hasBlockingOutcome ? "is-blocked" : "is-safe"}`}>
        {hasFailure ? "Runtime stopped" : hasBlockingOutcome ? "Execution contained" : "Boundary visible"}
      </span>
    </div>
    <ol className="execution-graph-nodes" aria-live="polite">
      {nodes.map((item, index) => <li className={`execution-graph-node execution-graph-node-${item.state}`} key={item.id}>
        <div className="execution-graph-node-marker" aria-label={`${item.label}: ${STATUS_LABELS[item.state]}`}>
          <span>{index + 1}</span>
          <strong>{STATUS_ICONS[item.state]}</strong>
        </div>
        <div className="execution-graph-node-copy">
          <strong>{item.label}</strong>
          <span>{STATUS_LABELS[item.state]}</span>
          <small title={item.detail}>{item.detail}</small>
        </div>
      </li>)}
    </ol>
    <div className="execution-graph-legend" aria-label="Execution graph legend">
      <span><i className="execution-legend-dot execution-legend-completed" />Completed</span>
      <span><i className="execution-legend-dot execution-legend-running" />Processing</span>
      <span><i className="execution-legend-dot execution-legend-blocked" />Policy blocked</span>
      <span><i className="execution-legend-dot execution-legend-failed" />System error</span>
    </div>
    {timing.length > 0 && <div className="execution-timing" aria-label="Execution timing">
      <div className="execution-timing-heading"><span>Timing</span><strong>{durationLabel(timing.at(-1)?.elapsed_ms ?? timing.at(-1)?.elapsedMs)} total</strong></div>
      <ol className="execution-timing-list">
        {visibleTiming.map((item, index) => <li key={`${item.stage}-${item.timestamp_ms || item.timestamp || index}`} title={item.timestamp || undefined}>
          <span>{timingLabel(item.stage)}</span>
          <small>{item.detail || item.status || "Recorded"}</small>
          <strong>+{durationLabel(item.delta_ms ?? item.deltaMs)}</strong>
        </li>)}
      </ol>
    </div>}
    <div className="execution-graph-footer">
      <span>Trace</span><strong title={traceId}>{traceId}</strong>
      <span>Sink evidence</span><strong>{executionEvidence.toolCallCount ?? "—"} calls · {executionEvidence.toolResultCount ?? "—"} results</strong>
      <span>Lifecycle</span><strong>{streamId ? `SSE ${streamState}` : "No active request"}</strong>
      <span>Control</span><strong>CAPS owns the decision; the agent cannot bypass this boundary.</strong>
    </div>
  </section>;
}
