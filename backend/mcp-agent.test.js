import assert from "node:assert/strict";
import {listMcpTools,runMcpEmployeeProfileSearch,runMcpPayrollIntent,selectScenarioFromIntent} from "./mcp-agent.js";
import {approveCapsReview} from "./caps-guard-bridge.js";

assert.deepEqual(selectScenarioFromIntent({intent:"view_hours"}).scenarioKey,"view_hours");
assert.deepEqual(selectScenarioFromIntent({intent:"change_rate",context:{surface:"payroll"}}).scenarioKey,"change_rate");
assert.throws(()=>selectScenarioFromIntent({intent:"drop table payroll"}),/Unsupported payroll intent/);
assert.throws(()=>selectScenarioFromIntent({intent:"view_hours",tool:"search_time_entries"}),/unsupported fields/);
assert.equal(listMcpTools().length,3);
assert.deepEqual(listMcpTools().map((tool)=>tool.name),["search_employee_profiles","route_payroll_intent","resolve_payroll_review"]);
assert.equal(runMcpEmployeeProfileSearch({query:"Jordan"}).status,"AMBIGUOUS");
assert.equal(runMcpEmployeeProfileSearch({query:"Jordan Patel"}).candidates[0].employeeId,"EMP0062");

const allow=await runMcpPayrollIntent({intent:"view_hours",context:{surface:"summary"}});
assert.equal(allow.orchestration.scenarioKey,"view_hours");
assert.equal(allow.status,"EXECUTED");
assert.equal(allow.executor,"CALLED");

const pending=await runMcpPayrollIntent({intent:"change_rate",context:{surface:"payroll"}});
assert.equal(pending.status,"PENDING_REVIEW");
assert.equal(pending.executor,"NOT_CALLED");
assert.ok(pending.review?.reviewId);
const approved=await approveCapsReview(pending.review.reviewId);
assert.equal(approved.status,"EXECUTED");
assert.equal(approved.executor,"CALLED");

const blocked=await runMcpPayrollIntent({intent:"release_payment"});
assert.equal(blocked.status,"BLOCKED");
assert.equal(blocked.executor,"NOT_CALLED");

console.log("Narrow MCP payroll flow passed: intent validation, fixed routing, CAPS ALLOW, REVIEW_REQUIRED, approval, and BLOCK.");
