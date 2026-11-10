import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const BACKEND_ROOT=dirname(fileURLToPath(import.meta.url));
const APP_ROOT=resolve(BACKEND_ROOT,"..");
const SERVER_PATH=resolve(BACKEND_ROOT,"mcp-server.js");
let sdkPromise=null;
let mcpCallQueue=Promise.resolve();
const MCP_REQUEST_TIMEOUT_MS=Number(process.env.CAPS_MCP_REQUEST_TIMEOUT_MS||180_000);
const MCP_CONNECT_TIMEOUT_MS=Number(process.env.CAPS_MCP_CONNECT_TIMEOUT_MS||180_000);
const MCP_CONNECT_ATTEMPTS=Number(process.env.CAPS_MCP_CONNECT_ATTEMPTS||1);
let activeSession=null;
let sessionPromise=null;
let lastMcpTiming=[];
let readiness={status:"not_started",checked_at:null,detail:"MCP session has not been prewarmed",tools:[]};
const require=createRequire(import.meta.url);

function recordMcpTiming(stage,detail,status="completed"){
  const timestampMs=Date.now();
  const previous=lastMcpTiming.at(-1);
  lastMcpTiming.push({
    stage,
    status,
    detail,
    timestamp_ms:timestampMs,
    timestamp:new Date(timestampMs).toISOString(),
    delta_ms:previous?Math.max(0,timestampMs-previous.timestamp_ms):0,
    source:"mcp-client",
    process_id:process.pid
  });
}

function timing(label,start){
  if(process.env.CAPS_MCP_DEBUG_TIMING==="1"){
    process.stderr.write(`[mcp-timing] ${label} ${Date.now()-start}ms\n`);
  }
}

export function getLastMcpTiming(){
  return lastMcpTiming.map((point)=>({...point}));
}

export function getMcpReadiness(){
  return {...readiness,tools:[...readiness.tools]};
}

export async function warmPayrollMcpSession(){
  readiness={status:"starting",checked_at:new Date().toISOString(),detail:"Initializing the official MCP stdio session",tools:[]};
  try{
    const tools=await listPayrollMcpTools();
    readiness={status:"ready",checked_at:new Date().toISOString(),detail:"Official MCP stdio session and advertised capabilities are ready",tools:tools.map((tool)=>tool.name)};
    return getMcpReadiness();
  }catch(error){
    readiness={status:"failed",checked_at:new Date().toISOString(),detail:error.message,tools:[]};
    return getMcpReadiness();
  }
}

function loadMcpClientSdk(){
  // The official package exposes both ESM and CommonJS entry points. On this
  // machine the ESM loader can stall during a cold native resume before the
  // MCP child process is even spawned. Use Node's synchronous package resolver
  // for the same official exports so the transport timeout covers the actual
  // MCP handshake rather than an unbounded module-loader stall.
  sdkPromise??=Promise.resolve().then(()=>{
    recordMcpTiming("mcp_sdk_load_start","Loading the official MCP client SDK");
    const clientSdk=require("@modelcontextprotocol/client");
    const stdioSdk=require("@modelcontextprotocol/client/stdio");
    recordMcpTiming("mcp_sdk_load_complete","Official MCP client SDK loaded");
    return {...clientSdk,...stdioSdk};
  });
  return sdkPromise;
}

function createTransport(sdk){
  const transport=new sdk.StdioClientTransport({
    command:process.execPath,
    args:[SERVER_PATH],
    cwd:APP_ROOT,
    env:{...process.env},
    stderr:"pipe"
  });
  // Preserve the previous client behavior: server diagnostics are not part of
  // the structured MCP result, but the stream must still be drained.
  transport.stderr?.on("data",(chunk)=>{
    if(process.env.CAPS_MCP_DEBUG_TIMING==="1") process.stderr.write(`[mcp-server] ${chunk.toString()}`);
  });
  return transport;
}

function withTimeout(promise,timeoutMs,label){
  const pending=Promise.resolve(promise);
  pending.catch(()=>{});
  let timer;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error(label)),timeoutMs);
  });
  return Promise.race([pending,timeout]).finally(()=>clearTimeout(timer));
}

async function closeSession(session){
  if(!session) return;
  if(activeSession===session) activeSession=null;
  recordMcpTiming("mcp_client_close_start","Closing MCP client session");
  const closePromise=session.client.close().catch(()=>{});
  await Promise.race([closePromise,new Promise((resolve)=>setTimeout(resolve,5000))]);
  // The SDK client normally delegates this, but explicitly close the stdio
  // transport as well so the spawned MCP server cannot keep a worker alive.
  await Promise.race([
    session.transport?.close?.().catch?.(()=>{}),
    new Promise((resolve)=>setTimeout(resolve,5000))
  ]);
  recordMcpTiming("mcp_client_close_complete","MCP client session closed");
}

async function getMcpSession(started){
  if(activeSession){
    recordMcpTiming("mcp_client_reuse_attempt","Reusing the backend-owned MCP session");
    return activeSession;
  }
  if(!sessionPromise){
    sessionPromise=(async()=>{
      const sdk=await loadMcpClientSdk();
      timing("sdk:loaded",started);
      let lastError=null;
      for(let attempt=1;attempt<=MCP_CONNECT_ATTEMPTS;attempt+=1){
        const client=new sdk.Client({name:"mockup-payroll-local-agent",version:"1.0.0"},{capabilities:{}});
        const transport=createTransport(sdk);
        try{
          recordMcpTiming("mcp_client_spawn_start",`Starting MCP stdio session attempt ${attempt}`);
          recordMcpTiming("mcp_stdio_connect_start","Starting MCP stdio initialize handshake");
          recordMcpTiming("mcp_initialize_start","MCP initialize request started");
          timing(`client:connect:start:${attempt}`,started);
          await withTimeout(
            client.connect(transport,{timeout:MCP_CONNECT_TIMEOUT_MS,maxTotalTimeout:MCP_CONNECT_TIMEOUT_MS}),
            MCP_CONNECT_TIMEOUT_MS,
            "MCP client connect timed out"
          );
          recordMcpTiming("mcp_client_spawn_complete","MCP stdio child/session connected");
          recordMcpTiming("mcp_stdio_connect_complete","MCP stdio initialize handshake completed");
          recordMcpTiming("mcp_initialize_complete","MCP initialize completed");
          timing("client:connected",started);
          recordMcpTiming("mcp_capability_tool_request_start","MCP tools/list request started");
          const listed=await withTimeout(
            client.listTools({}, {timeout:MCP_CONNECT_TIMEOUT_MS,maxTotalTimeout:MCP_CONNECT_TIMEOUT_MS}),
            MCP_CONNECT_TIMEOUT_MS,
            "MCP tools/list timed out"
          );
          recordMcpTiming("mcp_capability_tool_request_complete","MCP tools/list response received");
          timing("tools:listed",started);
          activeSession={client,transport,tools:listed.tools};
          return activeSession;
        }catch(error){
          lastError=error;
          recordMcpTiming("mcp_stdio_connect_complete",`MCP session attempt failed: ${error.message}`,"failed");
          await closeSession({client,transport});
          timing(`client:connect:retry:${attempt}`,started);
        }
      }
      throw lastError||new Error("MCP client session could not be established");
    })();
  }
  const pending=sessionPromise;
  try{return await pending;}
  finally{if(sessionPromise===pending) sessionPromise=null;}
}

function parseToolResult(result){
  if(result.isError) throw new Error(result.content?.find((item)=>item.type==="text")?.text||"MCP tool call failed");
  if(result.structuredContent&&typeof result.structuredContent==="object") return result.structuredContent;
  const text=result.content?.find((item)=>item.type==="text")?.text;
  if(!text) throw new Error("MCP tool returned no structured result");
  try{return JSON.parse(text);}
  catch(error){throw new Error(`MCP tool returned invalid JSON: ${error.message}`);}
}

async function callPayrollMcpToolOnce(name,args){
  const started=Date.now();
  lastMcpTiming=[];
  recordMcpTiming("mcp_capability_tool_request_start",`MCP capability request started: ${name}`);
  timing("call:start",started);
  const session=await getMcpSession(started);
  try{
    const tool=session.tools.find((candidate)=>candidate.name===name);
    if(!tool) throw new Error(`MCP server did not advertise ${name}`);
    recordMcpTiming("mcp_capability_tool_request_start",`MCP tools/call started: ${name}`);
    const result=parseToolResult(await session.client.callTool(
      {name,arguments:args},
      {timeout:MCP_REQUEST_TIMEOUT_MS,maxTotalTimeout:MCP_REQUEST_TIMEOUT_MS}
    ));
    recordMcpTiming("mcp_capability_tool_request_complete",`MCP tools/call completed: ${name}`);
    timing("tool:returned",started);
    return result;
  }catch(error){
    await closeSession(session);
    throw error;
  }finally{
    if(activeSession===session) timing("client:reused",started);
  }
}

export function callPayrollMcpTool(name,args){
  // CAPS plan execution writes persisted review state. Serialize calls in this
  // process so two rapid UI actions cannot race the same SQLite boundary.
  const result=mcpCallQueue.then(
    ()=>callPayrollMcpToolOnce(name,args),
    ()=>callPayrollMcpToolOnce(name,args)
  );
  mcpCallQueue=result.catch(()=>{});
  return result;
}

export async function listPayrollMcpTools(){
  lastMcpTiming=[];
  return (await getMcpSession(Date.now())).tools;
}

export async function closePayrollMcpSession(){
  const session=activeSession;
  activeSession=null;
  sessionPromise=null;
  await closeSession(session);
}
