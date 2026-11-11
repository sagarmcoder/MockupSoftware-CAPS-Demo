import {mkdir,readdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";
import {callPayrollMcpTool} from "./mcp-client.js";
import {candidateIsAllowed} from "./employee-directory.js";

const APP_ROOT=fileURLToPath(new URL("..",import.meta.url));
const SESSION_ROOT=resolve(APP_ROOT,"caps",".runtime","agent-sessions");
const MAX_PROMPT_LENGTH=240;

const NUMBER_WORDS=Object.freeze({
  zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,
  eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,
  seventy:70,eighty:80,ninety:90
});
const NUMBER_WORD_PATTERN="(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?";
const RATE_TOKEN_PATTERN=`(?:\\$|CAD\\s*)?\\d{1,3}(?:\\.\\d+)?|${NUMBER_WORD_PATTERN}`;

function numberFromPromptToken(value){
  const normalized=value.trim().replace(/^\$|^CAD\s*/i,"").toLowerCase().replace(/-/g," ");
  if(/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  const parts=normalized.split(/\s+/).filter(Boolean);
  if(!parts.length||parts.some((part)=>NUMBER_WORDS[part]===undefined)) return null;
  return parts.reduce((total,part)=>total+NUMBER_WORDS[part],0);
}

function rateDetailsFromPrompt(prompt){
  const range=new RegExp(`\\bfrom\\s+(${RATE_TOKEN_PATTERN})\\s+to\\s+(${RATE_TOKEN_PATTERN})\\b`,"i").exec(prompt);
  if(range){
    return {currentRate:numberFromPromptToken(range[1]),proposedRate:numberFromPromptToken(range[2])};
  }
  const values=[...prompt.matchAll(new RegExp(`\\b(${RATE_TOKEN_PATTERN})\\b`,"gi"))]
    .map((match)=>numberFromPromptToken(match[1]))
    .filter((value)=>value!==null);
  return {currentRate:null,proposedRate:values.at(-1)??null};
}

function rateFromPrompt(prompt){
  return rateDetailsFromPrompt(prompt).proposedRate;
}

function employeeQueryFromPrompt(prompt){
  const trimTrailingActionWords=(value)=>{
    const stopWords=new Set(["hour","hourly","hours","rate","pay","to","using","at","with","new","per","payment","now"]);
    const words=value.trim().split(/\s+/);
    while(words.length>1&&stopWords.has(words.at(-1).toLowerCase())) words.pop();
    return words.join(" ");
  };
  const patterns=[
    /\b(?:change|set|bump|move|moved|raise|increase|update)\s+([A-Za-z][A-Za-z'-]*)['’]s?\s+(?:hourly\s+)?(?:change\s+)?(?:rate|pay)\b/i,
    /\b([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)['’]s?\s+(?:hourly\s+)?(?:change\s+)?(?:rate|pay)\b/i,
    /\b(?:change|set|bump|move|moved|raise|increase|update)\s+(?:the\s+)?(?:hourly\s+)?(?:rate\s+for\s+)?([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)(?=\s+(?:hourly|rate|pay|hours|to|from|using|at|with|new|per|an|now)\b|\s*\$|[?.!,]|$)/i,
    /\b([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)\s+should\s+be\s+making\b/i,
    /\b(?:pay|payment|release\s+payment)\s+(?:for\s+)?([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)(?=\s+(?:using|with|at|the|new|rate)\b|\s*\$|[?.!,]|$)/i,
    /\bfor\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)(?=\s+(?:to|from|using|with|at|the|new|rate)\b|\s*\$|[?.!,]|$)/i,
    /\b(?:show|view|get)\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)(?=\s+(?:hours|time\s+entries|time\s+worked)\b)/i,
    /\b(?:show|view|get)\s+(?:the\s+)?(?:hours|time\s+entries|time\s+worked)\s+(?:for\s+)?([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)(?=[?.!,]|$)/i,
    /\b(?:can\s+you|please|i\s+need)\s+([A-Za-z][A-Za-z'-]*)\s+(?=(?:to|from|should|is|moved)\b)/i
  ];
  for(const pattern of patterns){
    const match=prompt.match(pattern);
    if(match?.[1]) return trimTrailingActionWords(match[1]);
  }
  return null;
}

export function parsePayrollRequest(prompt){
  if(typeof prompt!=="string"||!prompt.trim()||prompt.trim().length>MAX_PROMPT_LENGTH) throw new Error("Local agent prompt must be 1-240 characters");
  const text=prompt.trim();
  const lower=text.toLowerCase();
  const rateDetails=rateDetailsFromPrompt(text);
  const rate=rateDetails.proposedRate;
  const payIntent=/^\s*pay\s+[A-Za-z]/i.test(text)||/\b(?:release|disburse)\b.*\b(?:pay|payment|payroll|funds?)\b/i.test(text);
  const rateIntent=rate!==null&&(/\b(rate|hourly|per\s+hour|making|moved\s+from|hourly\s+pay)\b/.test(lower)||/\b(?:change|set|bump|raise|increase|move|moved)\b/.test(lower));
  const hoursIntent=/\b(hours|time entries|time\s+worked)\b/.test(lower);
  const intent=rateIntent?"change_rate":payIntent?"release_payment":hoursIntent?"view_hours":null;
  return {prompt:text,intent,rate,currentRate:rateDetails.currentRate,employeeQuery:employeeQueryFromPrompt(text),payIntent,rateIntent};
}

export function planPayrollRequest(prompt,employee=null){
  const parsed=parsePayrollRequest(prompt);
  if(!parsed.intent) return {
    ...parsed,
    steps:[],
    status:"NEEDS_CLARIFICATION",
    clarification:{type:"UNSUPPORTED_REQUEST",message:"I need a bounded payroll request such as viewing hours, changing an hourly rate, or releasing a payment."}
  };
  if(!employee) return {
    ...parsed,
    steps:[],
    status:"NEEDS_CLARIFICATION",
    clarification:{type:"EMPLOYEE_REQUIRED",query:parsed.employeeQuery,message:"Which employee should this payroll action use?"}
  };
  const steps=[{intent:parsed.intent,employee_id:employee.employeeId,employee_name:employee.employeeName}];
  if(parsed.intent==="change_rate") steps[0].proposed_rate=parsed.rate;
  if(parsed.intent==="change_rate"&&parsed.payIntent) steps.push({intent:"release_payment",employee_id:employee.employeeId,employee_name:employee.employeeName});
  return {
    ...parsed,
    steps,
    explanation:parsed.rateIntent&&parsed.payIntent
      ?"I will propose the rate change first, then test the requested payment action through CAPS Guard."
      :parsed.intent==="change_rate"
        ?"I will route the bounded rate-change capability through CAPS Guard."
        :parsed.intent==="release_payment"
          ?"I will route the payment capability through CAPS Guard; the agent cannot override an irreversible-action block."
          :"I will read the bounded synthetic hours capability through MCP."
  };
}

async function saveSession(session){
  await mkdir(SESSION_ROOT,{recursive:true});
  await writeFile(resolve(SESSION_ROOT,`${session.sessionId}.json`),JSON.stringify(session,null,2));
}

async function loadSessionByReviewId(reviewId){
  const session=await loadSessionByIdFromDisk((candidate)=>candidate.pendingReviewId===reviewId);
  if(session) return session;
  throw new Error("No persisted local-agent session owns this review");
}

async function loadSessionById(sessionId){
  const session=await loadSessionByIdFromDisk((candidate)=>candidate.sessionId===sessionId);
  if(session) return session;
  throw new Error("No persisted local-agent session found");
}

async function loadSessionByIdFromDisk(predicate){
  await mkdir(SESSION_ROOT,{recursive:true});
  for(const name of await readdir(SESSION_ROOT)){
    if(!name.endsWith(".json")) continue;
    try{
      const session=JSON.parse(await readFile(resolve(SESSION_ROOT,name),"utf8"));
      if(predicate(session)) return session;
    }catch(_error){
      // Ignore a partial or unrelated session file; the review remains fail-closed.
    }
  }
  return null;
}

function agentEnvelope(session,lastResult,status=session.status){
  return {
    ...lastResult,
    status,
    sessionId:session.sessionId,
    agent:{kind:"bounded-local-agent",planner:"deterministic-local-planner",model:null,protocol:"MCP stdio",reasoningHidden:true},
    plan:session.steps.map((step,index)=>({index:int(index),intent:step.intent,status:session.results[index]?.status||"PENDING"})),
    steps:session.results,
    clarification:session.clarification||null,
    assistantMessage:session.assistantMessage
  };
}

function int(value){return Number(value);}

async function executeNext(session){
  const step=session.steps[session.nextStepIndex];
  if(!step){
    session.status="COMPLETED";
    session.assistantMessage="The bounded payroll plan completed.";
    await saveSession(session);
    return agentEnvelope(session,session.results.at(-1)||{status:"COMPLETED",executor:"NOT_CALLED"});
  }
  const result=await callPayrollMcpTool("route_payroll_intent",step);
  session.results[session.nextStepIndex]=result;
  if(result.status==="PENDING_REVIEW"){
    session.pendingReviewId=result.review?.reviewId||null;
    session.status="PENDING_REVIEW";
    session.assistantMessage=`CAPS Guard paused ${step.intent} for synthetic human review. No sink call was made.`;
    await saveSession(session);
    return agentEnvelope(session,result,"PENDING_REVIEW");
  }
  session.pendingReviewId=null;
  session.nextStepIndex+=1;
  if(result.status==="BLOCKED"){
    session.status="BLOCKED";
    session.assistantMessage="CAPS Guard blocked the forbidden payment action. The agent cannot override that decision.";
    await saveSession(session);
    return agentEnvelope(session,result,"BLOCKED");
  }
  if(result.status!=="EXECUTED"){
    session.status="FAILED";
    session.assistantMessage="The guarded capability did not complete.";
    await saveSession(session);
    return agentEnvelope(session,result,"FAILED");
  }
  if(session.nextStepIndex<session.steps.length) return executeWithFailureState(session);
  session.status="EXECUTED";
  session.assistantMessage="CAPS Guard allowed the bounded request and the synthetic adapter returned successfully.";
  await saveSession(session);
  return agentEnvelope(session,result,"EXECUTED");
}

async function executeWithFailureState(session){
  try{
    return await executeNext(session);
  }catch(error){
    session.status="FAILED";
    session.pendingReviewId=null;
    session.failure={message:error.message};
    session.assistantMessage="The guarded payroll request did not complete. No approval or execution success is being inferred from the failure.";
    await saveSession(session);
    return agentEnvelope(session,{status:"FAILED",executor:"NOT_CALLED",executionError:error.message},"FAILED");
  }
}

export async function runLocalMcpPayrollAgent(prompt){
  const parsedPlan=planPayrollRequest(prompt);
  const session={sessionId:`agent-${Date.now().toString(36)}-${randomUUID().slice(0,8)}`,prompt:prompt.trim(),parsed:parsedPlan,employeeQuery:parsedPlan.employeeQuery,steps:[],nextStepIndex:0,results:[],pendingReviewId:null,status:"RUNNING",clarification:null,assistantMessage:parsedPlan.explanation||null};
  if(!parsedPlan.intent){
    session.status="NEEDS_CLARIFICATION";
    session.clarification=parsedPlan.clarification;
    session.assistantMessage=parsedPlan.clarification.message;
    await saveSession(session);
    return agentEnvelope(session,{status:"NEEDS_CLARIFICATION",executor:"NOT_CALLED"},"NEEDS_CLARIFICATION");
  }
  if(!parsedPlan.employeeQuery){
    session.status="NEEDS_CLARIFICATION";
    session.clarification={type:"EMPLOYEE_REQUIRED",message:"Which employee should this payroll action use?"};
    session.assistantMessage=session.clarification.message;
    await saveSession(session);
    return agentEnvelope(session,{status:"NEEDS_CLARIFICATION",executor:"NOT_CALLED"},"NEEDS_CLARIFICATION");
  }

  const directory=await callPayrollMcpTool("search_employee_profiles",{query:parsedPlan.employeeQuery});
  if(directory.status!=="MATCHED"){
    session.status="NEEDS_CLARIFICATION";
    session.clarification={
      type:directory.status==="AMBIGUOUS"?"AMBIGUOUS_EMPLOYEE":"EMPLOYEE_NOT_FOUND",
      query:directory.query,
      candidates:directory.candidates||[],
      message:directory.status==="AMBIGUOUS"
        ?`I found ${directory.candidates.length} matching employees. Please select one before I continue.`
        :`I could not find an active employee matching “${directory.query}”. Please provide a full name or employee number.`
    };
    session.assistantMessage=session.clarification.message;
    await saveSession(session);
    return agentEnvelope(session,{status:"NEEDS_CLARIFICATION",executor:"NOT_CALLED",orchestration:directory.orchestration},"NEEDS_CLARIFICATION");
  }

  const plan=planPayrollRequest(prompt,directory.candidates[0]);
  session.parsed=plan;
  session.employeeQuery=plan.employeeQuery;
  session.steps=plan.steps;
  session.status=session.steps.length?"RUNNING":"NEEDS_CLARIFICATION";
  session.assistantMessage=plan.explanation;
  await saveSession(session);
  if(!plan.steps.length) return agentEnvelope(session,{status:"NEEDS_CLARIFICATION",executor:"NOT_CALLED"},"NEEDS_CLARIFICATION");
  return executeWithFailureState(session);
}

export async function resolveLocalMcpEmployeeSelection(sessionId,employeeId){
  if(typeof sessionId!=="string"||!sessionId.trim()||sessionId.length>200) throw new Error("sessionId must be a bounded server-created identifier");
  if(typeof employeeId!=="string"||!employeeId.trim()||employeeId.length>80) throw new Error("employeeId must be a bounded selected candidate identifier");
  const session=await loadSessionById(sessionId);
  if(session.status!=="NEEDS_CLARIFICATION"||session.clarification?.type!=="AMBIGUOUS_EMPLOYEE") throw new Error("Agent session is not awaiting employee selection");
  const selected=candidateIsAllowed(session.clarification.candidates,employeeId.trim());
  if(!selected) throw new Error("Selected employee is not one of the server-provided candidates");
  const plan=planPayrollRequest(session.prompt,selected);
  if(!plan.steps.length) throw new Error("The stored payroll request cannot be resumed");
  session.parsed=plan;
  session.employeeQuery=plan.employeeQuery;
  session.steps=plan.steps;
  session.nextStepIndex=0;
  session.results=[];
  session.pendingReviewId=null;
  session.clarification=null;
  session.status="RUNNING";
  session.assistantMessage=plan.explanation;
  await saveSession(session);
  return executeWithFailureState(session);
}

export async function resolveLocalMcpPayrollReview(reviewId,decision="approve"){
  if(decision!=="approve"&&decision!=="reject") throw new Error("Local-agent review decision must be approve or reject");
  const session=await loadSessionByReviewId(reviewId);
  const result=await callPayrollMcpTool("resolve_payroll_review",{review_id:reviewId,decision});
  const step=session.steps[session.nextStepIndex];
  result.boundedInput={
    employeeId:step?.employee_id||null,
    employeeName:step?.employee_name||null,
    ...(step?.proposed_rate!==undefined?{proposedRate:step.proposed_rate}: {})
  };
  session.results[session.nextStepIndex]=result;
  session.pendingReviewId=null;
  session.nextStepIndex+=1;
  if(decision==="reject"){
    session.status="REJECTED";
    session.assistantMessage="The synthetic reviewer rejected the change, so the agent made no sink call and stopped.";
    await saveSession(session);
    return agentEnvelope(session,result,"REJECTED");
  }
  if(result.status!=="EXECUTED"){
    session.status=result.status||"FAILED";
    session.assistantMessage="The persisted review did not resume successfully.";
    await saveSession(session);
    return agentEnvelope(session,result,session.status);
  }
  if(session.nextStepIndex<session.steps.length) return executeNext(session);
  session.status="EXECUTED";
  session.assistantMessage="The reviewer approved the persisted action and the guarded execution completed.";
  await saveSession(session);
  return agentEnvelope(session,result,"EXECUTED");
}
