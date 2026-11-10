import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {callPayrollMcpTool,closePayrollMcpSession,listPayrollMcpTools} from "./mcp-client.js";
import {runLocalMcpPayrollAgent} from "./payroll-agent.js";

const APP_ROOT=fileURLToPath(new URL("..",import.meta.url));

function freshResolve(reviewId,decision){
  const child=spawnSync(process.execPath,["--input-type=module","-e",`
    import {resolveLocalMcpPayrollReview} from "./backend/payroll-agent.js";
    import {closePayrollMcpSession} from "./backend/mcp-client.js";
    try { console.log(JSON.stringify(await resolveLocalMcpPayrollReview(process.env.REVIEW_ID, process.env.DECISION))); }
    catch (error) { console.error(error.message); process.exitCode=1; }
    finally { await closePayrollMcpSession(); }
  `],{
    cwd:APP_ROOT,
    env:{...process.env,REVIEW_ID:reviewId,DECISION:decision},
    encoding:"utf8"
  });
  return {code:child.status,stdout:child.stdout,stderr:child.stderr};
}

const tools=await listPayrollMcpTools();
assert.deepEqual(tools.map((tool)=>tool.name),["search_employee_profiles","route_payroll_intent","resolve_payroll_review"]);

const read=await callPayrollMcpTool("route_payroll_intent",{intent:"view_hours",employee_id:"E104"});
assert.equal(read.status,"EXECUTED");
assert.equal(read.decision,"ALLOW");
assert.equal(read.executor,"CALLED");

const planned=await runLocalMcpPayrollAgent("Pay Sarah using the new $35 rate");
assert.equal(planned.status,"PENDING_REVIEW");
assert.equal(planned.plan[0].intent,"change_rate");
assert.equal(planned.steps[0].executionEvidence.toolCallCount,0);
assert.equal(planned.steps[0].executor,"NOT_CALLED");
assert.ok(planned.review?.reviewId);

const resumed=freshResolve(planned.review.reviewId,"approve");
assert.equal(resumed.code,0,resumed.stderr);
const resumedPayload=JSON.parse(resumed.stdout);
assert.equal(resumedPayload.status,"BLOCKED");
assert.deepEqual(resumedPayload.steps.map((step)=>step.status),["EXECUTED","BLOCKED"]);
assert.equal(resumedPayload.steps[0].executionEvidence.toolCallCount,1);
assert.equal(resumedPayload.steps[1].executor,"NOT_CALLED");
assert.equal(resumedPayload.steps[1].decision,"BLOCK");
assert.equal(resumedPayload.agent.protocol,"MCP stdio");

const rejected=await runLocalMcpPayrollAgent("Change Alice hourly rate to $31");
assert.equal(rejected.status,"PENDING_REVIEW");
const rejection=freshResolve(rejected.review.reviewId,"reject");
assert.equal(rejection.code,0,rejection.stderr);
const rejectionPayload=JSON.parse(rejection.stdout);
assert.equal(rejectionPayload.status,"REJECTED");
assert.equal(rejectionPayload.steps[0].executor,"NOT_CALLED");
const duplicate=freshResolve(rejected.review.reviewId,"approve");
assert.notEqual(duplicate.code,0);

await assert.rejects(
  callPayrollMcpTool("route_payroll_intent",{intent:"view_hours",tool:"disburse_bank_payment"}),
  /unsupported fields|Invalid|invalid/i
);
await assert.rejects(
  callPayrollMcpTool("route_payroll_intent",{intent:"view_hours",context:{surface:"demo",manifest:"/tmp/evil"}}),
  /unsupported fields|Invalid|invalid/i
);
await assert.rejects(
  callPayrollMcpTool("route_payroll_intent",{intent:"view_hours",path:"/tmp/evil"}),
  /unsupported fields|Invalid|invalid/i
);
await assert.rejects(
  callPayrollMcpTool("route_payroll_intent",{intent:"view_hours",approval:true}),
  /unsupported fields|Invalid|invalid/i
);
await assert.rejects(
  callPayrollMcpTool("route_payroll_intent",{intent:"view_hours",args:{employee_id:"E104"}}),
  /unsupported fields|Invalid|invalid/i
);

await closePayrollMcpSession();

console.log("Full MCP payroll demo passed: tools/list, tools/call, bounded agent planning, persisted review restart, continuation, BLOCK, rejection, duplicate fail-closed, and injection rejection.");
