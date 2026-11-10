# Authorized Access and Native HITL Plan

Status: **Demo-prep branch active. Deterministic plan-mode and native local MCP review lifecycles are implemented and verified; production authorization remains a separate boundary.**

## Current status — 2026-11-10

The native local demo now completes the full bounded lifecycle through the
backend-owned persistent MCP session: Ollama intent, LangGraph state, MCP
capability routing, CAPS `REVIEW_REQUIRED`, approval or rejection, replay
rejection, and irreversible-payment `BLOCK`. The cold runtime can still take
minutes on this machine; warm actions are much faster. The local reviewer is
synthetic and the payroll sink is synthetic.

The user has now authorized committing and pushing the demo checkout. The
destination remote must still be verified before any push; the separate public
CAPS Guard source repository is not the demo application's destination.

## Why this is separate

CAPS native HITL and production authorization solve different problems:

- Native HITL pauses a guarded execution, persists the review state, accepts a decision, and resumes or rejects the same execution.
- Production authorization proves that the person making the decision is authenticated, has the required role, is allowed to approve this employee/payroll action, and cannot replay or reuse the approval.

A keyboard `Y/n` prompt can prove an approval decision was entered. It cannot, by itself, prove RBAC, identity, delegation, expiry, or replay protection. The demo can support the prompt while labeling its reviewer as synthetic/local.

## Current CAPS evidence

- The original CAPS source is preserved at `.caps-tools/caps_guard_public`; the active demo-prep branch is `.caps-tools/caps_guard_demo_prep`.
- The original pinned revision is `4aa58cf707fc059c037cc193e453f1d06dfb2417`.
- Demo-prep worktree: `.caps-tools/caps_guard_demo_prep`, branch `demo/payroll-caps-prep`.
- The demo-prep branch now has configurable Ollama host/request timeout controls and a fail-closed local `Y/y` review prompt with a bounded wait.
- CAPS has a native prompt-mode path using LangGraph and SQLite checkpoint persistence.
- CAPS exposes `--resume-review approve|reject` and regression cases for pause, approval, rejection, stable trace identity, and distinct run IDs.
- Deterministic plan-mode HITL is verified without the LLM import chain: pending state, approval, rejection, restart recovery, duplicate-resolution failure, stable trace identity, distinct run IDs, and exactly one approved sink call.
- The legacy Python 3.13 LangGraph prompt-mode path is **not verified**. Two bounded retries with local CPU-only Ollama available stalled during the Python/LangChain import phase before the first Ollama generation request.
- The native local-agent path is verified under the demo-prep Python 3.10 runtime: Ollama intent generation, CAPS review, fresh-process approval/rejection, replay rejection, exactly-once sink protection, and payment `BLOCK`.
- Direct local Ollama generation is verified on CPU: `llama3.2:3b` reported `100% CPU`.

## Proposed feature branch

The authorized demo-prep branch was created from the original public CAPS checkout, not from the payroll app:

1. Base commit and clean worktree were verified before branch creation.
2. Branch created: `demo/payroll-caps-prep`.
3. Policy and guard regressions pass on the branch.
4. Local interactive approval controls are implemented around the existing persisted review state.
5. The deterministic plan-mode lifecycle and its edge-case sweep pass; the optional LangGraph prompt-mode sweep remains pending. The branch is unmerged and unpushed.

## Interactive approval contract

The intended local-demo contract is:

```text
CAPS policy evaluates a reviewed sink
  -> persists thread_id, trace_id, plan_id, review payload, and expiry
  -> emits a pending trace and bounded review state
  -> reads one decision: Y/y = approve, N/n/blank/EOF = reject
  -> resumes the exact persisted execution once
  -> emits the original trace_id plus a new run_id and review_resume event
```

Rules:

- No arbitrary tool, plan, manifest, or argument can be supplied at the prompt.
- Approval must be bound to the persisted review ID and server-owned plan state.
- Invalid input must fail closed; no default approval.
- EOF, blank input, timeout, interrupted input, and malformed input must reject or leave an explicit unresolved state.
- A review cannot be approved twice.
- A rejected review cannot execute the sink later without a new guarded run.
- The sink must execute at most once after approval.
- The review summary must not expose secrets or real employee data.

## Required test matrix

- `Y`, `y`, `N`, `n`, blank, whitespace, invalid text, EOF, Ctrl-C, and timeout.
- Approval after restart using the persisted SQLite state.
- Approval with a wrong thread ID, review ID, trace ID, plan ID, or argument hash.
- Duplicate approval and approve-after-reject.
- Crash before input, after approval persistence, before resume, and after sink completion.
- Review expiry and stale-review rejection (future hardening; not currently claimed by the demo runner).
- No sink call before approval.
- Exactly one sink call after approval.
- No sink call after rejection.
- Stable trace ID across pause/resume and distinct run IDs per lifecycle.
- Existing CAPS regression suite remains green.

## Production authorization boundary

The local `Y/n` feature is a demo interaction only. A production payroll integration would still require an external or application-owned authorization layer for:

- authenticated reviewer identity;
- role/permission checks and employee/pay-period scope;
- approval reason and audit actor;
- expiry and revocation;
- idempotency and replay protection;
- separation of duties;
- durable audit storage and operational monitoring.

Do not represent the local keyboard prompt as production RBAC.

## Current gate

The user has authorized committing and pushing the demo checkout. Do not
represent the local reviewer as production authorization. The deterministic
plan-mode and native local-agent demo gates are complete under the supported
isolated runtime. The older `.venv313` import path remains bounded and
unavailable; it is not the supported demo runtime.

## Native local-agent gate update — 2026-11-07

The gate is open for the local synthetic demo only. The supported demo-prep
runtime completed the native LangGraph path through the official MCP boundary:
local Ollama intent generation, CAPS `REVIEW_REQUIRED`, persisted checkpoint
resume, approve/reject handling, replay rejection, exactly-once sink
protection, and `BLOCK` behavior were exercised. The Python 3.13 import stall
remains historical runtime evidence; the native demo uses the isolated
supported runtime selected by the bridge, and `CAPS_PYTHON` remains the
override.

Measured evidence: warmed local `llama3.2:3b` approved-action model latency was `1,070.3 ms`, and the local Ollama process reported `100% CPU`. This supports a local-inference cost-avoidance claim, not a zero-cost or production-capacity claim. No merge, push, production authorization, or deployment was performed.

## Native MCP transport status — 2026-11-07

The official MCP v2 server/client integration is verified independently. The native Python LangGraph-to-MCP stdio runner is implemented but remains experimental and unverified: its bounded import preflight stalled before Ollama generation and before an MCP call. The bridge defaults to the verified direct local-Ollama runner; `CAPS_NATIVE_TRANSPORT=mcp` is opt-in and must not be described as verified until the complete approve/reject/replay lifecycle passes.

The Node MCP lifecycle stall was separately isolated and fixed. The app had a custom stdio wrapper that did not match MCP v2 negotiated transport behavior; it now uses the official SDK `StdioClientTransport`. The full isolated Node MCP/HITL regression passes after the fix. This is a transport-boundary result, not evidence that the Python LangGraph native-MCP path is complete.

## Native MCP verification update — 2026-11-08

The Python native-MCP path has partial evidence, not a complete gate. Under the isolated local `.venv312` runtime, a fresh-process start returned `REVIEW_REQUIRED` with no sink call, approval resumed the persisted checkpoint and executed exactly one sink call, and replay was rejected without another call. Warm Ollama intent latency was `1,404.5 ms`.

Reject/BLOCK coverage remains blocked by intermittent import stalls in `langgraph.checkpoint.sqlite` → `langchain_core.runnables` → `langsmith`. The bounded runner returned `RUNTIME_UNAVAILABLE` and `executor: NOT_CALLED` after 120 seconds. Keep the app's direct local-agent mode as the reliable default; native MCP is opt-in and experimental until the remaining fresh-process sweep is repeatable.
