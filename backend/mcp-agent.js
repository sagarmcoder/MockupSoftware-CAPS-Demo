import {resolveCapsReview,runCapsScenario} from "./caps-guard-bridge.js";
import {searchEmployeeProfiles} from "./employee-directory.js";

const MAX_INTENT_LENGTH=240;
const ALLOWED_INTENTS=Object.freeze(["view_hours","change_rate","release_payment"]);
const MAX_EMPLOYEE_NAME_LENGTH=80;
const EMPLOYEE_ID_PATTERN=/^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

const MCP_TOOLS=Object.freeze([
  Object.freeze({
    name:"search_employee_profiles",
    description:"Search the server-owned synthetic employee directory before a payroll action. The result may require user disambiguation.",
    inputSchema:Object.freeze({
      type:"object",
      additionalProperties:false,
      required:["query"],
      properties:Object.freeze({
        query:Object.freeze({type:"string",minLength:1,maxLength:80}),
        current_rate:Object.freeze({type:"number",exclusiveMinimum:0,maximum:200})
      })
    })
  }),
  Object.freeze({
    name:"route_payroll_intent",
    description:"Map one bounded payroll capability request to a server-owned CAPS Guard scenario. The server owns the concrete tool, plan, manifest, and approval behavior.",
    inputSchema:Object.freeze({
      type:"object",
      additionalProperties:false,
      required:["intent"],
      properties:Object.freeze({
        intent:Object.freeze({type:"string",enum:ALLOWED_INTENTS}),
        employee_id:Object.freeze({type:"string",maxLength:32}),
        employee_name:Object.freeze({type:"string",maxLength:MAX_EMPLOYEE_NAME_LENGTH}),
        current_rate:Object.freeze({type:"number",exclusiveMinimum:0,maximum:200}),
        proposed_rate:Object.freeze({type:"number",exclusiveMinimum:0,maximum:200}),
        context:Object.freeze({
          type:"object",
          additionalProperties:false,
          properties:Object.freeze({surface:Object.freeze({type:"string",maxLength:80})})
        })
      })
    })
  }),
  Object.freeze({
    name:"resolve_payroll_review",
    description:"Resolve one server-created synthetic payroll review and resume the same persisted CAPS Guard execution.",
    inputSchema:Object.freeze({
      type:"object",
      additionalProperties:false,
      required:["review_id","decision"],
      properties:Object.freeze({
        review_id:Object.freeze({type:"string",minLength:1,maxLength:200}),
        decision:Object.freeze({type:"string",enum:["approve","reject"]})
      })
    })
  })
]);

function cleanIntent(value){
  if(typeof value!=="string") throw new Error("MCP intent must be a string");
  const intent=value.trim().toLowerCase();
  if(!intent||intent.length>MAX_INTENT_LENGTH) throw new Error("MCP intent is empty or too long");
  return intent;
}

function cleanBoundedInput(body){
  const input={};
  if(body.employee_id!==undefined){
    if(typeof body.employee_id!=="string"||!EMPLOYEE_ID_PATTERN.test(body.employee_id.trim())) throw new Error("employee_id must be a bounded identifier");
    input.employeeId=body.employee_id.trim();
  }
  if(body.employee_name!==undefined){
    if(typeof body.employee_name!=="string"||!body.employee_name.trim()||body.employee_name.trim().length>MAX_EMPLOYEE_NAME_LENGTH) throw new Error("employee_name must be a bounded label");
    input.employeeName=body.employee_name.trim();
  }
  if(body.proposed_rate!==undefined){
    if(typeof body.proposed_rate!=="number"||!Number.isFinite(body.proposed_rate)||body.proposed_rate<=0||body.proposed_rate>200) throw new Error("proposed_rate must be between 0 and 200");
    input.proposedRate=body.proposed_rate;
  }
  if(body.current_rate!==undefined){
    if(typeof body.current_rate!=="number"||!Number.isFinite(body.current_rate)||body.current_rate<=0||body.current_rate>200) throw new Error("current_rate must be between 0 and 200");
    input.currentRate=body.current_rate;
  }
  return input;
}

function validateResolvedEmployee(input){
  if(!input.employeeId) return input;
  const directory=searchEmployeeProfiles(input.employeeId);
  const selected=directory.status==="MATCHED"&&directory.candidates[0]?.employeeId===input.employeeId
    ? directory.candidates[0]
    : null;
  if(!selected) throw new Error("employee_id must identify one active server-directory employee");
  return {...input,employeeName:selected.employeeName};
}

function selectScenarioFromIntent(body){
  if(!body || typeof body!=="object" || Array.isArray(body)) throw new Error("MCP request must be an object");
  const unexpectedKeys=Object.keys(body).filter((key)=>!['intent','context','employee_id','employee_name','current_rate','proposed_rate'].includes(key));
  if(unexpectedKeys.length) throw new Error(`MCP request contains unsupported fields: ${unexpectedKeys.join(", ")}`);
  const intent=cleanIntent(body.intent);
  const scenarioKey=ALLOWED_INTENTS.includes(intent)?intent:null;
  if(!scenarioKey) throw new Error("Unsupported payroll intent; use view_hours, change_rate, or release_payment");
  const context=body.context===undefined?{}:body.context;
  if(!context || typeof context!=="object" || Array.isArray(context)) throw new Error("MCP context must be an object");
  const contextKeys=Object.keys(context).filter((key)=>key!=="surface");
  if(contextKeys.length) throw new Error(`MCP context contains unsupported fields: ${contextKeys.join(", ")}`);
  return {
    intent,
    scenarioKey,
    input:validateResolvedEmployee(cleanBoundedInput(body)),
    displayContext:{
      surface:typeof context.surface==="string"?context.surface.slice(0,80):"payroll_demo"
    }
  };
}

export function listMcpTools(){
  return MCP_TOOLS.map((tool)=>JSON.parse(JSON.stringify(tool)));
}

export function runMcpEmployeeProfileSearch({query,current_rate:currentRate}={}){
  return {
    ...searchEmployeeProfiles(query,currentRate===undefined?{}:{currentRate}),
    orchestration:{
      transport:"mcp-stdio",
      protocol:"official-mcp-v2-sdk",
      tool:"search_employee_profiles",
      rawDirectoryControlsAccepted:false
    }
  };
}

export {selectScenarioFromIntent};

export async function runMcpPayrollIntent(body){
  const route=selectScenarioFromIntent(body);
  const result=await runCapsScenario(route.scenarioKey,route.input);
  return {
    ...result,
    orchestration:{
      transport:"mcp-stdio",
      protocol:"official-mcp-v2-sdk",
      tool:"route_payroll_intent",
      intent:route.intent,
      scenarioKey:route.scenarioKey,
      boundedInput:route.input,
      displayContext:route.displayContext,
      rawToolArgumentsAccepted:false
    }
  };
}

export async function resolveMcpPayrollReview({review_id,decision}){
  if(typeof review_id!=="string"||!review_id.trim()||review_id.length>200) throw new Error("review_id must be a bounded server-created identifier");
  if(decision!=="approve"&&decision!=="reject") throw new Error("decision must be approve or reject");
  return resolveCapsReview(review_id,decision);
}
