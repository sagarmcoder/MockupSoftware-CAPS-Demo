import {randomUUID} from "node:crypto";

const MAX_TRACES=200;
const MAX_EVENTS_PER_TRACE=100;
const traces=new Map();
const subscribers=new Map();

function trimTraceStore(){
  while(traces.size>MAX_TRACES){
    const oldest=traces.keys().next().value;
    traces.delete(oldest);
  }
}

export function createCapsTraceId(candidate=null){
  if(typeof candidate==="string"&&/^[A-Za-z0-9._:-]{1,160}$/.test(candidate)) return candidate;
  return `caps-${Date.now().toString(36)}-${randomUUID().slice(0,12)}`;
}

function getTrace(traceId){
  if(!traces.has(traceId)){
    traces.set(traceId,{traceId,events:[],createdAt:new Date().toISOString(),startedAtMs:Date.now()});
    trimTraceStore();
  }
  return traces.get(traceId);
}

function writeEvent(response,event){
  response.write(`id: ${event.event_id}\nevent: caps.lifecycle\ndata: ${JSON.stringify(event)}\n\n`);
}

export function publishCapsLifecycle(traceId,{nodeId,status,detail=null,decision=null,reasonCode=null,terminal=false,source="caps-guard"}={}){
  const trace=getTrace(traceId);
  const timestampMs=Date.now();
  const previous=trace.events.at(-1);
  const event={
    event_id:randomUUID(),
    trace_id:traceId,
    node_id:nodeId,
    status,
    detail,
    decision,
    reason_code:reasonCode,
    source,
    timestamp:new Date(timestampMs).toISOString(),
    timestamp_ms:timestampMs,
    elapsed_ms:timestampMs-trace.startedAtMs,
    delta_ms:previous?Math.max(0,timestampMs-(previous.timestamp_ms||timestampMs)):0,
    terminal
  };
  trace.events.push(event);
  if(trace.events.length>MAX_EVENTS_PER_TRACE) trace.events.splice(0,trace.events.length-MAX_EVENTS_PER_TRACE);
  for(const response of subscribers.get(traceId)||[]){
    try{writeEvent(response,event);}catch{closeCapsEventStream(traceId,response);}
  }
  return event;
}

export function openCapsEventStream(traceId,response){
  const trace=getTrace(traceId);
  response.status(200);
  response.setHeader("Content-Type","text/event-stream");
  response.setHeader("Cache-Control","no-cache, no-transform");
  response.setHeader("Connection","keep-alive");
  response.setHeader("X-Accel-Buffering","no");
  response.flushHeaders?.();
  response.write("retry: 1000\n\n");
  for(const event of trace.events) writeEvent(response,event);
  if(!subscribers.has(traceId)) subscribers.set(traceId,new Set());
  subscribers.get(traceId).add(response);
  const heartbeat=setInterval(()=>{
    try{response.write(": heartbeat\n\n");}catch{closeCapsEventStream(traceId,response);}
  },15000);
  response.on("close",()=>{
    clearInterval(heartbeat);
    closeCapsEventStream(traceId,response);
  });
}

export function closeCapsEventStream(traceId,response){
  const listeners=subscribers.get(traceId);
  if(!listeners) return;
  listeners.delete(response);
  if(!listeners.size) subscribers.delete(traceId);
}

export function getCapsLifecycleTiming(traceId){
  const trace=traces.get(traceId);
  if(!trace) return [];
  const selected=new Map();
  for(const event of trace.events){
    const replace=event.node_id!="request"&&event.node_id!="intent"&&event.node_id!="mcp";
    if(replace||!selected.has(event.node_id)) selected.set(event.node_id,event);
  }
  return [...selected.values()].map((event)=>({
    stage:event.node_id,
    status:event.status,
    detail:event.detail,
    decision:event.decision,
    timestamp:event.timestamp,
    timestamp_ms:event.timestamp_ms,
    elapsed_ms:event.elapsed_ms,
    delta_ms:event.delta_ms,
    source:event.source
  }));
}

export function publishCapsRunLifecycle(traceId,result,{source="caps-guard"}={}){
  const status=String(result?.status||"").toUpperCase();
  const decision=String(result?.decision||"").toUpperCase()||null;
  const reviewStatus=String(result?.review?.status||"").toUpperCase();
  const calls=Number(result?.executionEvidence?.toolCallCount||0);
  const results=Number(result?.executionEvidence?.toolResultCount||0);
  const rejected=status==="REJECTED"||reviewStatus==="REJECTED"||decision==="REJECT";
  const resolved=status==="EXECUTED"||status==="REJECTED"||reviewStatus==="APPROVED"||reviewStatus==="REJECTED";
  const pending=!resolved&&(status==="PENDING_REVIEW"||decision==="REVIEW_REQUIRED"||reviewStatus==="PENDING_REVIEW");
  const blocked=status==="BLOCKED"||decision==="BLOCK";
  const failed=["FAILED","ERROR","RUNTIME_UNAVAILABLE"].includes(status);
  const clarification=status==="NEEDS_CLARIFICATION"||Boolean(result?.clarification);
  const executed=!failed&&!rejected&&!pending&&!blocked&&(String(result?.executor||"").toUpperCase()==="CALLED"||calls>0||results>0);

  publishCapsLifecycle(traceId,{nodeId:"request",status:"completed",detail:"Request accepted",source});
  publishCapsLifecycle(traceId,{nodeId:"intent",status:failed?"failed":clarification?"attention":"completed",detail:clarification?"Clarification required before policy evaluation":"Bounded intent produced",source});
  publishCapsLifecycle(traceId,{nodeId:"mcp",status:failed?"failed":"completed",detail:failed?"MCP or bridge failed":"Capability routed through the server boundary",source});
  publishCapsLifecycle(traceId,{nodeId:"policy",status:failed?"failed":blocked?"blocked":pending?"waiting":"completed",decision,reasonCode:result?.reasonCode||null,detail:failed?"No unsafe continuation":blocked?(result?.reasonCode||"Policy denied"):pending?"Decision requires a human":decision||"Policy decision recorded",source});
  publishCapsLifecycle(traceId,{nodeId:"review",status:rejected?"blocked":pending?"waiting":reviewStatus==="APPROVED"?"completed":"skipped",detail:rejected?"Reviewer rejected the action":pending?"Execution paused until approval":reviewStatus==="APPROVED"?"Reviewer approved the action":"No review required",source});
  publishCapsLifecycle(traceId,{nodeId:"tool",status:failed?"failed":executed?"completed":"skipped",detail:failed?"Sink not called":executed?`${calls||1} call · ${results||1} result`:"Sink not called",source});
  publishCapsLifecycle(traceId,{nodeId:"audit",status:failed?"failed":"completed",detail:failed?"Runtime evidence incomplete":"Trace evidence available",source,terminal:!pending&&!clarification});
}

export function publishCapsRunFailure(traceId,error,{source="caps-guard"}={}){
  const detail=error instanceof Error?error.message:String(error||"Unknown runtime error");
  publishCapsLifecycle(traceId,{nodeId:"mcp",status:"failed",detail,source});
  publishCapsLifecycle(traceId,{nodeId:"policy",status:"skipped",detail:"Fail closed before policy execution",source});
  publishCapsLifecycle(traceId,{nodeId:"review",status:"skipped",detail:"No review created",source});
  publishCapsLifecycle(traceId,{nodeId:"tool",status:"skipped",detail:"Sink not called",source});
  publishCapsLifecycle(traceId,{nodeId:"audit",status:"failed",detail,source,terminal:true});
}
