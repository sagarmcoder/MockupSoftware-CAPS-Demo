import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";
import {dirname, resolve} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const BACKEND_ROOT=dirname(fileURLToPath(import.meta.url));
const APP_ROOT=resolve(BACKEND_ROOT,"..");
const CAPS_ROOT=process.env.CAPS_ROOT||resolve(APP_ROOT,"..",".caps-tools","caps_guard_demo_prep");
// Prefer the isolated, verified demo runtime. The older 3.10 runtime can spend
// minutes importing LangChain on this machine before any Ollama request.
const DEFAULT_CAPS_PYTHONS=[
  resolve(CAPS_ROOT,".venv312","bin","python"),
  resolve(CAPS_ROOT,".venv310","bin","python"),
  resolve(APP_ROOT,"..",".caps-tools","caps_guard_public",".venv313","bin","python")
];
const CAPS_PYTHON=process.env.CAPS_PYTHON||DEFAULT_CAPS_PYTHONS.find((candidate)=>existsSync(candidate))||DEFAULT_CAPS_PYTHONS[0];
const MANIFEST_PATH=resolve(APP_ROOT,"caps","manifest_payroll.json");
// Keep deterministic direct mode as the app default. Native MCP is opt-in and
// uses the same isolated demo runtime when CAPS_NATIVE_TRANSPORT=mcp is set.
const NATIVE_TRANSPORT=process.env.CAPS_NATIVE_TRANSPORT||"direct";
const NATIVE_AGENT_SCRIPT=NATIVE_TRANSPORT==="direct"
  ? resolve(CAPS_ROOT,"scripts","payroll_agent_demo.py")
  : resolve(CAPS_ROOT,"scripts","payroll_agent_mcp_demo.py");
const RUNTIME_ROOT=resolve(APP_ROOT,"caps",".runtime");
const REVIEW_DB_PATH=process.env.CAPS_REVIEW_DB_PATH||resolve(RUNTIME_ROOT,"payroll_reviews.sqlite");
const NATIVE_CHECKPOINT_DB_PATH=process.env.CAPS_NATIVE_CHECKPOINT_DB_PATH||resolve(RUNTIME_ROOT,"native_langgraph.sqlite");
const MAX_OUTPUT_BYTES=64*1024;
// Cold Python/LangGraph imports can be slow on the demo machine. Keep a bounded
// process lifetime, but do not mistake a 60-second cold start for a policy result.
const PROCESS_TIMEOUT_MS=300_000;
const NATIVE_IMPORT_TIMEOUT_SECONDS=Number(process.env.CAPS_NATIVE_IMPORT_TIMEOUT_SECONDS||120);
const NATIVE_MCP_TIMEOUT_SECONDS=Number(process.env.CAPS_NATIVE_MCP_TIMEOUT_SECONDS||240);
const PLAN_HITL_WRAPPER=resolve(APP_ROOT,"caps","run_plan_hitl.py");
// The backend owns this token and passes it only to its child native runner.
// It is an in-process demo boundary, not a production authentication scheme.
export const NATIVE_INTERNAL_TOKEN=process.env.CAPS_NATIVE_INTERNAL_TOKEN||randomUUID();

const SCENARIOS=Object.freeze({
  view_hours:Object.freeze({
    key:"view_hours",
    label:"View approved hours",
    tool:"search_time_entries",
    sideEffectClass:"READ",
    planPath:resolve(APP_ROOT,"caps","plans","plan_payroll_read_hours.json")
  }),
  change_rate:Object.freeze({
    key:"change_rate",
    label:"Change hourly rate",
    tool:"change_hourly_rate",
    sideEffectClass:"WRITE",
    planPath:resolve(APP_ROOT,"caps","plans","plan_payroll_rate_change.json")
  }),
  release_payment:Object.freeze({
    key:"release_payment",
    label:"Release payroll payment",
    tool:"disburse_bank_payment",
    sideEffectClass:"IRREVERSIBLE",
    planPath:resolve(APP_ROOT,"caps","plans","plan_payroll_disbursement_block.json")
  })
});

const pendingReviews=new Map();
const completedRuns=new Map();

const LOCAL_AGENT_MAX_PROMPT=240;

function getScenario(scenarioKey){
  const scenario=SCENARIOS[scenarioKey];
  if(!scenario) throw new Error(`Unknown CAPS Guard scenario: ${scenarioKey}`);
  return scenario;
}

function loadPersistedPendingReview(reviewId){
  const database=new DatabaseSync(REVIEW_DB_PATH);
  try{
    const row=database.prepare(
      "SELECT status,state_json FROM caps_plan_reviews WHERE review_id = ?"
    ).get(reviewId);
    if(!row) throw new Error("Review ID is missing or unknown");
    if(row.status!=="PENDING") throw new Error(`Review is already resolved: ${row.status}`);
    const state=JSON.parse(row.state_json);
    const tool=state.sink_steps?.[0]?.tool_name;
    const scenario=Object.values(SCENARIOS).find((candidate)=>candidate.tool===tool);
    if(!scenario) throw new Error("Persisted review has no recognized payroll scenario");
    return {
      reviewId,
      scenarioKey:scenario.key,
      runId:state.run_id||null,
      createdAt:state.created_at_ms||Date.now()
    };
  }finally{
    database.close();
  }
}

function appendOutput(current,chunk){
  const next=`${current}${chunk}`;
  return next.length>MAX_OUTPUT_BYTES?next.slice(-MAX_OUTPUT_BYTES):next;
}

function runProcess(command,args,{cwd,env,timeoutMs=PROCESS_TIMEOUT_MS}={}){
  return new Promise((resolveProcess,rejectProcess)=>{
    const child=spawn(command,args,{cwd,env,shell:false,stdio:["ignore","pipe","pipe"]});
    let stdout="";
    let stderr="";
    let timedOut=false;
    let settled=false;
    const timer=setTimeout(()=>{
      timedOut=true;
      child.kill("SIGTERM");
    },timeoutMs);

    child.stdout.on("data",(chunk)=>{stdout=appendOutput(stdout,chunk.toString());});
    child.stderr.on("data",(chunk)=>{stderr=appendOutput(stderr,chunk.toString());});
    child.on("error",(error)=>{
      if(settled) return;
      settled=true;
      clearTimeout(timer);
      rejectProcess(error);
    });
    child.on("close",(code,signal)=>{
      if(settled) return;
      settled=true;
      clearTimeout(timer);
      resolveProcess({code,signal,timedOut,stdout,stderr});
    });
  });
}

async function readJson(path){
  return JSON.parse(await readFile(path,"utf8"));
}

function firstDecision(events,tool){
  const decisions=events.filter((event)=>event.event_type==="decision"&&event.tool_name===tool);
  return decisions.at(-1)||null;
}

function capsTiming(events,tool){
  const points=[];
  const decision=firstDecision(events,tool);
  const toolCall=events.find((event)=>event.event_type==="tool_call"&&event.tool_name===tool);
  const finalSummary=[...events].reverse().find((event)=>event.event_type==="final_summary");
  for(const [stage,event,detail] of [
    ["policy_decision",decision,decision?.payload?.decision||"Policy decision recorded"],
    ["sink_execution",toolCall,toolCall?"Sink/tool call recorded":"Sink not called"],
    ["terminal_audit",finalSummary,finalSummary?"Terminal trace summary recorded":"Trace not terminal"]
  ]){
    if(!event?.timestamp_ms) continue;
    points.push({
      stage,
      status:stage==="sink_execution"&&!toolCall?"skipped":"completed",
      detail,
      timestamp_ms:event.timestamp_ms,
      timestamp:event.timestamp||new Date(event.timestamp_ms).toISOString(),
      source:"caps-trace"
    });
  }
  const base=points[0]?.timestamp_ms||null;
  let previous=base;
  return points.map((point)=>({
    ...point,
    elapsed_ms:base===null?null:point.timestamp_ms-base,
    delta_ms:previous===null?null:point.timestamp_ms-previous
  })).map((point,index)=>{
    previous=point.timestamp_ms;
    return point;
  });
}

function normalizeTrace({scenario,runId,trace,processResult,approved,reviewDecision=null,input={}}){
  const events=Array.isArray(trace.events)?trace.events:[];
  const decisionEvent=firstDecision(events,scenario.tool);
  const decision=decisionEvent?.payload?.decision||null;
  const toolCalls=events.filter((event)=>event.event_type==="tool_call"&&event.tool_name===scenario.tool);
  const toolResults=events.filter((event)=>event.event_type==="tool_result"&&event.tool_name===scenario.tool);
  const successfulToolResult=toolResults.some((event)=>event.payload?.ok===true);
  const finalSummary=[...events].reverse().find((event)=>event.event_type==="final_summary");

  let status="FAILED";
  if(decision==="BLOCK") status="BLOCKED";
  else if(decision==="REVIEW_REQUIRED"&&!toolCalls.length) status="PENDING_REVIEW";
  else if(toolCalls.length&&successfulToolResult) status="EXECUTED";

  return {
    runId,
    scenarioKey:scenario.key,
    label:scenario.label,
    tool:scenario.tool,
    sideEffectClass:scenario.sideEffectClass,
    status,
    decision,
    executor:successfulToolResult?"CALLED":"NOT_CALLED",
    reasonCode:decisionEvent?.payload?.reason_code||null,
    ruleId:decisionEvent?.payload?.rule_id||null,
    traceId:trace.trace_id||decisionEvent?.trace_id||null,
    reviewDecision:reviewDecision||(approved?"approved":null),
    executionEvidence:{
      decisionEventCount:events.filter((event)=>event.event_type==="decision"&&event.tool_name===scenario.tool).length,
      toolCallCount:toolCalls.length,
      toolResultCount:toolResults.length,
      successfulToolResult,
      traceEventCount:events.length,
      finalSummary:finalSummary?.payload||null
    },
    capsTiming:capsTiming(events,scenario.tool),
    artifacts:{
      trace:`/api/caps-guard/runs/${runId}/trace.json`,
      traceGraph:`/api/caps-guard/runs/${runId}/trace_graph.json`,
      html:`/api/caps-guard/runs/${runId}/trace.html`
    },
    process:{
      exitCode:processResult.code,
      signal:processResult.signal,
      timedOut:processResult.timedOut
    },
    boundedInput:input
  };
}

function buildServerOwnedPlan(plan,scenario,input){
  const copy=JSON.parse(JSON.stringify(plan));
  const task=copy.task_graph?.tasks?.[0];
  if(!task) throw new Error(`Server-owned ${scenario.key} plan is malformed`);
  const params=task.params||{};
  if(input.employeeId) params.employee_id=input.employeeId;
  if(input.proposedRate!==undefined&&scenario.key==="change_rate") params.new_rate=input.proposedRate;
  task.params=params;
  if(input.employeeName) task.description=`${task.description||scenario.label} Synthetic employee label: ${input.employeeName}.`;
  return copy;
}

async function renderTrace({tracePath,htmlPath,title}){
  const result=await runProcess(
    CAPS_PYTHON,
    [
      "scripts/caps_guard.py","render-trace",
      "--trace",tracePath,
      "--output",htmlPath,
      "--title",title,
      "--format","json"
    ],
    {cwd:CAPS_ROOT,env:{...process.env}}
  );
  return result.code===0&&!result.timedOut;
}

async function executeScenario(scenario,{approved=false,reviewId=null,input={},reviewDecision=null}={}){
  const runId=`${Date.now().toString(36)}-${randomUUID().slice(0,8)}`;
  const outputDir=resolve(RUNTIME_ROOT,runId);
  const tracePath=resolve(outputDir,"trace.json");
  const htmlPath=resolve(outputDir,"trace.html");
  const actionLogPath=resolve(outputDir,"synthetic-actions.jsonl");
  await mkdir(outputDir,{recursive:true});

  let serverOwnedPlanPath=null;
  if(!reviewId){
    const basePlan=await readJson(scenario.planPath);
    serverOwnedPlanPath=resolve(outputDir,"server-owned-plan.json");
    await writeFile(serverOwnedPlanPath,JSON.stringify(buildServerOwnedPlan(basePlan,scenario,input),null,2));
  }

  const runnerArgs=reviewId
    ? [
      "resume",
      "--review-id",reviewId,
      "--sqlite-path",REVIEW_DB_PATH,
      "--output-dir",outputDir,
      "--decision",approved?"approve":"reject"
    ]
    : [
      "start",
      "--manifest",MANIFEST_PATH,
      "--plan",serverOwnedPlanPath,
      "--sqlite-path",REVIEW_DB_PATH,
      "--output-dir",outputDir
    ];

  let processResult;
  try{
    processResult=await runProcess(
      CAPS_PYTHON,
      [PLAN_HITL_WRAPPER,CAPS_ROOT,...runnerArgs],
      {cwd:CAPS_ROOT,env:{...process.env,CAPS_PAYROLL_ACTION_LOG:actionLogPath}}
    );
  }catch(error){
    throw new Error(`CAPS Guard process could not start: ${error.message}`);
  }

  let trace;
  try{
    trace=await readJson(tracePath);
  }catch(error){
    const detail=[
      processResult.stderr&&`stderr=${processResult.stderr}`,
      processResult.stdout&&`stdout=${processResult.stdout}`,
      `exitCode=${processResult.code}`,
      `signal=${processResult.signal}`,
      `timedOut=${processResult.timedOut}`,
      `traceReadError=${error.message}`
    ].filter(Boolean).join("; ");
    throw new Error(`CAPS Guard did not produce trace.json: ${detail}`);
  }

  const reviewArtifact=await readJson(resolve(outputDir,"result.json")).catch(()=>({}));
  const normalized=normalizeTrace({scenario,runId,trace,processResult,approved,reviewDecision,input});
  normalized.reviewId=reviewArtifact.review_id||null;
  if(reviewDecision==="reject") normalized.status="REJECTED";
  // Exit code is diagnostic only. The structured trace decides whether the
  // tool was blocked, paused, executed, or failed at the adapter boundary.
  if(processResult.timedOut) normalized.status="FAILED";
  if(processResult.code!==0 && normalized.status!=="EXECUTED" && normalized.status!=="BLOCKED" && normalized.status!=="REJECTED") normalized.status="FAILED";
  const rendered=await renderTrace({
    tracePath,
    htmlPath,
    title:`CAPS Guard Payroll Trace · ${scenario.label}`
  });
  if(!rendered) normalized.artifacts.html=null;

  const record={scenarioKey:scenario.key,outputDir,tracePath,htmlPath,normalized};
  completedRuns.set(runId,record);
  return normalized;
}

export function listCapsScenarios(){
  return Object.values(SCENARIOS).map(({planPath,...scenario})=>scenario);
}

export async function runCapsScenario(scenarioKey,input={}){
  const scenario=getScenario(scenarioKey);
  const result=await executeScenario(scenario,{input});
  if(result.status==="PENDING_REVIEW"){
    const reviewId=result.reviewId;
    if(!reviewId) throw new Error("CAPS Guard pending trace did not return a persisted review ID");
    pendingReviews.set(reviewId,{reviewId,scenarioKey,runId:result.runId,createdAt:Date.now()});
    result.review={reviewId,status:"PENDING_REVIEW"};
  }
  return result;
}

export async function resolveCapsReview(reviewId,decision="approve"){
  if(decision!=="approve"&&decision!=="reject") throw new Error("CAPS Guard review decision must be approve or reject");
  const pending=pendingReviews.get(reviewId)||loadPersistedPendingReview(reviewId);
  const scenario=getScenario(pending.scenarioKey);
  const result=await executeScenario(scenario,{approved:decision==="approve",reviewId,reviewDecision:decision});
  result.review={reviewId,status:decision==="approve"?"APPROVED":"REJECTED",previousRunId:pending.runId};
  pendingReviews.delete(reviewId);
  return result;
}

export async function approveCapsReview(reviewId){
  return resolveCapsReview(reviewId,"approve");
}

function nativeThreadId(reviewId){
  if(typeof reviewId!=="string"||!reviewId.startsWith("native:")) throw new Error("Unknown local-agent review ID");
  const threadId=reviewId.slice("native:".length);
  if(!threadId) throw new Error("Local-agent review ID has no thread ID");
  return threadId;
}

function parseNativeProcessResult(processResult){
  if(processResult.timedOut) throw new Error("Local Ollama agent timed out before returning a bounded result");
  if(processResult.code!==0) throw new Error(`Local Ollama agent failed: ${(processResult.stderr||processResult.stdout||"unknown error").trim()}`);
  try{return JSON.parse(processResult.stdout);}
  catch(error){throw new Error(`Local Ollama agent returned invalid runner output: ${error.message}`);}
}

async function runNativeAgentProcess({command,prompt,threadId,outputDir,decision}){
  const args=command==="start"
    ? [NATIVE_AGENT_SCRIPT,"start","--prompt",prompt,"--thread-id",threadId,"--sqlite-path",NATIVE_CHECKPOINT_DB_PATH,"--output-dir",outputDir,"--model","llama3.2:3b","--import-timeout-seconds",String(NATIVE_IMPORT_TIMEOUT_SECONDS)]
    : command==="resume"
      ? [NATIVE_AGENT_SCRIPT,"resume","--thread-id",threadId,"--sqlite-path",NATIVE_CHECKPOINT_DB_PATH,"--output-dir",outputDir,"--decision",decision,"--model","llama3.2:3b","--import-timeout-seconds",String(NATIVE_IMPORT_TIMEOUT_SECONDS)]
      : [NATIVE_AGENT_SCRIPT,"select","--thread-id",threadId,"--sqlite-path",NATIVE_CHECKPOINT_DB_PATH,"--output-dir",outputDir,"--employee-id",decision,"--model","llama3.2:3b","--import-timeout-seconds",String(NATIVE_IMPORT_TIMEOUT_SECONDS)];
  const processResult=await runProcess(
    CAPS_PYTHON,
    args,
    {cwd:CAPS_ROOT,env:{
      ...process.env,
      CAPS_ROOT,
      CAPS_PYTHON,
      CAPS_LIFECYCLE_REQUEST_STARTED_AT_MS:String(Date.now()),
      CAPS_REVIEW_DB_PATH:REVIEW_DB_PATH,
      CAPS_NATIVE_CHECKPOINT_DB_PATH:NATIVE_CHECKPOINT_DB_PATH,
      CAPS_PAYROLL_ACTION_LOG:resolve(outputDir,"synthetic-actions.jsonl"),
      CAPS_DEMO_APP_ROOT:APP_ROOT,
      // Keep one official MCP client/session in the long-lived backend. A
      // fresh Python resume process must not load the Node MCP SDK again.
      CAPS_NATIVE_MCP_URL:process.env.CAPS_NATIVE_MCP_URL||`http://127.0.0.1:${process.env.API_PORT||3001}/api/mcp/native-internal`,
      CAPS_NATIVE_INTERNAL_TOKEN:NATIVE_INTERNAL_TOKEN,
      CAPS_NATIVE_MCP_TIMEOUT_SECONDS:String(NATIVE_MCP_TIMEOUT_SECONDS),
      CAPS_MCP_CLIENT_SCRIPT:resolve(CAPS_ROOT,"scripts","native_mcp_bridge.mjs")
    }}
  );
  return {processResult,payload:parseNativeProcessResult(processResult)};
}

async function normalizeNativeAgentResult({payload,processResult,runId,reviewDecision=null}){
  const trace=await readJson(payload.artifacts.trace);
  const events=Array.isArray(trace.events)?trace.events:[];
  const decisionEvent=[...events].reverse().find((event)=>event.event_type==="decision"&&event.tool_name);
  const toolName=decisionEvent?.tool_name||payload.mcp_result?.tool||payload.final_summary?.tool||payload.execution_evidence?.finalSummary?.tool||null;
  const toolCalls=events.filter((event)=>event.event_type==="tool_call"&&(!toolName||event.tool_name===toolName));
  const toolResults=events.filter((event)=>event.event_type==="tool_result"&&(!toolName||event.tool_name===toolName));
  const nestedEvidence=payload.execution_evidence||payload.mcp_result?.executionEvidence||payload.mcp_result?.execution_evidence||{};
  const successfulToolResult=toolResults.some((event)=>event.payload?.ok===true)||nestedEvidence.successfulToolResult===true;
  const toolCallCount=Math.max(toolCalls.length,Number(nestedEvidence.toolCallCount||0));
  const toolResultCount=Math.max(toolResults.length,Number(nestedEvidence.toolResultCount||0));
  const status=payload.status;
  // Native resume is keyed by the persisted LangGraph thread. Keep the raw
  // CAPS review ID inside the trace/result, but expose the bounded thread
  // handle to the native review route so approval resumes the right graph.
  const nativeReviewId=payload.thread_id?`native:${payload.thread_id}`:payload.review_id||null;
  return {
    runId,
    scenarioKey:"local_agent",
    label:"Local Ollama payroll agent",
    tool:toolName,
    sideEffectClass:toolName==="search_time_entries"?"READ":toolName==="disburse_bank_payment"?"IRREVERSIBLE":"WRITE",
    status,
    decision:reviewDecision==="reject"?"REJECT":decisionEvent?.payload?.decision||payload.decision||null,
    executor:successfulToolResult?"CALLED":"NOT_CALLED",
    reasonCode:decisionEvent?.payload?.reason_code||null,
    ruleId:decisionEvent?.payload?.rule_id||null,
    traceId:trace.trace_id||null,
    reviewDecision:reviewDecision,
    sessionId:payload.thread_id||null,
    clarification:payload.clarification||null,
    identityResolution:payload.identity_resolution||null,
    nativeAgent:true,
    diagnostic:payload.diagnostic||null,
    agentTelemetry:payload.agent_telemetry||null,
    nativeTiming:payload.native_timing||payload.agent_telemetry?.native_timing||[],
    capsTiming:payload.mcp_result?.lifecycleTiming||payload.mcp_result?.capsTiming||[],
    executionEvidence:{
      decisionEventCount:Math.max(events.filter((event)=>event.event_type==="decision").length,Number(nestedEvidence.decisionEventCount||0)),
      toolCallCount,
      toolResultCount,
      successfulToolResult,
      traceEventCount:events.length,
      runIds:trace.run_ids||[],
      finalSummary:events.find((event)=>event.event_type==="final_summary")?.payload||null
    },
    artifacts:{
      trace:`/api/caps-guard/runs/${runId}/trace.json`,
      traceGraph:`/api/caps-guard/runs/${runId}/trace_graph.json`,
      html:null
    },
    process:{exitCode:processResult.code,signal:processResult.signal,timedOut:processResult.timedOut},
    reviewId:nativeReviewId,
    review:status==="PENDING_REVIEW"?{reviewId:nativeReviewId,status:"PENDING_REVIEW"}:reviewDecision?{reviewId:`native:${payload.thread_id}`,status:reviewDecision==="approve"?"APPROVED":"REJECTED"}:undefined
  };
}

export async function runLocalOllamaPayrollAgent(prompt){
  if(typeof prompt!=="string"||!prompt.trim()||prompt.trim().length>LOCAL_AGENT_MAX_PROMPT) throw new Error("Local-agent prompt must be 1-240 characters");
  const threadId=`native-${Date.now().toString(36)}-${randomUUID().slice(0,8)}`;
  const runId=`${Date.now().toString(36)}-${randomUUID().slice(0,8)}`;
  const outputDir=resolve(RUNTIME_ROOT,runId);
  await mkdir(outputDir,{recursive:true});
  const execution=await runNativeAgentProcess({command:"start",prompt:prompt.trim(),threadId,outputDir});
  const result=await normalizeNativeAgentResult({payload:execution.payload,processResult:execution.processResult,runId});
  if(result.status==="PENDING_REVIEW"&&!result.review?.reviewId) throw new Error("Local-agent review did not return a persisted thread ID");
  completedRuns.set(runId,{outputDir,tracePath:execution.payload.artifacts.trace,htmlPath:null,normalized:result});
  return result;
}

export async function resolveLocalOllamaPayrollReview(reviewId,decision="approve"){
  const threadId=nativeThreadId(reviewId);
  if(!["approve","reject"].includes(decision)) throw new Error("Local-agent review decision must be approve or reject");
  const runId=`${Date.now().toString(36)}-${randomUUID().slice(0,8)}`;
  const outputDir=resolve(RUNTIME_ROOT,runId);
  await mkdir(outputDir,{recursive:true});
  const execution=await runNativeAgentProcess({command:"resume",threadId,outputDir,decision});
  const result=await normalizeNativeAgentResult({payload:execution.payload,processResult:execution.processResult,runId,reviewDecision:decision});
  completedRuns.set(runId,{outputDir,tracePath:execution.payload.artifacts.trace,htmlPath:null,normalized:result});
  return result;
}

export async function resolveLocalOllamaEmployeeSelection(threadId,employeeId){
  if(typeof threadId!=="string"||!threadId.startsWith("native-")||!threadId.trim()) throw new Error("Unknown local-agent native thread ID");
  if(typeof employeeId!=="string"||!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(employeeId)) throw new Error("Employee selection must be a bounded employee ID");
  const runId=`${Date.now().toString(36)}-${randomUUID().slice(0,8)}`;
  const outputDir=resolve(RUNTIME_ROOT,runId);
  await mkdir(outputDir,{recursive:true});
  const execution=await runNativeAgentProcess({command:"select",threadId,outputDir,decision:employeeId});
  const result=await normalizeNativeAgentResult({payload:execution.payload,processResult:execution.processResult,runId});
  completedRuns.set(runId,{outputDir,tracePath:execution.payload.artifacts.trace,htmlPath:null,normalized:result});
  return result;
}

export function getCapsArtifact(runId,artifact){
  const record=completedRuns.get(runId);
  if(!record) return null;
  if(artifact==="trace") return record.tracePath;
  if(artifact==="trace_graph") return resolve(record.outputDir,"trace_graph.json");
  if(artifact==="html") return record.htmlPath;
  return null;
}
