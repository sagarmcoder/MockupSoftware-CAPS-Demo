# CAPS Guard Payroll Demo Tracker

Status: Full local MCP + bounded agent + persisted CAPS HITL loop implemented; native Python/Ollama/MCP path verified end-to-end through the persistent backend MCP session; cold local startup remains machine-dependent; production authorization remains out of scope

## Current verification note — 2026-11-10

- [x] Fixed the native approval/resume startup defect by routing the short-lived Python LangGraph runner through a token-protected loopback endpoint owned by the long-lived Node backend. The backend retains the official MCP v2 client/session across start and resume; the Python JSONL bridge remains available for standalone diagnostics.
- [x] Isolated native sweep passed on port `3011`: local Ollama intent → LangGraph → official MCP → CAPS `REVIEW_REQUIRED` → persisted approve → `EXECUTED`/`CALLED` with exactly one call/result; duplicate approval returned `REPLAY_REJECTED` with zero calls.
- [x] Native rejection passed: `REVIEW_REQUIRED` → `REJECTED`/`NOT_CALLED` with zero sink calls.
- [x] Native irreversible payment passed: `BLOCKED`/`BLOCKED`/`NOT_CALLED` with zero calls/results.
- [x] The private handoff rejects an invalid internal token with HTTP `403`; structured native results remain trace-derived rather than exit-code-derived.
- [ ] Cold-start performance is not portable: this machine measured roughly 158 seconds for one first successful native start while Python/LangGraph and MCP dependencies loaded. Warm native actions completed in roughly 1–5 seconds. This is a runtime-latency limitation, not a CAPS policy failure.
- [ ] Production identity, RBAC, reviewer authorization, expiry, and distributed replay protection remain outside this synthetic local demo.

## Current verification note — 2026-11-07

- [x] The deterministic local agent uses the official MCP v2 stdio client/server, routes through server-owned CAPS scenarios, persists review state, resumes from a fresh process, and proves `ALLOW`, `REVIEW_REQUIRED`, `BLOCK`, rejection, replay rejection, and exactly-once sink behavior.
- [x] A historical full MCP smoke passed with an isolated `CAPS_REVIEW_DB_PATH`; the shared default review database can lock when multiple demo runs execute concurrently, so the bridge now supports explicit review/checkpoint database paths.
- [x] The current post-persistent-session standalone full MCP smoke passed after the shared backend dependency tree was rebuilt with `npm ci --offline`; the first cold CAPS call took approximately 107 seconds, then subsequent calls were warm.
- [x] Historical pre-fix native run failed closed during `langgraph.checkpoint.sqlite` import before Ollama or MCP was called; the current 2026-11-10 section supersedes that limitation.
- [x] Historical pre-fix promotion gate is closed by the 2026-11-10 isolated native sweep; retain the deterministic path as a fallback, not because the current native policy flow is unverified.

## Current native MCP verification update — 2026-11-08

- [x] Fresh-process native start/approve/replay proof passed under the isolated `.venv312` runtime: local Ollama intent, LangGraph orchestration, official MCP stdio, CAPS `REVIEW_REQUIRED`, persisted review, exactly one approved sink call, and replay rejection with no second call.
- [x] The proof recorded `1,404.5 ms` warm local Ollama intent latency, `transport: mcp-stdio`, and trace evidence for zero pre-approval tool calls and one post-approval tool call/result.
- [x] Historical pre-fix native MCP reject and payment-BLOCK attempts were affected by intermittent import stalls; current reject and payment-BLOCK runs pass through the persistent backend session.
- [x] Fail-closed behavior remains intact: the stalled reject attempt produced a diagnostic traceback and did not call Ollama, MCP, CAPS, or the sink.
- [x] Native MCP transport/model-boundary timeout handling now writes structured fail-closed artifacts with `executor: NOT_CALLED`; the contract is covered by `tests/test_native_mcp_runner.py`.
- [x] The native Python MCP path has now passed reject, BLOCK, replay, and approved continuation in an isolated namespace; cold startup remains a documented runtime limitation.

## Reliable MCP app-route verification — 2026-11-08

- [x] Found and fixed the app wiring defect where `/api/mcp/local-agent` invoked the experimental Python runner without its required manifest.
- [x] Restored the reliable route to the bounded deterministic planner over the official MCP v2 stdio client/server loop.
- [x] Isolated the experimental Python/Ollama runner behind `/api/mcp/native-agent`; it remains opt-in and fail-closed.
- [x] Kept one official MCP stdio session open in the Node client and serialized calls to avoid repeated negotiation and SQLite review races.
- [x] Live safe-read evidence: `ALLOW` → `EXECUTED` → `CALLED`, one tool call and one successful result.
- [x] Live rate-change evidence: `REVIEW_REQUIRED` → `PENDING_REVIEW` → `NOT_CALLED`; approval resumed the persisted review and produced `EXECUTED` → `CALLED` with one call/result.
- [x] Live payment evidence: `BLOCK` → `BLOCKED` → `NOT_CALLED`.
- [x] Frontend production build passed; the non-watch backend start path passed after the watch-mode `EMFILE` limitation.
- [x] Narrow deterministic MCP flow passed after the client-session change; CAPS bridge smoke passed.
- [x] HTTP boundary smoke passed after the client-session change, including raw tool/path/approval/args/manifest rejection.
- [x] Standalone `mcp-full-smoke` passed after the shared backend dependency rebuild; cold-start latency is recorded separately from policy results.
- [ ] Capture visual browser screenshots; the in-app browser could not reach the local listener in this environment, so current evidence is live HTTP/API plus structured traces.

Scope: connect the synthetic payroll/time-entry UI to the public CAPS Guard runtime through a small, server-owned demo boundary.

## Claims we can make now

- [x] The app has a synthetic payroll dashboard.
- [x] The app has synthetic time-entry data and read-only API routes.
- [x] The app has an explicit agent-boundary document.
- [x] The app has a visible narrow MCP intent orchestration state.
- [x] Payroll data is labelled as synthetic and demo-only.
- [x] CAPS Guard is checked out in an isolated sibling tool directory.
- [x] CAPS Guard Python 3.13 environment is installed at `.caps-tools/caps_guard_public/.venv313`.
- [x] A payroll manifest has passed CAPS Guard validation.
- [x] Payroll read, rate-change, and disbursement plans have produced native `trace.json` artifacts.
- [x] The deterministic CAPS plan-mode review runner persists pending state and emits `trace.json`, `trace_graph.json`, and `summary.txt`.
- [x] A plan-mode review resumes after a fresh process with a stable `trace_id`, a new `run_id`, and exactly one sink call.
- [x] The Node HTTP boundary starts without importing the stalled Express dependency graph.
- [x] The HTTP boundary has been verified for ALLOW, REVIEW_REQUIRED, BLOCK, and server-owned synthetic approval.
- [x] A registered synthetic payroll adapter has been invoked only after policy allows it.
- [x] Verify bridge status from structured CAPS artifacts, not process exit code.
- [x] The bridge accepts fixed scenario keys and owns all manifest, plan, output, and action-log paths.
- [x] Agent orchestration remains separate from the CAPS execution boundary and can emit only fixed scenario selections.

## Demo contract

| Scenario | Tool | Side effect class | Expected decision | Executor expected |
| --- | --- | --- | --- | --- |
| View hours | `search_time_entries` | `READ` | `ALLOW` | Called |
| Change rate | `change_hourly_rate` | `WRITE` | `REVIEW_REQUIRED` | Not called before approval; called after resume |
| Release payment | `disburse_bank_payment` | `IRREVERSIBLE` | `BLOCK` | Never called |

The UI must show the decision and executor status from trace artifacts. It must not infer policy state from a process exit code or a text substring in stdout.

## Phase 0 — Preserve and verify the baseline

- [x] Confirm the current checkout is dirty/uncommitted and preserve existing user-owned files.
- [x] Confirm `frontend/src/components/PayrollDashboard.jsx` is the current payroll view.
- [x] Confirm `backend/server.js` exposes synthetic payroll and time-entry reads.
- [x] Confirm the current backend is ES-module based and already owns `app.listen()`.
- [x] Confirm `DEMO_AGENT_BOUNDARY.md` defines the connected CAPS boundary and its remaining limitations.
- [x] Confirm no CAPS Guard manifest, plan, adapter, or trace integration exists in the app.
- [x] Run the existing frontend build.
- [ ] Run the backend smoke test against the local API, if already running.
- [x] Record the baseline results here before integration work.

## Phase 1 — Bring CAPS Guard into the development system

- [x] Choose the dependency boundary: isolated pinned sibling checkout; do not copy CAPS into the Node app yet.
- [x] Record the exact CAPS Guard revision used for the demo: `4aa58cf707fc059c037cc193e453f1d06dfb2417`.
- [x] Create/use a Python 3.10+ environment without changing the Node application dependencies.
- [x] Install CAPS Guard requirements in `.venv313` using Python 3.13.2.
- [x] Run CAPS Guard policy and guard regression gates.
- [x] Run the supported native local-agent LangGraph/HITL gate under `.venv310` with local Ollama.
- [ ] The legacy `.venv313` prompt/HITL gate remains unavailable because its import path stalls before generation.
- [x] Record the commands and results here.

## Phase 2 — Native CAPS Guard policy proof

- [x] Create a repository-compliant payroll manifest using `tool_registry` entries with `name`, `binding`, `description`, and `side_effect_class`.
- [x] Configure `write_tools_require_review: true`.
- [x] Configure `block_irreversible_tools: true`.
- [x] Configure precedence `BLOCK > REVIEW_REQUIRED > ALLOW`.
- [x] Enforce the registered tool list and reject unknown tools.
- [x] Add forbidden argument patterns under `review_policies`.
- [x] Create fixed server-owned plans for read, rate-change, and disbursement scenarios.
- [x] Run the payroll read scenario with native CAPS Guard and capture `trace.json`.
- [x] Run the payroll rate-change plan and verify `REVIEW_REQUIRED` with no sink `tool_call`.
- [x] Run the plan-mode approved sink path with `--approve-sinks` and capture its separate trace.
- [x] Add the deterministic plan-mode pause/resume path using the CAPS policy engine, execution runtime, and persisted SQLite review state.
- [x] Verify stable trace identity, distinct run IDs, approval, rejection, restart recovery, duplicate-review rejection, and sink-call cardinality.
- [ ] If same-thread LangGraph pause/resume is required for a later version, complete the bounded Ollama prompt path and use `--resume-review`.
- [x] Run the disbursement scenario and verify `BLOCK` before adapter execution.
- [x] Run an existing CAPS plan and confirm native `trace.json` and `trace_graph.json` artifacts are emitted.
- [x] Render a payroll trace as HTML.

## Phase 3 — Guarded payroll adapter

- [x] Register a `payroll_api` binding in the CAPS Guard runtime.
- [x] Route read operations to a deterministic synthetic payroll adapter.
- [x] Route rate changes only to a dedicated synthetic demo sink/action log.
- [x] Do not connect to banking, real payroll, or production employee data.
- [x] Return the CAPS Guard adapter response contract.
- [x] Direct bridge smoke test proves blocked and pending actions do not call the sink.
- [x] Direct server-owned approval test proves the fixed rate-change plan executes once after approval.

## Phase 4 — Minimal Node bridge

- [x] Add a narrow route to the existing ES-module backend; do not create a second server.
- [x] Accept scenario IDs, not filesystem paths or arbitrary tool names.
- [x] Map scenario IDs to fixed plan files on the server.
- [x] Generate server-owned run IDs and review IDs.
- [x] Store pending review identity and scenario/run identity server-side.
- [x] Accept only a server-created review ID for the optional approval route.
- [x] Use `spawn` without a shell.
- [x] Add process timeout and bounded stdout/stderr handling.
- [x] Keep the official MCP stdio client session warm and serialize capability calls in the Node process.
- [x] Read generated trace artifacts and return normalized run state.
- [x] Verify the routes through the live local HTTP process using the native Node server adapter.
- [x] Confirm process exit `0` is not equivalent to payroll execution success.
- [x] Map `trace.json` decisions and events into normalized UI state.
- [x] Treat absence of a successful sink `tool_result` as `executor: NOT_CALLED`.
- [x] Keep trace files in a controlled local output directory and exclude them from source control unless intentionally selected as demo evidence.

## Phase 5 — Trace-first UI

- [x] Add a guarded-execution panel to the payroll view.
- [x] Provide three fixed scenario controls: ALLOW, REVIEW_REQUIRED, BLOCK.
- [x] Display tool, side-effect class, decision, reason code, rule ID, and trace ID.
- [x] Display `executor: NOT_CALLED` for blocked and pending actions.
- [x] Display `executor: CALLED` only when the trace proves execution.
- [ ] Display an authenticated approval actor; the optional demo approval route is intentionally not production HITL/authentication.
- [x] Link the rendered trace timeline and raw `trace.json`.
- [x] Keep all labels explicitly synthetic/demo-only.

## Phase 6 — Release evidence

- [x] Existing frontend build passes.
- [x] Existing backend HTTP runtime verification passes through the native Node server adapter on port 3011.
- [x] CAPS Guard regression gates pass.
- [x] Native ALLOW trace captured.
- [x] Native REVIEW_REQUIRED plan trace captured.
- [x] Native approved-sink trace captured through the deterministic plan-mode review runner.
- [x] Native BLOCK trace captured.
- [x] No blocked or pending scenario reached the synthetic sink.
- [x] README documents setup, limitations, and exact claims.
- [x] `DEMO_AGENT_BOUNDARY.md` is updated to distinguish deterministic plan-mode HITL from the optional prompt-mode gate and separate orchestration phase.

## Phase 7 — Narrow demo-only MCP agent orchestration

This phase is intentionally not part of the CAPS Guard bridge. The agent may eventually choose a scenario, but it must never own the final tool invocation or bypass the fixed server boundary.

- [x] Define the agent input contract as intent plus display context, not raw tool arguments.
- [x] Define bounded orchestration tools: `route_payroll_intent` and `resolve_payroll_review`.
- [x] Have the orchestrator emit only one of the server-owned scenario keys.
- [x] Reject agent-supplied filesystem paths, manifests, tool names, arguments, and approval flags.
- [x] Route every selected intent through the CAPS bridge and fixed server-owned plan.
- [x] Keep write and irreversible actions unavailable to the agent until their policy behavior is tested.
- [x] Add negative tests for unsupported intents and arbitrary tool fields.
- [x] Add negative tests for path traversal and approval bypass at the HTTP boundary.
- [ ] Decide whether a future authenticated human approval service is needed; do not call the current demo approval route production HITL.
- [x] Add orchestration metadata to the trace-derived response.

The Phase 1 compatibility adapter remains deliberately narrow:

```text
MCP agent intent/context
  -> one fixed scenario key
  -> Node HTTP boundary
  -> server-owned CAPS plan
  -> trace-derived result
```

The compatibility layer must not receive arbitrary CAPS paths, manifests, plans, tool names, tool arguments, or approval flags. The full MCP v2 server and bounded local planner are documented in the Phase 2 section below; the planner is deterministic rather than a general-purpose LLM.

## Phase 8 — CAPS HITL verification

The demo path includes the deterministic plan-mode lifecycle and the supported native local-agent lifecycle under `.venv310`. The legacy `.venv313` import path remains a bounded runtime limitation.

- [x] Add the persisted plan-mode review record with review ID, trace ID, plan ID, and serialized execution state.
- [x] Verify `pending_review=true` and `paused_for_review=true` before approval.
- [x] Verify approval resumes the same trace with a new run ID and exactly one sink call.
- [x] Verify rejection produces no sink call.
- [x] Verify approval after a fresh process using the persisted SQLite state.
- [x] Verify duplicate approval and approve-after-reject fail closed.
- [x] Verify interactive `Y/y` approval and bounded fail-closed input handling.
- [x] Verify the bridge parses structured trace fields rather than process exit code.
- [ ] Complete the native LangGraph prompt-mode pause/resume sweep; local attempts stalled during Python/LangChain imports before generation.

Current result: deterministic plan-mode CAPS HITL is verified for the demo. Do not describe this as production authorization or as completed LangGraph prompt-mode verification.

## Phase 9 — Authorized access feature branch (demo-prep active; production authorization paused)

- [x] Record the distinction between local demo approval and production authorization.
- [x] Record the proposed `Y/n` contract and edge-case matrix.
- [x] Record the branch/base-commit and user-signal gate in [`authorized access.md`](authorized%20access.md).
- [x] Receive explicit user signal to proceed with demo-prep branch work.
- [x] Create `demo/payroll-caps-prep` from the original public CAPS checkout at `4aa58cf…`.
- [x] Add configurable Ollama host/request timeout controls.
- [x] Add local `Y/y` approval and fail-closed timeout/invalid-input controls.
- [x] Run unit tests for the new demo controls and existing policy/guard regressions.
- [x] Complete the deterministic plan-mode pause/resume edge-case sweep.
- [ ] Complete the separate native LangGraph prompt-mode pause/resume edge-case sweep.
- [ ] Leave the branch unmerged and unpushed until separately authorized.

## Verified CAPS runtime behavior

- Plan mode accepts `--approve-sinks` for a review-required sink.
- `--resume-review approve|reject` is restricted by the CLI to prompt mode and requires a thread ID.
- Plan mode can prove a review decision and no pre-approval sink call without Ollama.
- The demo-prep branch adds `scripts/caps_plan_hitl.py` for a persisted plan-mode pause/resume lifecycle without the LangGraph import chain.
- The plan-mode lifecycle preserves `trace_id`, creates distinct run IDs, rejects duplicate resolution, and records exactly one approved sink call.
- Same-thread pause/resume is an optional prompt-mode path and requires local Ollama.
- `trace.json` uses `event_type` values such as `decision`, `tool_call`, `tool_result`, and `final_summary`.
- `trace_graph.json` is a sequential nodes/edges view derived from the trace.

## Current blockers / decisions

- CAPS Guard is connected through a verified local HTTP boundary. The demo server now uses a small native Node HTTP adapter because importing the installed Express dependency graph stalled before `app.listen()` under the current local filesystem/runtime conditions.
- The default system Python 3.14 venv path failed; the working environment is Python 3.13.2 at `.venv313`.
- Ollama is available locally with `llama3.2:3b`; it can be run through a manually started CPU-only server using `LLAMA_ARG_N_GPU_LAYERS=0`. The optional prompt-mode HITL regression remains unverified because its LangGraph child stalled in the local Python import chain before generation.
- The compatibility endpoint `/api/mcp/intent` remains a narrow Phase 1 adapter. The full demo path is the official MCP v2 stdio server plus the bounded local planner at `/api/mcp/local-agent`.
- The current payroll routes are read-only; mutation behavior must remain a synthetic demo sink.
- No arbitrary client-supplied plan paths or approval booleans are permitted.
- The optional approval endpoint is an unauthenticated synthetic demo control; it is not a production authorization mechanism.
- True distributed/database atomicity and production RBAC are not claims of this prototype; the demo does prove a persisted local review gate and fail-closed single-sink execution.

## Evidence log

| Date | Action | Result | Files/artifacts | Decision |
| --- | --- | --- | --- | --- |
| 2026-11-06 | Baseline source audit | Payroll UI and synthetic read API confirmed; CAPS not connected | `PayrollDashboard.jsx`, `backend/server.js`, `DEMO_AGENT_BOUNDARY.md` | Proceed to native CAPS proof before bridge code |
| 2026-11-06 | Frontend production build | Passed: Vite transformed 37 modules and produced `frontend/dist` | `frontend/package.json` | Baseline UI build is verified |
| 2026-11-06 | Backend smoke/read-only reachability check | Not verified: Node smoke test received local `EPERM`; direct `curl` could not connect to port 3001 despite listener entries | Existing port 3001 state | Do not claim backend runtime health; investigate only with explicit server/runtime approval |
| 2026-11-06 | CAPS Guard checkout and environment | Installed public checkout at revision `4aa58cf…`; dependencies installed in isolated `.venv313` | `.caps-tools/caps_guard_public` | Use native CLI/runtime; keep separate from Node dependencies |
| 2026-11-06 | CAPS policy regression | Passed: `policy_precedence_pack` | CAPS Guard `scripts/regression_suite.py --policy-only` | Native policy behavior verified |
| 2026-11-06 | CAPS guard regression | Passed: CLI contract, read/write review, side-effect classification, forbidden args, trace renderer | CAPS Guard `scripts/regression_suite.py --guard-only` | Plan-based trace path is viable |
| 2026-11-06 | CAPS prompt HITL regression (initial attempt) | Not verified: the first run had no reachable Ollama server | CAPS Guard `scripts/regression_suite.py --hitl-only` | Keep same-thread prompt resume unclaimed until rerun |
| 2026-11-06 | Existing native plan execution | Passed: emitted `result.json`, `trace.json`, `trace_graph.json`, and `summary.txt`; plan produced `ALLOW` plus `REVIEW_REQUIRED` with no write `tool_call` before approval | Temporary `/tmp` CAPS output | Use trace artifacts as UI source of truth |
| 2026-11-06 | Exit-code/status verification | Passed: review execute and blocked check both returned process exit `0`; structured artifacts distinguished `REVIEW_REQUIRED` and `BLOCK` | `trace.json`, `check_result.json`, structured CLI output | Bridge must parse decisions, summaries, and tool events; never use exit `0` as execution success |
| 2026-11-06 | Payroll manifest and fixed plans | Passed: JSON validation and native CAPS checks returned `ALLOW` for `search_time_entries`, `REVIEW_REQUIRED` for `change_hourly_rate`, and `BLOCK` for `disburse_bank_payment` | `caps/manifest_payroll.json`, `caps/plans/*.json`, temporary `/tmp/caps_payroll_*` outputs | Use these server-owned fixtures as the only bridge inputs |
| 2026-11-06 | Local Ollama runtime | Passed: local `llama3.2:3b` responded; `ollama ps` reported `100% CPU` after `LLAMA_ARG_N_GPU_LAYERS=0` | Local Ollama `0.30.10`, CPU-only server | No Codex model or hosted inference is part of the CAPS prompt path |
| 2026-11-06 | CPU-only LangGraph HITL regression | Not verified: sandboxed and host-permission retries reached `/api/tags` but stalled before an Ollama generation request; both were stopped | CAPS Guard `scripts/regression_suite.py --hitl-only` | Diagnose prompt-mode execution separately; keep plan-mode integration as the first bridge path |
| 2026-11-06 | Payroll trace inspection and render | Passed: native traces exposed `decision` and `final_summary` events with tool, decision, reason code, rule ID, and execution counters; review trace rendered to HTML | `/tmp/caps_payroll_plan_*/trace.json`, `/tmp/caps_payroll_trace_review.html` | Normalize these structured fields in the Node bridge; do not infer status from stdout or exit code |
| 2026-11-06 | Native payroll adapter and trace correction | Passed: ALLOW emitted one tool call/result; REVIEW_REQUIRED and BLOCK emitted no tool call; approved rate path emitted one synthetic action; duplicate sink decisions were removed from the safe-pass trace | `.caps-tools/caps_guard_public/src/adapters/payroll_api.py`, `.caps-tools/caps_guard_public/src/core/execution_runtime.py`, `.caps-tools/caps_guard_public/scripts/caps_guard.py`, `caps/.runtime/*` | Use the cleaned native plan traces as the bridge contract |
| 2026-11-06 | Node bridge direct smoke test | Passed: fixed keys returned `EXECUTED/CALLED`, `PENDING_REVIEW/NOT_CALLED`, and `BLOCKED/NOT_CALLED`; optional server-owned approval returned `EXECUTED/CALLED` | `backend/caps-guard-bridge.js`, ignored `caps/.runtime/*` | UI state comes from trace decisions and successful tool results, not exit code |
| 2026-11-06 | Payroll UI integration | Passed: guarded scenario panel added and frontend production build passed | `frontend/src/components/PayrollDashboard.jsx`, `frontend/src/styles.css`, `frontend/dist` | Keep agent orchestration separate from this boundary |
| 2026-11-06 | Backend HTTP verification | Not verified: importing the installed Express package hangs before `app.listen()` on port 3011; existing port 3001 listener was left untouched | `backend/server.js`, local runtime | Diagnose dependency/runtime environment separately; do not claim live route verification |
| 2026-11-06 | Express boundary isolation | Passed: Express import remained stalled; native Node HTTP adapter imported and bound successfully after the sandbox-required local-network permission | `backend/native-api-server.js`, `backend/server.js` | Keep the demo transport dependency-light; this does not alter CAPS policy behavior |
| 2026-11-06 | HTTP CAPS scenario verification | Passed: live local requests returned `EXECUTED/CALLED`, `PENDING_REVIEW/NOT_CALLED`, and `BLOCKED/NOT_CALLED`; server-owned approval returned `EXECUTED/CALLED` | Port 3011 responses and generated traces | UI status is trace-derived; exit code remains diagnostic only |
| 2026-11-06 | Native CAPS HITL retry | Not verified: CPU-only Ollama was available, but the LangGraph regression produced no generation request or test output after a bounded two-minute window | `scripts/regression_suite.py --hitl-only`, local Ollama session | Keep native prompt pause/resume unclaimed; wait for a clean local runtime or authorized code work |
| 2026-11-07 | CAPS demo-prep checkout | Created clean worktree branch from original revision; added configurable Ollama host/request timeout and fail-closed local Y/n review controls | `.caps-tools/caps_guard_demo_prep`, branch `demo/payroll-caps-prep`, `DEMO_PREP.md` | Prepare native review path without adding production authorization claims |
| 2026-11-07 | Demo-prep regression checks | Passed: 4 demo-control unit tests, policy regression, and guard regression | CAPS demo-prep checkout | Branch changes preserve existing guard behavior |
| 2026-11-07 | Deterministic plan-mode HITL regression | Passed: 6 tests covering pending pause, no pre-approval sink, approval after a fresh process, stable trace ID, distinct run IDs, one sink call, rejection, and duplicate-resolution failure | `tests/test_demo_hitl.py`, `tests/test_plan_review_store.py` | Use this as the repeatable demo HITL proof |
| 2026-11-07 | App bridge and UI smoke | Passed: bridge smoke returned ALLOW, pending review, approved synthetic write, and BLOCK; frontend production build passed | `backend/caps-guard-bridge.test.js`, `frontend/dist` | Keep UI status trace-derived |
| 2026-11-07 | HTTP restart recovery | Passed: pending review was approved after restarting the Node process; duplicate approval was rejected | Port 3011 API responses and persisted `caps/.runtime/payroll_reviews.sqlite` | Server-owned review identity survives app-process restart |
| 2026-11-07 | Narrow MCP-style orchestration | Passed: direct smoke and live HTTP route mapped bounded intents to fixed scenarios; ALLOW, REVIEW_REQUIRED/approval, and BLOCK all passed; unsupported `tool` field returned HTTP 400 | `backend/mcp-agent.js`, `backend/mcp-agent.test.js`, `/api/mcp/tools`, `/api/mcp/intent` on port 3012 | The demo agent boundary is connected without granting raw tool control |
| 2026-11-07 | Native local-agent implementation and import probe | Implemented a bounded payroll-intent parser, server-owned plan mapping, LangGraph runner, local-agent UI route, and trace telemetry. Verification stopped at the bounded preflight: `langgraph.graph` did not complete import within 2 seconds; traceback showed `langgraph.graph.message` → `langchain_core.messages` → `langchain_core.utils.utils` → `requests` file loading. No native `/api/generate` request occurred. | `.caps-tools/caps_guard_demo_prep/src/core/payroll_agent.py`, `scripts/payroll_agent_demo.py`, `scripts/profile_native_path.py`, `/api/mcp/local-agent`, `caps/.runtime/native-preflight-3/trace.json` | Keep native LangGraph/Ollama/HITL claims unverified; deterministic plan-mode claims remain separate |

## Phase 2 architecture and evidence

```text
User request
  -> bounded local payroll agent
  -> official MCP v2 client (tools/list, tools/call over stdio)
  -> official MCP v2 server
  -> constrained payroll capability validation
  -> CAPS Guard policy/runtime
       ALLOW -> synthetic adapter call
       REVIEW_REQUIRED -> SQLite pending review -> approve/reject -> same plan resumes
       BLOCK -> no sink call
  -> trace/audit result -> agent continuation -> user response
```

The local planner is intentionally deterministic for demo reliability; it is an agent boundary, not a claim of general-purpose LLM reasoning. Ollama/LangGraph remains optional and is not required for the verified final demo path.

| Date | Action | Result | Files/artifacts | Decision |
| --- | --- | --- | --- | --- |
| 2026-11-07 | Official MCP v2 package install | Passed: `@modelcontextprotocol/client@2.4.0` and `@modelcontextprotocol/server@2.4.0`; unused v1 package removed after its AJV import stalled in this host runtime | `backend/package.json`, `backend/package-lock.json` | Use current MCP v2 packages |
| 2026-11-07 | Real MCP protocol smoke | Passed: `tools/list` advertised exactly `route_payroll_intent` and `resolve_payroll_review`; `tools/call` returned CAPS-derived `ALLOW/EXECUTED/CALLED` | `backend/mcp-client.js`, `backend/mcp-server.js` | This is a real MCP loop, not renamed HTTP routes |
| 2026-11-07 | Full agent/HITL smoke | Passed: natural-language rate-plus-payment plan paused with no sink call; fresh process approval resumed the persisted review, executed exactly one rate-change sink, continued, then received CAPS `BLOCK` for payment; reject and duplicate resolution failed closed | `backend/payroll-agent.js`, `backend/mcp-full-demo.test.js`, `caps/.runtime/*` | Full demo success criterion met locally |
| 2026-11-07 | Injection boundary smoke | Passed: strict MCP schemas and server-owned validation rejected raw `tool` and nested `manifest` fields | `backend/mcp-server.js`, `backend/mcp-agent.js` | Agent cannot supply raw execution controls |
| 2026-11-07 | HTTP MCP boundary smoke | Passed: live native HTTP route returned `tools/list` and rejected raw `tool`, `path`, `approval`, `args`, and nested `manifest` fields with HTTP 400 | `backend/mcp-http-boundary.test.js`, `npm run mcp-http-smoke --prefix backend` | HTTP boundary negative coverage is verified |

## 2026-11-07 direct-native-path claim boundary

- [x] Local Ollama connectivity was measured separately: `llama3.2:3b` returned a direct `/api/generate` response in 5.63 seconds; `ollama ps` reported `100% CPU` after the model loaded.
- [x] The native runner now fails closed with `RUNTIME_UNAVAILABLE` and a traceback artifact when its LangGraph import preflight exceeds its bound.
- [x] The model-facing payroll schema accepts only `operation`, `employee_ref`, and `new_rate`; server code maps the result to fixed payroll tools and parameters.
- [x] A direct native local-agent proof completed under `.venv310`: natural language → LangGraph → local Ollama → CAPS policy → persisted HITL → fresh-process approval/rejection → resume → exactly-once sink. This is not proof of the separate Python native-MCP stdio path.
- [x] Measured native approved-action latency is recorded as `1,070.3 ms` on warmed local Ollama CPU inference. This supports avoiding hosted model-request charges in this setup, not a zero-cost claim.

## 2026-11-07 direct-native-path verification update

The earlier Python 3.13 import probe is retained as historical evidence, but it is no longer the only runtime path. A demo-prep Python 3.10 runtime with the current LangGraph/LangChain versions was provisioned at `.caps-tools/caps_guard_demo_prep/.venv310`; the Node bridge now prefers that runtime and still permits an explicit `CAPS_PYTHON` override.

- [x] Natural-language request reached local `llama3.2:3b` through `/api/generate`; model telemetry recorded `1,070.3 ms`, `455` prompt characters, and `69` response characters on the warmed CPU-only local server.
- [x] The bounded model schema accepted only `operation`, `employee_ref`, and `new_rate`; server-owned code mapped the result to `change_hourly_rate` with fixed `E104`/CAD parameters.
- [x] CAPS returned `REVIEW_REQUIRED`; the persisted LangGraph checkpoint reported `executor: NOT_CALLED` before approval.
- [x] A fresh-process approve resumed the checkpoint and produced exactly one successful `change_hourly_rate` tool call/result (`trace_f35a961481`, `attempts: 1`, synthetic adapter status).
- [x] Fresh-process reject produced no tool call/result; a replayed approval returned `REPLAY_REJECTED` with `executor: NOT_CALLED` after the graph-level completed-checkpoint guard was added.
- [x] A native `attempt_payment` request reached the model and CAPS returned `BLOCK` with no sink execution.
- [x] The live demo HTTP route returned `PENDING_REVIEW` with a persisted `native:<thread_id>` review ID, and its approve endpoint returned `EXECUTED/CALLED` with `toolCallCount: 1` and `toolResultCount: 1`.
- [ ] This proves measured local inference and synthetic demo behavior, not a monetary “zero cost” guarantee. No electricity, hardware, or production-capacity cost is estimated, and the runtime remains a local demo dependency.

## Native MCP transport correction — 2026-11-07

- [x] Official MCP v2 `tools/list` and `tools/call` flow remains verified independently.
- [x] The native MCP runner and Node stdio tool-call bridge are present, with server-owned tool mapping and no model-supplied raw tool/path/approval controls.
- [ ] Native MCP end-to-end proof is not complete. Import preflight stalled inside the LangGraph checkpoint/LangChain/Pydantic import chain before Ollama `/api/generate` and before any MCP tool call; the bounded result is `RUNTIME_UNAVAILABLE`.
- [x] The app bridge defaults to the previously verified direct local-Ollama runner. Native MCP requires explicit `CAPS_NATIVE_TRANSPORT=mcp` and remains an experimental test path.

## MCP transport lifecycle root cause and fix — 2026-11-07

- [x] Root cause isolated: the app's hand-rolled `LocalStdioTransport` was incompatible with the MCP v2 client's negotiated stdio lifecycle, so `client.connect()` stalled before `tools/list`; child stderr was also discarded, obscuring the failure.
- [x] Fix applied: `backend/mcp-client.js` now uses the official SDK `StdioClientTransport`, including its negotiation/probe and process teardown behavior.
- [x] Historical isolated verification passed: `mcp-agent.test.js`, `mcp-full-demo.test.js`, direct `tools/list`, and direct `tools/call`; full coverage includes persisted restart, continuation, BLOCK, rejection, duplicate fail-closed, and injection rejection.
- [ ] This does not prove the separate Python native-MCP LangGraph runner. Its import preflight still fails closed before Ollama/MCP because the local LangGraph/LangChain import chain exceeds the 120-second bound.

## 2026-11-08 final reliable-demo verification

- [x] Narrow MCP smoke passed: bounded intent validation, fixed routing, CAPS `ALLOW`, `REVIEW_REQUIRED`, approval, and `BLOCK`.
- [x] CAPS bridge smoke passed: `ALLOW`, pending review, approved synthetic write, and `BLOCK`.
- [x] Fresh-process MCP review test children now close their persistent stdio session before exit; this removes a test-harness resource leak but does not bypass cold dependency I/O.
- [x] HTTP boundary smoke passed with local bind permission: `tools/list` plus rejection of raw tool, path, approval, args, and manifest controls.
- [x] Frontend production build passed: 37 modules transformed.
- [x] Standalone full MCP smoke passed after the shared backend dependency rebuild; the first cold CAPS call took approximately 107 seconds and later calls were warm.
- [ ] Browser screenshots remain pending; current evidence is live HTTP/API responses, structured traces, and the production build.

## 2026-11-09 final recording readiness verification

- [x] Shared backend dependency tree rebuilt offline with `npm ci --offline`; no package-version changes were made.
- [x] Full MCP smoke passed: tools/list, tools/call, bounded planning, persisted review restart, approval continuation, BLOCK, rejection, duplicate fail-closed, and injection rejection.
- [x] Final live safe-read case: `ALLOW` → `EXECUTED` → `CALLED`, tool `search_time_entries`, trace `trace_79f571f567`, one call/result.
- [x] Final live rate-change case: `REVIEW_REQUIRED` → `PENDING_REVIEW` → `NOT_CALLED`; approval returned `EXECUTED` → `CALLED`, trace `trace_4b287cf7a3`, one call/result.
- [x] Final live payment case: `BLOCK` → `BLOCKED` → `NOT_CALLED`, tool `disburse_bank_payment`, trace `trace_4625f48b09`.
- [x] Backend health returned SQLite connected; frontend returned HTTP 200 on port 5174.
- [x] Frontend production build passed: 37 modules transformed.
- [ ] Browser screenshots were not captured by the agent; the local dashboard is ready for the user’s own recording.

## 2026-11-09 shared-app worker isolation update

- [x] Reproduced the apparent UI freeze: cold official MCP SDK/package loading
  in the main Node process could delay `/api/health` and make the dashboard look
  crashed even though CAPS had not failed closed.
- [x] Moved `/api/mcp/local-agent` execution into a bounded child worker with
  controlled JSON stdin/stdout, timeout handling, and forced cleanup.
- [x] Confirmed `/api/health` remains responsive while a cold worker runs.
- [x] Confirmed the shared app route end to end after isolation: hours
  `ALLOW/EXECUTED/CALLED`; rate `REVIEW_REQUIRED/PENDING_REVIEW/NOT_CALLED`,
  then approval `EXECUTED/CALLED`; payment `BLOCK/BLOCKED/NOT_CALLED`.
- [x] Updated the summary UI to use the real bounded MCP route, show explicit
  cold-start progress, and expose synthetic approval only after a persisted
  `PENDING_REVIEW` response.

The reliable recording path is now the shared app’s bounded MCP route. The
separate native Python/Ollama runtime remains isolated work in the other
checkout and is not silently promoted here.

## 2026-11-09 employee-resolution update

- [x] Added a server-owned `search_employee_profiles` MCP capability over the
  synthetic employee directory.
- [x] Added exact-match, partial-match, and synthetic demo-profile resolution.
- [x] Added fail-closed ambiguity handling: seven active Jordans produce
  `NEEDS_CLARIFICATION`, zero CAPS payroll steps, and `NOT_CALLED`.
- [x] Added persisted candidate selection with canonical employee numbers and
  rejection of IDs outside the server-provided candidate set.
- [x] Added the Payroll UI candidate-selection controls before the CAPS rate
  review gate.
- [x] Added focused unit/smoke coverage for ambiguity, exact match, synthetic
  aliases, candidate spoof rejection, and the selected `EMP0062` plan.
- [x] Re-ran the full selected-Jordan CAPS continuation with a fresh MCP
  process: `Jordan` returned seven candidates and no CAPS steps; selecting
  `EMP0062` produced `REVIEW_REQUIRED/NOT_CALLED`; approval produced
  `EXECUTED/CALLED` with exactly one tool call/result and canonical
  `employee_id: EMP0062` in the trace.

## 2026-11-09 employee-resolution boundary and transport hardening

- [x] Added an app-owned synthetic payroll adapter overlay so canonical
  directory IDs such as `EMP0062` are accepted by the CAPS demo sink without
  editing the other agent's `caps_guard_demo_prep` checkout.
- [x] Added strict route validation: an explicit `employee_id` must resolve to
  one active server-directory profile; arbitrary IDs are rejected.
- [x] Normalized approval status from structured trace events and tool results;
  process exit code remains diagnostic and cannot establish execution success.
- [x] Stabilized the official MCP client lifecycle by loading SDK entry points
  sequentially and keeping the session inside a persistent bounded worker;
  protocol errors and worker timeouts still close it fail-closed.
- [x] Full staged proof passed for ambiguous Jordan → candidate selection →
  persisted CAPS review → approval → one successful sink call/result.
- [ ] Cold local Node/MCP/CAPS startup remains machine-dependent and measured
  from about 28 seconds to nearly five minutes in one selection run. The UI
  worker stays bounded and the runbook requires warming the backend before
  recording.
