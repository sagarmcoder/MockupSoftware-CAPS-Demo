# Bounded Capability Architecture

Status: **Demo-ready local implementation.** The payroll domain is synthetic;
the architecture is the bounded capability boundary. Native local Ollama,
official MCP, CAPS Guard, persisted review/resume, and trace-derived outcomes
are implemented for local rehearsal. Production identity, RBAC, and distributed
authorization are not claimed.

## Central thesis

> Natural language can be flexible while authority remains rigid.

The agent expresses intent. Server-owned infrastructure determines which
capability that intent can use, which plan and policy apply, whether a human
decision is required, and whether the synthetic sink may execute.

## What is real in this repository

```text
Natural language request
        ↓
Native local agent or deterministic local fallback
        ↓
MCP tools/list + tools/call over stdio
        ↓
search_employee_profiles (identity gate)
        ↓
route_payroll_intent / resolve_payroll_review
        ↓
server-owned payroll scenario, manifest, and plan
        ↓
CAPS policy evaluation
        ↓
ALLOW | REVIEW_REQUIRED | BLOCK
        ↓
synthetic adapter or persisted review/resume
        ↓
trace.json, trace graph, and structured response
        ↓
agent continuation and user response
```

The actual implementation is split across these boundaries:

| Boundary | Current implementation | Authority |
| --- | --- | --- |
| Natural-language interpretation | `backend/caps-guard-bridge.js` native runner plus `backend/payroll-agent.js` deterministic fallback | Produces bounded intent only |
| MCP transport | `backend/mcp-client.js`, `backend/mcp-server.js` | Exposes a deliberately small capability surface |
| Identity resolution | `backend/employee-directory.js`, `search_employee_profiles` | Resolves one server-owned synthetic employee or stops for selection |
| Intent routing | `route_payroll_intent` in `backend/mcp-agent.js` | Accepts only the bounded intent schema |
| Review continuation | `resolve_payroll_review` plus persisted local-agent session state | Advances the existing review; it does not restart the original request |
| CAPS boundary | `backend/caps-guard-bridge.js` and `caps/manifest_payroll.json` | Owns policy, fixed plans, review state, trace evidence, and sink gating |
| Synthetic execution | `caps/payroll_adapter.py` and the CAPS demo-prep checkout | Executes only after trace evidence proves permission |
| UI status | `frontend/src/components/PayrollDashboard.jsx` | Displays structured decision/execution evidence, not exit-code guesses |

## Naming recommendation

Keep the current payroll-specific MCP names in code:

```text
route_payroll_intent
resolve_payroll_review
```

They accurately describe the current tool contract and changing them would add
compatibility risk without improving the demo. Use these generic names in
architecture explanations:

```text
route_bounded_intent
resolve_action_review
```

The relationship is conceptual, not a second hidden API:

```text
route_bounded_intent  ≈  route_payroll_intent
resolve_action_review ≈  resolve_payroll_review
```

The approximation is valid because the current payroll tools create or advance
a controlled workflow; the implementation remains intentionally domain-scoped.

## Agent, server, and CAPS responsibilities

### Agent responsibilities

- Understand natural-language variation.
- Extract a bounded operation, employee reference, and proposed rate when relevant.
- Choose among exposed bounded interfaces.
- Continue the conversation from structured results.

The agent cannot supply a raw executable tool, filesystem path, manifest,
approval flag, arbitrary SQL, or unrestricted argument object.

### Server/application responsibilities

- Define capabilities and strict schemas.
- Resolve employee identity through the synthetic directory.
- Stop on ambiguity and require an explicit candidate from the server-provided list.
- Select the server-owned manifest and fixed plan.
- Validate arguments and call the approved adapter.

### CAPS responsibilities

- Evaluate the already-resolved capability.
- Return `ALLOW`, `REVIEW_REQUIRED`, or `BLOCK`.
- Persist and resume a review-required execution.
- Prevent pre-approval or blocked sink calls.
- Produce trace and execution evidence.

CAPS Guard is not the natural-language synonym engine, the employee directory,
or production RBAC. Better model interpretation can improve usability, but it
does not expand the capability schema or policy authority.

## Current capability matrix

| Natural-language example | Bounded capability | CAPS outcome | Current status |
| --- | --- | --- | --- |
| “Show Sarah hours.” | `view_hours` → `search_time_entries` | `ALLOW` → `EXECUTED` / `CALLED` | Implemented and verified |
| “Change Alex’s rate to $42.” | `change_rate` → `change_hourly_rate` | `REVIEW_REQUIRED`, then `ALLOW` after approval | Implemented and verified |
| “Pay Sarah using the new $35 rate.” | `change_rate`, then `release_payment` | Rate change can execute after review; payment reaches `BLOCK` | Implemented and verified |
| “Change Jordan’s rate to $35.” | `search_employee_profiles` first | `NEEDS_CLARIFICATION`; CAPS is not called yet | Implemented and verified |
| “Set every employee’s rate to $1.” | No supported bounded bulk capability | Reject or block; no arbitrary bulk plan exists | Not implemented as an executable capability; safe negative boundary |
| “What is Alex’s current rate?” | Proposed `read_employee_rate` | No current dedicated capability | Documented future extension |
| “Give Maria a $500 bonus.” | Proposed `issue_bonus` | No current dedicated capability | Documented future extension |
| “Show payroll changes.” | Proposed `list_payroll_changes` | No current dedicated capability | Documented future extension |

The demo intentionally stops at three policy outcomes: safe read, sensitive
write, and forbidden irreversible action. Additional capabilities should be
added only with their own server-owned plans, adapter contract, policy rules,
trace expectations, and tests.

## Natural-language variation evidence

The deterministic local-agent parser regression covers these five phrasings:

| Prompt | Resolved intent | Employee | Proposed rate | Current rate |
| --- | --- | --- | ---: | ---: |
| “Change Alex’s rate to $42.” | `change_rate` | Alex | 42 | — |
| “Alex should be making 42 now.” | `change_rate` | Alex | 42 | — |
| “Can you bump Alex to forty-two an hour?” | `change_rate` | Alex | 42 | — |
| “Set Alex’s hourly pay to $42.” | `change_rate` | Alex | 42 | — |
| “I need Alex moved from 38 to 42.” | `change_rate` | Alex | 42 | 38 |

Run the bounded resolver regression with:

```bash
npm run nl-smoke
```

This proves deterministic local parsing, not universal language understanding.
The native Ollama path can interpret additional phrasing, but its model output
still must validate against the same bounded schema before MCP or CAPS sees it.

## HITL persistence semantics

The reviewed path is a continuation of one controlled execution:

```text
request
  → persisted review and session state
  → human approve/reject decision
  → resolve_payroll_review(review_id, decision)
  → same persisted execution resumes or stops
  → trace continuity and structured result
```

Approval does not re-submit the original natural-language request. Duplicate
approval and approval after rejection fail closed. Before approval, the target
sink has zero calls; after approval, the approved rate-change path has exactly
one successful call/result. A rejected or blocked action has no sink call.

The local reviewer is synthetic. A production approval system would add
authenticated identity, RBAC, scope checks, expiry, durable audit actors,
idempotency, and distributed replay protection.

## Extending beyond payroll

Payroll is the example domain, not the architecture. The same shape can be
used for other bounded capability sets:

```text
IT:       disable_account | reset_mfa | list_inactive_users
Finance:  create_reimbursement | list_unpaid_invoices | void_invoice
Support:  refund_order | change_shipping_address | list_tickets
Infra:    restart_staging_api | scale_staging | delete_production_database
HR:       update_manager | read_vacation_balance | terminate_access
```

These are conceptual examples, not claims that this repository implements
those domains. Each domain would bring its own capabilities, plans, adapters,
policies, and tests while preserving the bounded agent + MCP + server authority
+ CAPS + review/trace pattern.

## Demo decision sequence

For a reliable recording, use the three fixed cases in
[`DEMO_RUNBOOK.md`](DEMO_RUNBOOK.md):

1. Read hours: show `ALLOW`, `EXECUTED`, `CALLED`.
2. Change a rate: show `REVIEW_REQUIRED`, `PENDING_REVIEW`, `NOT_CALLED`; approve and show exactly one call/result.
3. Release payment: show `BLOCK`, `BLOCKED`, `NOT_CALLED`.

Warm the local runtime before recording. If the native runtime is unavailable,
use the clearly labelled deterministic MCP fallback; do not call it an Ollama
run. In every case, show the structured result and trace rather than relying on
process exit code or terminal text.
