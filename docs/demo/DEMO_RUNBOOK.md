# CAPS Guard Payroll Demo Runbook

This runbook covers the native synthetic demo path. It uses local Ollama and
LangGraph to produce a bounded payroll intent, the official MCP v2 client/server,
server-owned CAPS plans, and trace-derived results. The native path is verified
for review approval, rejection, replay rejection, and payment blocking. A
completely cold start can take roughly 3–5 minutes on this machine while the
official MCP SDK and stdio session load; the first CAPS route can add another
40–55 seconds, and warm actions are much faster. This is not a
production authorization service.

## Latest native runtime fix — 2026-11-10

The Python start/resume processes now use a token-protected loopback handoff to
the long-lived Node backend. The backend owns and reuses the official MCP v2
session, so approval does not spawn a second cold Node/MCP session. The native
MCP path remains fail-closed: a runtime timeout yields `NOT_CALLED` and is never
reported as a policy decision or successful payroll execution.

## Start

From the app directory, with all local processes stopped:

```bash
npm run db:init # initial setup only; do not reset the database for recording
```

Start Ollama in its own terminal and verify the model is available:

```bash
ollama serve
curl http://127.0.0.1:11434/api/tags
curl -sS http://127.0.0.1:11434/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"model":"llama3.2:3b","prompt":"Return READY only.","stream":false}'
ollama ps
```

The required model is `llama3.2:3b`. `ollama ps` may be empty until the first
native request; the first request loads the model. Start the backend with the
native transport explicitly enabled:

```bash
CAPS_NATIVE_TRANSPORT=mcp \
CAPS_MCP_CONNECT_TIMEOUT_MS=180000 \
CAPS_MCP_CONNECT_ATTEMPTS=1 \
npm run backend
```

Verify the backend and capability boundary before opening the UI:

```bash
curl http://127.0.0.1:3001/api/health
curl http://127.0.0.1:3001/api/mcp/tools
curl http://127.0.0.1:3001/api/native/readiness
```

The backend deliberately does not prewarm the MCP SDK inside the main HTTP
startup callback. A cold synchronous package load can otherwise make the page
appear crashed before the first action. After the listener is available, the
backend starts an isolated deterministic-worker preflight. `status:
"not_started"` is healthy at the first instant; the UI then shows `Preparing`
and disables deterministic-agent buttons until `/api/mcp/local-agent/readiness`
reports `ready`. A status of `failed` is a runtime failure, not an ALLOW/BLOCK
result.

There is no separate MCP daemon command in this repository. The Node MCP client
spawns the official stdio MCP server when a native capability call is made, and
the native Python/LangGraph process is spawned for the native request. The
backend command above is the CAPS/API boundary for both.

At backend startup, the deterministic MCP worker preflights `tools/list` in a
separate child process. The HTTP server remains responsive while that preflight
loads. Wait for the backend log line `Deterministic MCP worker readiness:` or
for the UI status to change from `Preparing` to `Connected` before recording
the deterministic fallback path.

The demo backend uses the non-watch start command so it is not blocked by the
local file-watcher limit. Use `npm run backend:watch` only when you explicitly
need hot reload.

Start the frontend in a second terminal:

```bash
npm run frontend
```

The dashboard is synthetic. No banking system, production payroll service, or real employee data is connected.

## Native rehearsal gate

In the Payroll dashboard, keep **Native Ollama + LangGraph** selected and use:

```text
Alex, change rate to $42
```

For each trial, verify the timing strip shows these boundaries:

```text
request received → native runtime ready → LangGraph ready
→ Ollama inference start → intent produced → MCP/CAPS handoff
→ policy decision → human approval/rejection → sink/tool execution
→ terminal audit
```

The native trial gate used here was three fresh successful runs. Each run
returned `REVIEW_REQUIRED`, paused with `0` sink calls, resumed after approval,
and finished with exactly `1` tool call, `1` tool result, and terminal audit
evidence. A separate native `Alex, release payment` trial returned `BLOCKED`
with `0` sink calls/results.

Observed native trial timings (fresh Python process per request):

| Trial | Runtime ready | LangGraph ready | Ollama | First policy | Terminal audit | Sink |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 8 | 651 ms | 1,270 ms | 935.3 ms | 2,338 ms | 6,811 ms | 1 call / 1 result |
| 9 | 340 ms | 854 ms | 840.9 ms | 1,828 ms | 6,214 ms | 1 call / 1 result |
| 10 | 294 ms | 778 ms | 770.6 ms | 1,663 ms | 5,732 ms | 1 call / 1 result |
| BLOCK | 318 ms | 799 ms | 1,009.2 ms | 1,938 ms | 1,939 ms | 0 calls / 0 results |

The terminal values for approved runs include the approval/resume step; they
are not pure model latency.

Historical pre-fix caveat: one corrected-bridge start reached
`REVIEW_REQUIRED` after about 56.6 seconds, but its approval continuation
failed closed after the 120-second MCP bridge bound. The current persistent
backend-session fix passed the approval, rejection, replay, and payment-BLOCK
matrix. Keep the deterministic fallback available, and allow the first native
request to warm the local runtime before recording.

The timing is persisted in the native `trace.json` as `native_timing` and is
also shown in the Execution Graph. The underlying CAPS trace remains the
authority for policy, sink, and audit evidence.

For a customer-facing recording, keep the dashboard visible and keep two VS
Code terminals available beside it: one for the backend and one for the
frontend. The terminal is setup/evidence support; the dashboard is the demo
surface. Start the backend first and wait for the readiness endpoint, not only
the API listening line, before clicking an agent action. Run one rehearsal
after readiness so the first CAPS/Python render path is warm before recording.

## Case 1 — Native sensitive write: REVIEW_REQUIRED

Run the native prompt above.

Expected result before approval:

```text
intent: change_rate
CAPS decision: REVIEW_REQUIRED
status: PENDING_REVIEW
executor: NOT_CALLED
tool calls: 0
tool results: 0
```

Approve the server-created review. Expected terminal result:

```text
status: EXECUTED
executor: CALLED
tool call count: 1
tool result count: 1
terminal audit: complete
```

## Case 1A — Native identity resolution: unique Jordan

Use:

```text
Change hourly rate for Jordan from $38.22 to $42
```

The native intent includes bounded current-rate context. The server-owned MCP
directory resolves exactly one candidate, Jordan Patel (`EMP0062`), before CAPS
evaluates the rate change. It then follows the normal
`REVIEW_REQUIRED → approve → 1 call / 1 result → terminal audit` path.

## Case 1B — Native identity resolution: ambiguous Jordan

Use:

```text
Change hourly for Jordan to $37
```

The directory returns multiple active Jordan profiles and the native graph
pauses with `NEEDS_CLARIFICATION` before CAPS policy evaluation. Select a
server-returned profile in the UI. The LangGraph checkpoint resumes identity
resolution and continues to `REVIEW_REQUIRED` without another Ollama inference.

## Case 2 — Safe read: ALLOW

Use the Agent readiness panel and select **Ask for hours**.

Expected result:

```text
intent: view_hours
CAPS decision: ALLOW
status: EXECUTED
executor: CALLED
tool: search_time_entries
```

Narrative: the agent requests a read-only time-entry summary. CAPS evaluates the server-owned read plan and permits the synthetic adapter call.

What **Ask for hours** does: it sends the fixed prompt `Show Sarah hours` to
the bounded local agent. The agent does not receive a raw tool name or path. It
maps the request to `view_hours`, calls the official MCP stdio capability, and
CAPS decides whether the server-owned `search_time_entries` sink may run.

## Case 3 — Deterministic sensitive write: REVIEW_REQUIRED

Select **Ask to change rate**.

Expected result before approval:

```text
intent: change_rate
CAPS decision: REVIEW_REQUIRED
status: PENDING_REVIEW
executor: NOT_CALLED
```

Narrative: CAPS pauses before the rate-change sink. The trace and persisted review state prove that no write happened before approval.

Approve the local synthetic review through the demo approval control, then verify:

```text
status: EXECUTED
executor: CALLED
tool call count: 1
tool result count: 1
```

## Case 4 — Native irreversible action: BLOCK

Enter:

```text
Alex, release payment
```

Expected result:

```text
CAPS decision: BLOCK
status: BLOCKED
executor: NOT_CALLED
tool call count: 0
tool result count: 0
terminal audit: complete
```

## Case 5 — Deterministic irreversible action: BLOCK

Select **Ask to release payment**.

Expected result:

```text
intent: release_payment
CAPS decision: BLOCK
status: BLOCKED
executor: NOT_CALLED
tool: disburse_bank_payment
```

Narrative: CAPS blocks the irreversible payment capability deterministically. There is no approval bypass and no payment sink call.

## Evidence to show

## Optional natural-language variation proof

To show that the capability boundary is not tied to one sentence, use these
rate-change phrasings in the deterministic fallback rehearsal. Each resolves to
the same bounded `change_rate` capability and then follows the same CAPS review
path:

```text
Change Alex's rate to $42.
Alex should be making 42 now.
Can you bump Alex to forty-two an hour?
Set Alex's hourly pay to $42.
I need Alex moved from 38 to 42.
```

The regression is `npm run nl-smoke`. This proves the bounded local parser's
supported variation set; it does not claim universal Ollama language
understanding. Regardless of wording, the model or parser must produce the
same validated intent schema before MCP and CAPS are called.

For every case, show the structured result rather than relying on process exit code or terminal text:

- decision: `ALLOW`, `REVIEW_REQUIRED`, or `BLOCK`
- status: `EXECUTED`, `PENDING_REVIEW`, or `BLOCKED`
- executor: `CALLED` or `NOT_CALLED`
- tool name, rule ID, reason code, and trace ID
- links to `trace.json`, `trace_graph.json`, and rendered trace HTML when available

## Verification commands

```bash
npm run mcp-full-smoke --prefix backend
npm run mcp-http-smoke --prefix backend
npm run build --prefix frontend
```

The deterministic MCP fallback remains available through the **Deterministic
MCP fallback** selector if the local native runtime is unavailable. Do not call
that fallback a native Ollama run.

The first MCP action may include local SDK/process cold-start latency. The
Node bridge runs the deterministic bounded agent in a persistent worker process
so a cold SDK import cannot freeze the HTTP server; the worker reuses its
official MCP stdio session while warm. Persisted SQLite review state remains
server-owned. Complete one full approved rehearsal before recording; this
machine has shown cold local MCP/CAPS runs from about 28 seconds to nearly five
minutes, while warm calls are normally much faster.

## What to say about MCP orchestration

Use this sentence:

> “The user request is bounded before it reaches the tool layer. MCP exposes
> only payroll capabilities, CAPS Guard makes the policy decision, and the
> synthetic sink runs only when the trace proves it was allowed or approved.”

For the native recording, say:

> “The local model produces only a bounded payroll intent. MCP routes that
> capability to CAPS Guard, CAPS makes the policy decision, and the synthetic
> sink runs only after the trace proves approval.”

For an ambiguity demonstration, enter `Change Jordan hourly rate to $35` in
the Payroll local-agent panel. The agent must list the matching profiles and
stop. Select one candidate, such as Jordan Patel, then continue to the normal
CAPS `REVIEW_REQUIRED` approval gate. No CAPS payroll review or sink call is
created while the identity is ambiguous.

## If the page appears frozen

Do not click the action repeatedly. Look for `Checking…` in the panel and
confirm the server is still alive:

```bash
curl http://127.0.0.1:3001/api/health
```

If it returns `{"status":"ok","database":"connected",...}`, the request is
still in the bounded worker. A true failure should return an error state rather
than silently claiming execution. Refreshing the UI is safe; do not approve a
review unless the panel shows `PENDING_REVIEW` and a server-created review
control.
