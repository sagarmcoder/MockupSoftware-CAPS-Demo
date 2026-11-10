import {spawn} from "node:child_process";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

const BACKEND_ROOT=dirname(fileURLToPath(import.meta.url));
const APP_ROOT=resolve(BACKEND_ROOT,"..");
const WORKER_PATH=resolve(BACKEND_ROOT,"local-agent-worker.mjs");
const TIMEOUT_MS=Number(process.env.CAPS_LOCAL_AGENT_TIMEOUT_MS||300_000);

let workerState=null;

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
    rejectWorker(state,error);
  });
  child.on("close",(code,signal)=>{
    state.closed=true;
    if(workerState===state) workerState=null;
    rejectWorker(state,new Error(`Local MCP worker stopped${signal?` (${signal})`:""}${code!==0?`: ${state.stderr.trim()||"unknown error"}`:""}`));
  });
  return state;
}

function stopWorker(state){
  if(!state||state.closed) return;
  state.closed=true;
  if(workerState===state) workerState=null;
  state.child.kill("SIGTERM");
  setTimeout(()=>{if(!state.child.killed) state.child.kill("SIGKILL");},2000).unref();
}

function runWorker(command,input){
  const state=workerState&&!workerState.closed?workerState:startWorker();
  return new Promise((resolveWorker,rejectWorkerPromise)=>{
    const id=`request-${randomUUID()}`;
    const timer=setTimeout(()=>{
      state.pending.delete(id);
      rejectWorkerPromise(new Error(`Local MCP agent timed out after ${TIMEOUT_MS}ms`));
      stopWorker(state);
    },TIMEOUT_MS);
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
