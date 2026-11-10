import assert from "node:assert/strict";
import {closePayrollMcpSession} from "./mcp-client.js";
import {resolveLocalMcpEmployeeSelection,resolveLocalMcpPayrollReview,runLocalMcpPayrollAgent} from "./payroll-agent.js";

try{
  const ambiguous=await runLocalMcpPayrollAgent("Change Jordan hourly rate to $35");
  assert.equal(ambiguous.status,"NEEDS_CLARIFICATION");
  assert.equal(ambiguous.clarification.type,"AMBIGUOUS_EMPLOYEE");
  assert.equal(ambiguous.clarification.candidates.length,7);
  assert.equal(ambiguous.steps.length,0);

  await assert.rejects(
    resolveLocalMcpEmployeeSelection(ambiguous.sessionId,"EMP9999"),
    /server-provided candidates/
  );

  const selected=await resolveLocalMcpEmployeeSelection(ambiguous.sessionId,"EMP0062");
  assert.equal(selected.status,"PENDING_REVIEW");
  assert.equal(selected.steps[0].boundedInput.employeeId,"EMP0062");
  assert.equal(selected.steps[0].boundedInput.employeeName,"Jordan Patel");
  assert.equal(selected.steps[0].executor,"NOT_CALLED");
  assert.ok(selected.review?.reviewId);

  const approved=await resolveLocalMcpPayrollReview(selected.review.reviewId,"approve");
  assert.equal(approved.status,"EXECUTED");
  assert.equal(approved.executor,"CALLED");
  assert.equal(approved.boundedInput.employeeId,"EMP0062");
  assert.equal(approved.boundedInput.employeeName,"Jordan Patel");
  assert.equal(approved.steps[0].executionEvidence.toolCallCount,1);
  assert.equal(approved.steps[0].executionEvidence.toolResultCount,1);

  console.log("Employee resolution full smoke passed: ambiguous stop, candidate spoof rejection, canonical selection, CAPS review, and approved execution.");
}finally{
  await closePayrollMcpSession();
}
