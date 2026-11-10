import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";

const backendRoot=process.cwd();
const port=32000+Math.floor(Math.random()*1000);
const child=spawn(process.execPath,["server.js"],{
  cwd:backendRoot,
  env:{
    ...process.env,
    API_PORT:String(port),
    CAPS_REVIEW_DB_PATH:`/private/tmp/caps-http-boundary-${randomUUID()}.sqlite`,
    CAPS_NATIVE_CHECKPOINT_DB_PATH:`/private/tmp/caps-http-checkpoint-${randomUUID()}.sqlite`
  },
  stdio:["ignore","pipe","pipe"]
});

let output="";
child.stdout.on("data",(chunk)=>{output+=chunk.toString();});
child.stderr.on("data",(chunk)=>{output+=chunk.toString();});

function waitForServer(){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`API did not start: ${output}`)),15000);
    const check=()=>{
      if(output.includes(`http://localhost:${port}`)){
        clearTimeout(timer);
        resolve();
      }else if(child.exitCode!==null){
        clearTimeout(timer);
        reject(new Error(`API exited before start: ${output}`));
      }else setTimeout(check,25);
    };
    check();
  });
}

async function request(path,body){
  const response=await fetch(`http://127.0.0.1:${port}${path}`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  return {status:response.status,body:await response.json()};
}

try{
  await waitForServer();
  const toolsResponse=await fetch(`http://127.0.0.1:${port}/api/mcp/tools`);
  const toolsPayload=await toolsResponse.json();
  assert.equal(toolsResponse.status,200);
  assert.deepEqual(toolsPayload.tools.map((tool)=>tool.name),["search_employee_profiles","route_payroll_intent","resolve_payroll_review"]);

  const internalResponse=await request("/api/mcp/native-internal",{op:"tools/list"});
  assert.equal(internalResponse.status,403,JSON.stringify(internalResponse));
  assert.match(internalResponse.body.error,/token/i);

  for(const payload of [
    {intent:"view_hours",tool:"search_time_entries"},
    {intent:"view_hours",path:"../../outside-boundary"},
    {intent:"view_hours",approval:true},
    {intent:"view_hours",args:{employee_id:"E104"}},
    {intent:"view_hours",context:{surface:"demo",manifest:"/tmp/evil"}}
  ]){
    const result=await request("/api/mcp/intent",payload);
    assert.equal(result.status,400,JSON.stringify({payload,result}));
    assert.match(result.body.error,/unsupported fields|Invalid|invalid/i);
  }

  console.log("MCP HTTP boundary smoke passed: tools/list and raw tool/path/approval/args/manifest rejection.");
}finally{
  child.kill("SIGTERM");
}
