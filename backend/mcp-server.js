import {McpServer} from "@modelcontextprotocol/server";
import {serveStdio} from "@modelcontextprotocol/server/stdio";
import {z} from "zod";
import {resolveMcpPayrollReview,runMcpEmployeeProfileSearch,runMcpPayrollIntent} from "./mcp-agent.js";

function resultFor(payload){
  return {
    content:[{type:"text",text:JSON.stringify(payload)}],
    structuredContent:payload
  };
}

function buildServer(){
  const server=new McpServer({name:"mockup-payroll-caps-server",version:"1.0.0"},{maxToolInputElements:20});

  server.registerTool(
  "search_employee_profiles",
  {
    title:"Search employee profiles",
    description:"Search the bounded synthetic employee directory before a payroll action; ambiguous results require explicit user selection.",
    inputSchema:z.object({query:z.string().min(1).max(80),current_rate:z.number().positive().max(200).optional()}).strict()
  },
  async(input)=>{
    try{
      const result=runMcpEmployeeProfileSearch(input);
      process.stderr.write(`[mcp-search] query=${JSON.stringify(input.query)} current_rate=${JSON.stringify(input.current_rate)} status=${result.status} candidates=${result.candidates?.length||0}\n`);
      return resultFor(result);
    }
    catch(error){return {isError:true,content:[{type:"text",text:error.message}]};}
  }
  );

  server.registerTool(
  "route_payroll_intent",
  {
    title:"Route bounded payroll intent",
    description:"Route a constrained payroll capability through CAPS Guard. The server owns the concrete tool and execution plan.",
    inputSchema:z.object({
      intent:z.enum(["view_hours","change_rate","release_payment"]),
      employee_id:z.string().max(32).optional(),
      employee_name:z.string().max(80).optional(),
      current_rate:z.number().positive().max(200).optional(),
      proposed_rate:z.number().positive().max(200).optional(),
      context:z.object({surface:z.string().max(80).optional()}).strict().optional()
    }).strict()
  },
  async(input)=>{
    try{return resultFor(await runMcpPayrollIntent(input));}
    catch(error){return {isError:true,content:[{type:"text",text:error.message}]};}
  }
  );

  server.registerTool(
  "resolve_payroll_review",
  {
    title:"Resolve persisted payroll review",
    description:"Approve or reject a server-created synthetic payroll review; approval resumes the same persisted CAPS Guard execution.",
    inputSchema:z.object({
      review_id:z.string().min(1).max(200),
      decision:z.enum(["approve","reject"])
    }).strict()
  },
  async(input)=>{
    try{return resultFor(await resolveMcpPayrollReview(input));}
    catch(error){return {isError:true,content:[{type:"text",text:error.message}]};}
  }
  );

  return server;
}

serveStdio(buildServer,{legacy:"serve",onerror:(error)=>process.stderr.write(`${error.message}\n`)});
