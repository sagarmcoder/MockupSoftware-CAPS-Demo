import assert from "node:assert/strict";
import {parsePayrollRequest,planPayrollRequest} from "./payroll-agent.js";

const variations=[
  {prompt:"Change Alex's rate to $42.",employeeQuery:"Alex",rate:42,currentRate:null},
  {prompt:"Alex should be making 42 now.",employeeQuery:"Alex",rate:42,currentRate:null},
  {prompt:"Can you bump Alex to forty-two an hour?",employeeQuery:"Alex",rate:42,currentRate:null},
  {prompt:"Set Alex's hourly pay to $42.",employeeQuery:"Alex",rate:42,currentRate:null},
  {prompt:"I need Alex moved from 38 to 42.",employeeQuery:"Alex",rate:42,currentRate:38}
];

for(const expected of variations){
  const parsed=parsePayrollRequest(expected.prompt);
  assert.equal(parsed.intent,"change_rate",expected.prompt);
  assert.equal(parsed.employeeQuery,expected.employeeQuery,expected.prompt);
  assert.equal(parsed.rate,expected.rate,expected.prompt);
  assert.equal(parsed.currentRate,expected.currentRate,expected.prompt);
  assert.equal(parsed.payIntent,false,expected.prompt);
  assert.equal(parsed.rateIntent,true,expected.prompt);
}

const continuation=parsePayrollRequest("Pay Sarah using the new $35 rate");
assert.equal(continuation.intent,"change_rate");
assert.equal(continuation.employeeQuery,"Sarah");
assert.equal(continuation.payIntent,true);
assert.equal(continuation.rateIntent,true);
assert.equal(planPayrollRequest(continuation.prompt,{employeeId:"E104",employeeName:"Sarah"}).steps.length,2);

const safeRead=parsePayrollRequest("Show Sarah hours");
assert.equal(safeRead.intent,"view_hours");
assert.equal(safeRead.employeeQuery,"Sarah");
assert.equal(safeRead.rate,null);

const unsupported=parsePayrollRequest("Reset Alex's MFA");
assert.equal(unsupported.intent,null);
assert.equal(unsupported.employeeQuery,null);

console.log("Payroll NL variation smoke passed: five rate phrasings map to one bounded change_rate capability; payment continuation remains distinct.");
