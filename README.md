# Mockup Software — CAPS Guard Payroll Demo

This repository is a synthetic payroll and time-entry dashboard used to
demonstrate CAPS Guard as an execution boundary for a local agent. It combines
a React/Vite UI, a Node backend, SQLite data, local Ollama, the official MCP v2
client/server, and server-owned CAPS Guard plans.

The demo is intentionally bounded: it does not connect to real payroll data,
real employees, real funds, or production authorization systems.

A deliberately small local sandbox for unfamiliar-code navigation, SQL, UI changes, and the complete database-to-browser data path. It uses SQLite locally, so Docker, Azure, database accounts, and a separate database server are not required.

```text
┌────────────────────┐       SQL       ┌─────────────────┐      JSON      ┌─────────────────┐
│ SQLite database    │ ──────────────▶ │  Node.js API    │ ─────────────▶ │  React + Vite   │
│ Employees          │                 │ /employees      │                │ tables          │
│ Projects           │                 │ /time-entries   │                │ cards           │
│ TimeEntries        │                 │ /payroll-summary│                │ filters         │
│ PayPeriods         │                 └─────────────────┘                └─────────────────┘
└────────────────────┘
```

`simple-html-demo/` shows JavaScript data rendered into an HTML table without React.

## One-time setup

```bash
cd "/Users/msagar/Documents/ChatGPT/ResumeBuilder/MockupSoftware-CAPS-Demo"
npm run install:all
npm run db:init
```

`npm run db:init` creates `database/mockup-practice.db` and seeds 84 employees, 24 clients, 58 projects, 18 pay periods, and 4,200 time entries. Running it again resets the database.

Open `database/mockup-practice.db` directly in DB Browser for SQLite. Do not create an empty database first.

## Start the application

Terminal 1:

```bash
npm run backend
```

Terminal 2:

```bash
npm run frontend
```

Open `http://localhost:5174`. Vite refreshes the page when frontend files are saved and forwards `/api` requests to `http://localhost:3001`.

Verify the API with `npm run smoke --prefix backend`.

## CAPS Guard payroll demo

The payroll panel uses three fixed, synthetic scenarios behind a server-owned
CAPS Guard boundary:

```text
view_hours      -> ALLOW            -> synthetic read executes
change_rate     -> REVIEW_REQUIRED  -> persisted local review, then optional approval
release_payment -> BLOCK            -> no sink call
```

### Quick case: natural language to a guarded payroll tool

The local agent may interpret the request, but it does not receive authority to
choose a raw tool, path, approval flag, or arbitrary argument. The MCP server
owns the bounded intent schema and the trusted capability mapping:

```text
User
  ↓
Agent / local Ollama
  ↓
bounded intent
{
  intent: "change_rate",
  employee_id: "E104",
  proposed_rate: 35
}
  ↓
CAPS-controlled gateway
  ↓
trusted mapping
"change_rate" → payroll rate-change capability
  ↓
CAPS policy evaluation
  ↓
ALLOW / REVIEW_REQUIRED / BLOCK
  ↓
actual business tool
```

For this synthetic case, `change_rate` is mapped by server-owned code to the
payroll rate-change capability. A `REVIEW_REQUIRED` result pauses before the
sink; only the persisted review resolution can resume it. Ambiguous or
malformed model output fails closed as `MODEL_OUTPUT_REJECTED`, while an
explicit irreversible payment request reaches CAPS and is demonstrated as
`BLOCK` with no sink call.

This diagram describes the execution boundary, not production authorization.
The demo reviewer is local and synthetic; authenticated RBAC, real payroll,
and production deployment are not claimed here.

Run the bridge smoke test from the app root:

```bash
npm run caps-guard-smoke
```

The bridge reads `decision`, `tool_call`, and successful `tool_result` events
from `trace.json`. A process exit code of `0` is not treated as execution
proof. The approval control is a local synthetic demo reviewer; it is not
authenticated production RBAC.

The deterministic plan-mode HITL runner and its repeatable tests live in the
demo-prep checkout at `../.caps-tools/caps_guard_demo_prep` on branch
`demo/payroll-caps-prep`. The native LangGraph/Ollama/MCP path is also verified
for review approval, rejection, replay rejection, and payment blocking. It is
an explicit opt-in local runtime; the first cold request can take roughly
2–3 minutes while Python/LangGraph and MCP dependencies load, while warm
actions are much faster. See [`docs/demo/DEMO_RUNBOOK.md`](docs/demo/DEMO_RUNBOOK.md)
for the recording sequence and
[`docs/demo/CAPS_GUARD_PAYROLL_TRACKER.md`](docs/demo/CAPS_GUARD_PAYROLL_TRACKER.md)
for evidence and limitations.

The dashboard also exposes a real local MCP agent path. The backend starts an official MCP v2 server over stdio and the bounded local agent uses the corresponding MCP client. The server advertises only three constrained capabilities:

```text
search_employee_profiles  -> bounded employee disambiguation
route_payroll_intent      -> server-owned CAPS scenario
resolve_payroll_review    -> persisted CAPS review resume/reject
```

The compatibility adapter remains available at `/api/mcp/intent`, but it is intentionally documented as Phase 1 and is not the full orchestration path.

Run the full local demo with the natural-language request `Pay Sarah using the new $35 rate`:

```text
user request
  -> bounded local agent
  -> MCP tools/list + tools/call over stdio
  -> MCP server validation
  -> CAPS Guard ALLOW | REVIEW_REQUIRED | BLOCK
  -> SQLite review pause/resume
  -> trace result back to the agent
  -> continuation: approved rate change, then blocked payment
```

```bash
env CAPS_MCP_CONNECT_TIMEOUT_MS=240000 \
    CAPS_MCP_CONNECT_ATTEMPTS=1 \
    CAPS_MCP_REQUEST_TIMEOUT_MS=240000 \
    npm run mcp-full-smoke --prefix backend
```

This verifies real protocol discovery, constrained calls, no pre-approval sink call, fresh-process review recovery, exactly one approved rate-change sink call, rejection, duplicate-resolution failure, continuation, and payment blocking.

## Three recording cases

| Case | CAPS result | Execution result |
| --- | --- | --- |
| View approved hours | `ALLOW` | `EXECUTED`, `CALLED` |
| Change hourly rate | `REVIEW_REQUIRED` | Pauses for local approval or rejection |
| Attempt payment | `BLOCK` | `BLOCKED`, `NOT_CALLED` |

CAPS decisions and execution evidence come from structured traces. A process
exit code of `0` is not treated as proof that a payroll action executed.

## Native local-runtime startup

```bash
ollama serve
curl http://127.0.0.1:11434/api/tags
ollama ps
```

Start the backend with the native path explicitly enabled:

```bash
CAPS_NATIVE_TRANSPORT=mcp \
CAPS_MCP_CONNECT_TIMEOUT_MS=180000 \
CAPS_MCP_CONNECT_ATTEMPTS=1 \
npm run backend
```

The Node backend owns a persistent official MCP session. Short-lived Python
LangGraph start/resume processes use a token-protected loopback handoff, so a
review approval does not reload a second cold MCP client. A timeout fails
closed as `RUNTIME_UNAVAILABLE`/`NOT_CALLED`.

### Live CAPS execution graph

The UI exposes the same request as a live, server-authoritative execution graph:

```text
Request received
  -> Intent boundary
  -> Capability routing
  -> CAPS policy
  -> Human review (when required)
  -> Payroll tool
  -> Trace and audit
```

The graph subscribes to `GET /api/caps-guard/events/:trace_id` using Server-Sent
Events. Each lifecycle event is keyed by `trace_id` and `node_id`, and carries a
bounded state such as `running`, `waiting`, `completed`, `blocked`, `failed`, or
`skipped`. The UI colors these states green, yellow, red, dark red, or gray.
The stream is an observability surface owned by the CAPS boundary; it does not
claim to expose private Ollama reasoning. The final `trace.json` remains the
authoritative audit artifact. The in-memory event buffer is process-local, so a
backend restart requires the UI to reconnect while persisted review and trace
state remain separate.

## Central documentation index

Supporting Markdown is centralized under [`docs/README.md`](docs/README.md):

- [`docs/demo/DEMO_RUNBOOK.md`](docs/demo/DEMO_RUNBOOK.md) — exact recording sequence.
- [`docs/demo/CAPS_GUARD_PAYROLL_TRACKER.md`](docs/demo/CAPS_GUARD_PAYROLL_TRACKER.md) — checkbox tracker and evidence.
- [`docs/demo/AUTHORIZED_ACCESS.md`](docs/demo/AUTHORIZED_ACCESS.md) — local HITL versus production authorization.
- [`docs/database/README.md`](docs/database/README.md) — database reference.
- [`docs/exercises/`](docs/exercises/) — SQL, frontend, full-stack, and interview notes.
- [`docs/exercises/solutions/`](docs/exercises/solutions/) — exercise solution notes.

The two boundary references remain intentionally visible at the repository
root: [`DEMO_AGENT_BOUNDARY.md`](DEMO_AGENT_BOUNDARY.md) and
[`NEWCAPSREADME.md`](NEWCAPSREADME.md).

The old Phase 1 route remains:

```text
POST /api/mcp/intent
{ "intent": "view_hours", "context": { "surface": "operations_summary" } }
```

It accepts only a bounded intent and display context, maps to a fixed server-owned scenario, and returns the CAPS trace-derived result. Both paths reject raw tool names, paths, manifests, arguments, and approval flags. Production RBAC/authenticated authorization is not claimed by this synthetic local demo.

## CAPS Guard capability model

CAPS Guard evaluates an already-resolved, bounded capability. It is not an LLM,
an NLP synonym engine, or a replacement for identity and RBAC. Natural-language
interpretation belongs upstream; the server owns the mapping from bounded
intent to the concrete tool, plan, manifest, arguments, and review behavior.

```text
natural-language request
        ↓
bounded intent provider
        ↓
server-owned capability mapping
        ↓
CAPS Guard policy
        ├── ALLOW            → executor may run
        ├── REVIEW_REQUIRED  → persisted HITL decision, then resume/reject
        └── BLOCK            → executor is not called
```

The model cannot supply raw tool names, filesystem paths, manifests, approval
flags, or arbitrary execution arguments. The full local reference remains in
[`NEWCAPSREADME.md`](NEWCAPSREADME.md).

## Follow one value

```text
SQLite TimeEntries.HoursWorked
→ SQL result property HoursWorked
→ JSON property HoursWorked
→ React row.HoursWorked
→ HTML <td>
```

## Practice

Open `exercises/SQLITE_WORKBOOK.sql` in DB Browser for SQLite. It contains every SQLite prompt as a comment followed by a blank answer area, so you can write and execute solutions without switching files. Then use [`docs/exercises/FRONTEND.md`](docs/exercises/FRONTEND.md), [`docs/exercises/FULL_STACK.md`](docs/exercises/FULL_STACK.md), and [`docs/exercises/MOCK_INTERVIEW.md`](docs/exercises/MOCK_INTERVIEW.md). Do not open `docs/exercises/solutions/` before completing your own attempt.

The original SQL Server files under `database/` remain only as clearly labeled T-SQL reference material. They are not used by the application. SQLite cannot execute SQL Server stored procedures, `CROSS APPLY`, `OUTER APPLY`, or SQL Server `CONVERT` styles.

## Vanilla HTML demo

Open `simple-html-demo/index.html` directly, or run `npm run demo` and open `http://localhost:4174`.
