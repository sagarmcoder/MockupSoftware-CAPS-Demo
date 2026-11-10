import {callPayrollMcpTool,closePayrollMcpSession,listPayrollMcpTools} from "./mcp-client.js";
import {createInterface} from "node:readline";

async function execute(request){
  if(request?.op==="tools/list") return {tools:(await listPayrollMcpTools()).map((tool)=>tool.name)};
  if(request?.op==="tools/call") return {result:await callPayrollMcpTool(request.name,request.arguments)};
  if(typeof request?.name!=="string"||!request.arguments||typeof request.arguments!=="object"){
    throw new Error("MCP request requires name and arguments");
  }
  return callPayrollMcpTool(request.name,request.arguments);
}

async function runOnce(){
  try{
    const result=await execute(JSON.parse(process.argv[2]||"{}"));
    process.stdout.write(JSON.stringify({ok:true,result}));
  }catch(error){
    process.stdout.write(JSON.stringify({ok:false,error:error.message}));
    process.exitCode=2;
  }finally{
    await closePayrollMcpSession();
  }
}

async function runDaemon(){
  const input=createInterface({input:process.stdin,crlfDelay:Infinity});
  for await(const line of input){
    if(!line.trim()) continue;
    try{
      const result=await execute(JSON.parse(line));
      process.stdout.write(`${JSON.stringify({ok:true,...result})}\n`);
    }catch(error){
      process.stdout.write(`${JSON.stringify({ok:false,error:error.message})}\n`);
    }
  }
  await closePayrollMcpSession();
}

if(process.argv[2]) await runOnce();
else await runDaemon();
