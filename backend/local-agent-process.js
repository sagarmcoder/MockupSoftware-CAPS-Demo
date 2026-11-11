import {spawn} from "node:child_process";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

const BACKEND_ROOT=dirname(fileURLToPath(import.meta.url));
const APP_ROOT=resolve(BACKEND_ROOT,"..");
const WORKER_PATH=resolve(BACKEND_ROOT,"local-agent-worker.mjs");
const TIMEOUT_MS=Number(process.env.CAPS_LOCAL_AGENT_TIMEOUT_MS||300_000);
const PREWARM_TIMEOUT_MS=Number(process.env.CAPS_LOCAL_AGENT_PREWARM_TIMEOUT_MS||180_000);

let workerState=null;
let workerReadiness={
  status:"not_started",
  checked_at:null,
  detail:"Deterministic MCP worker has not been prewarmed",
  tools:[]
};

function setWorkerReadiness(status,detail,tools=workerReadiness.tools){
  workerReadiness={status,checked_at:new Date().toISOString(),detail,tools:[...tools]};
}

function appendOutput(current,chunk){
  const next=`${current}${chunk}`;
  return next.length>64*1024?next.slice(-64*1024):next;
}

function rejectWorker(state,error){
  for(const pending of state.pending.values()){
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  state.pending.clear();
}

function startWorker(){
  const child=spawn(process.execPath,[WORKER_PATH,"daemon"],{
    cwd:APP_ROOT,
    env:{...process.env},
    stdio:["pipe","pipe","pipe"],
    shell:false
  });
  const state={child,pending:new Map(),stderr:"",buffer:"",closed:false};
  workerState=state;
  if(workerReadiness.status!=="ready") setWorkerReadiness("starting","Loading the official MCP stdio worker");
  child.stdout.on("data",(chunk)=>{
    state.buffer+=chunk.toString();
    const lines=state.buffer.split("\n");
    state.buffer=lines.pop()||"";
    for(const line of lines){
      if(!line.trim()) continue;
      let message;
      try{message=JSON.parse(line);}
      catch(error){
        rejectWorker(state,new Error(`Local MCP worker returned invalid JSON: ${error.message}`));
        continue;
      }
      const pending=state.pending.get(message.id);
      if(!pending) continue;
      state.pending.delete(message.id);
      clearTimeout(pending.timer);
      if(message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error||"Local MCP worker command failed"));
    }
  });
  child.stderr.on("data",(chunk)=>{state.stderr=appendOutput(state.stderr,chunk.toString());});
  child.on("error",(error)=>{
    state.closed=true;
    if(workerState===state) workerState=null;
    if(!state.intentionalClose) setWorkerReadiness("failed",error.message);
    rejectWorker(state,error);
  });
  child.on("close",(code,signal)=>{
    state.closed=true;
    if(workerState===state) workerState=null;
    if(!state.intentionalClose) setWorkerReadiness("failed",`Local MCP worker stopped${signal?` (${signal})`:""}${code!==0?`: ${state.stderr.trim()||"unknown error"}`:""}`);
    rejectWorker(state,new Error(`Local MCP worker stopped${signal?` (${signal})`:""}${code!==0?`: ${state.stderr.trim()||"unknown error"}`:""}`));
  });
  return state;
}

function stopWorker(state){
  if(!state||state.closed) return;
  state.closed=true;
  state.intentionalClose=true;
  if(workerState===state) workerState=null;
  state.child.kill("SIGTERM");
  setTimeout(()=>{if(!state.child.killed) state.child.kill("SIGKILL");},2000).unref();
}

function runWorker(command,input,timeoutMs=TIMEOUT_MS){
  const state=workerState&&!workerState.closed?workerState:startWorker();
  return new Promise((resolveWorker,rejectWorkerPromise)=>{
    const id=`request-${randomUUID()}`;
    const timer=setTimeout(()=>{
      state.pending.delete(id);
      rejectWorkerPromise(new Error(`Local MCP agent timed out after ${timeoutMs}ms`));
      stopWorker(state);
    },timeoutMs);
    state.pending.set(id,{resolve:resolveWorker,reject:rejectWorkerPromise,timer});
    try{state.child.stdin.write(`${JSON.stringify({id,command,input})}\n`);}
    catch(error){
      clearTimeout(timer);
      state.pending.delete(id);
      rejectWorkerPromise(error);
      stopWorker(state);
    }
  });
}

export function runLocalMcpPayrollAgent(prompt){return runWorker("run",{prompt});}
export function resolveLocalMcpPayrollReview(reviewId,decision="approve"){
  return runWorker("resolve",{reviewId,decision});
}
export function resolveLocalMcpEmployeeSelection(sessionId,employeeId){
  return runWorker("select-employee",{sessionId,employeeId});
}

export function warmLocalMcpAgentWorker(){
  if(workerReadiness.status==="ready"&&workerState&&!workerState.closed) return Promise.resolve(getLocalMcpAgentReadiness());
  setWorkerReadiness("starting","Loading the official MCP stdio worker");
  return runWorker("preflight",{},PREWARM_TIMEOUT_MS)
    .then((result)=>{
      setWorkerReadiness("ready","Official MCP stdio worker and advertised capabilities are ready",result.tools||[]);
      return getLocalMcpAgentReadiness();
    })
    .catch((error)=>{
      if(workerReadiness.status!=="failed") setWorkerReadiness("failed",error.message);
      throw error;
    });
}

export function getLocalMcpAgentReadiness(){
  return {...workerReadiness,tools:[...workerReadiness.tools]};
}

export function closeLocalMcpAgentWorker(){
  stopWorker(workerState);
}
