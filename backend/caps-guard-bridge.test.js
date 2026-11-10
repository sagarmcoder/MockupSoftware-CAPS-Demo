import assert from "node:assert/strict";
import {approveCapsReview,runCapsScenario} from "./caps-guard-bridge.js";

const allow=await runCapsScenario("view_hours");
assert.equal(allow.status,"EXECUTED");
assert.equal(allow.decision,"ALLOW");
assert.equal(allow.executor,"CALLED");

const pending=await runCapsScenario("change_rate");
assert.equal(pending.status,"PENDING_REVIEW");
assert.equal(pending.decision,"REVIEW_REQUIRED");
assert.equal(pending.executor,"NOT_CALLED");
assert.ok(pending.review?.reviewId);

const approved=await approveCapsReview(pending.review.reviewId);
assert.equal(approved.status,"EXECUTED");
assert.equal(approved.executor,"CALLED");
assert.equal(approved.executionEvidence.toolCallCount,1);
assert.equal(approved.executionEvidence.toolResultCount,1);

const blocked=await runCapsScenario("release_payment");
assert.equal(blocked.status,"BLOCKED");
assert.equal(blocked.decision,"BLOCK");
assert.equal(blocked.executor,"NOT_CALLED");

console.log("CAPS Guard bridge smoke passed: ALLOW, pending review, approved synthetic write, and BLOCK.");
