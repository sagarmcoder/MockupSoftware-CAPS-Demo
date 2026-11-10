import assert from "node:assert/strict";
import {candidateIsAllowed,searchEmployeeProfiles} from "./employee-directory.js";
import {parsePayrollRequest,planPayrollRequest} from "./payroll-agent.js";

const ambiguous=searchEmployeeProfiles("Jordan");
assert.equal(ambiguous.status,"AMBIGUOUS");
assert.equal(ambiguous.candidates.length,7);
assert.deepEqual(ambiguous.candidates.map((candidate)=>candidate.employeeId),[
  "EMP0002","EMP0074","EMP0026","EMP0038","EMP0050","EMP0062","EMP0014"
]);

const exact=searchEmployeeProfiles("Jordan Patel");
assert.equal(exact.status,"MATCHED");
assert.equal(exact.candidates.length,1);
assert.equal(exact.candidates[0].employeeId,"EMP0062");

const synthetic=searchEmployeeProfiles("Sarah");
assert.equal(synthetic.status,"MATCHED");
assert.equal(synthetic.candidates[0].employeeId,"E104");

const parsed=parsePayrollRequest("Change Jordan hourly rate to $35");
assert.equal(parsed.intent,"change_rate");
assert.equal(parsed.employeeQuery,"Jordan");
assert.equal(parsed.rate,35);

const unresolved=planPayrollRequest("Change Jordan hourly rate to $35");
assert.equal(unresolved.status,"NEEDS_CLARIFICATION");
assert.equal(unresolved.steps.length,0);
assert.equal(unresolved.clarification.type,"EMPLOYEE_REQUIRED");

const selected=planPayrollRequest("Change Jordan hourly rate to $35",exact.candidates[0]);
assert.equal(selected.steps[0].employee_id,"EMP0062");
assert.equal(selected.steps[0].employee_name,"Jordan Patel");
assert.equal(candidateIsAllowed(ambiguous.candidates,"EMP0062").employeeName,"Jordan Patel");
assert.equal(candidateIsAllowed(ambiguous.candidates,"EMP9999"),null);

console.log("Employee resolution smoke passed: ambiguous Jordan lookup, exact match, synthetic alias, fail-closed plan, and candidate validation.");
