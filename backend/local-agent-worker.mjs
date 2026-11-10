import {closePayrollMcpSession} from "./mcp-client.js";
import {resolveLocalMcpEmployeeSelection,resolveLocalMcpPayrollReview,runLocalMcpPayrollAgent} from "./payroll-agent.js";
import {createInterface} from "node:readline";

const command=process.argv[2];

async function readInput(){
  const chunks=[];
  for await(const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function execute(input,requestedCommand){
  return requestedCommand==="run"
    ? runLocalMcpPayrollAgent(input.prompt)
    : requestedCommand==="resolve"
      ? resolveLocalMcpPayrollReview(input.reviewId,input.decision)
      : requestedCommand==="select-employee"
        ? resolveLocalMcpEmployeeSelection(input.sessionId,input.employeeId)
      : (()=>{throw new Error(`Unknown local-agent worker command: ${requestedCommand}`);})();
}

async function runOnce(){
  try{
    const input=await readInput();
    process.stdout.write(JSON.stringify(await execute(input,command)));
  }catch(error){
    process.stderr.write(error?.stack||error?.message||String(error));
    process.exitCode=1;
  }finally{
    await closePayrollMcpSession();
  }
}

async function runDaemon(){
  const input=createInterface({input:process.stdin,crlfDelay:Infinity});
  for await(const line of input){
    if(!line.trim()) continue;
    let request;
    try{request=JSON.parse(line);}
    catch(error){
      process.stdout.write(JSON.stringify({id:null,ok:false,error:`Invalid worker request: ${error.message}`} )+"\n");
      continue;
    }
    try{
      const result=await execute(request.input||{},request.command);
      process.stdout.write(JSON.stringify({id:request.id,ok:true,result})+"\n");
    }catch(error){
      process.stdout.write(JSON.stringify({id:request.id,ok:false,error:error?.message||String(error)})+"\n");
    }
  }
}

let shuttingDown=false;
async function shutdown(){
  if(shuttingDown) return;
  shuttingDown=true;
  await closePayrollMcpSession();
  process.exit(0);
}

process.on("SIGTERM",shutdown);
process.on("SIGINT",shutdown);

if(command==="daemon") await runDaemon();
else await runOnce();
