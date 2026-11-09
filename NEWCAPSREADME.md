# CAPS Guard: bounded capability security

This document describes the boundary adopters should rely on when connecting a
natural-language agent, an application, or another intent provider to CAPS
Guard.

## The short version

CAPS Guard is a security and execution boundary for already-resolved,
bounded capabilities. It evaluates whether a server-owned capability may run,
whether a human decision is required, or whether the operation must be
blocked.

CAPS Guard is not a natural-language understanding system. It should not be
made responsible for interpreting every sentence, inventing missing facts, or
acting as a synonym engine. Natural-language interpretation belongs in a
replaceable layer before the CAPS boundary.

The contract is:

```text
natural-language request
        |
        v
intent provider / agent
        |
        v
bounded, validated intent
        |
        v
server-owned capability mapping
        |
        v
CAPS Guard policy and execution boundary
        |
        +--> ALLOW ----------> authorized executor
        +--> REVIEW_REQUIRED -> HITL decision, then resume or reject
        +--> BLOCK -----------> no executor call
```

The model may help resolve what the user meant. It does not receive authority
to define what the system can execute.

## What CAPS Guard is

CAPS Guard is the control plane around a bounded capability execution:

- It evaluates a server-selected capability against a trusted manifest and
  policy.
- It returns `ALLOW`, `REVIEW_REQUIRED`, or `BLOCK`.
- It prevents an executor call when policy blocks the operation or when human
  review has not been satisfied.
- It provides human-in-the-loop review for operations that are sensitive but
  reviewable.
- It records decision and execution evidence in an audit/trace boundary.
- It authorizes the executor only after the applicable policy and review state
  are satisfied.
- It persists review state and protects the same operation from duplicate
  resolution or replay. The storage and transaction guarantees of a
  production deployment must be chosen and operated accordingly.

In this repository's synthetic payroll example, the server owns the mapping
from bounded intents to fixed scenarios:

```text
view_hours      -> search_time_entries     -> READ          -> ALLOW
change_rate     -> change_hourly_rate     -> WRITE         -> REVIEW_REQUIRED
release_payment -> disburse_bank_payment  -> IRREVERSIBLE  -> BLOCK
```

The concrete tool, plan, manifest, policy, and execution arguments are not
selected by the model.

## What CAPS Guard is not

CAPS Guard is not:

- an LLM, an Ollama model, or an NLP/synonym-resolution engine;
- a guarantee that an ambiguous request has a correct interpretation;
- a place for the model to choose raw tool names, paths, manifests, approval
  flags, or arbitrary execution arguments;
- an authorization decision based only on a model's confidence score;
- a replacement for server-side validation, identity, RBAC, or business
  records;
- permission to execute because a model produced syntactically valid JSON;
- a claim that a local demo reviewer is authenticated production approval.

Improving natural-language interpretation can improve usability and reduce
false rejections before CAPS. It does not weaken, bypass, or change CAPS's
security model.

## Where natural-language intent resolution sits

The intent-resolution layer is upstream of CAPS. It may be implemented by a
hosted model, a local model, a deterministic parser, a custom classifier, or a
combination of those components.

```text
+------------------------------+
| User request                  |
| "Pay Sarah using the new $35  |
| rate"                         |
+------------------------------+
               |
               v
+------------------------------+
| Intent provider               |
| Ollama, hosted model, parser,|
| classifier, or custom agent   |
+------------------------------+
               |
               v
+------------------------------+
| Strict schema validation      |
| intent + bounded input only  |
+------------------------------+
        |                    |
        | valid              | invalid, incomplete,
        |                    | or unresolved
        v                    v
+------------------+   +----------------------------+
| Server-owned     |   | MODEL_OUTPUT_REJECTED or  |
| capability map   |   | INTENT_UNRESOLVED        |
+------------------+   | clarify; do not execute   |
        |               +----------------------------+
        v
+------------------------------+
| CAPS Guard                   |
| manifest + policy + HITL +   |
| trace + executor authority  |
+------------------------------+
```

CAPS begins at the `bounded, validated intent` / capability boundary. A
provider must not pass raw natural-language text as though it were an
authorized capability, and CAPS must not silently guess when the provider
cannot establish a valid one.

## Ollama and model choice

Ollama is a local model runtime. It is not itself an intent-resolution model.
The quality of the result depends on the model selected and how it is prompted,
constrained, validated, and tested.

For example, a small local model may produce an incomplete or malformed result
for:

```text
"Do the usual thing for John."
```

A stronger model may resolve more clear requests reliably, but it still cannot
recover facts that the request does not contain. It must not guess whether
“the usual thing” means viewing hours, changing a rate, releasing payment, or
something else.

The relationship is therefore:

```text
better intent model
        -> more useful bounded intents
        -> fewer unnecessary clarification/rejection outcomes

CAPS policy and authority boundary
        -> unchanged
```

The local Ollama integration in this repository is a reference/demo path, not
a CAPS requirement. An adopter may use Ollama, a hosted model, a deterministic
parser, a custom classifier, or another provider as long as the provider
emits the same bounded contract and remains outside the authority boundary.

## The model-facing contract

The provider may return only fields needed to express a bounded intent. A
payroll example is:

```json
{
  "intent": "change_rate",
  "employee_id": "E104",
  "proposed_rate": 35
}
```

The provider must not return or control:

- raw tool names or tool bindings;
- filesystem paths or output directories;
- manifest or plan contents;
- `approve`, `review`, or other approval flags;
- executor selection;
- arbitrary nested arguments, shell commands, SQL, or code;
- hidden instructions that expand the capability beyond the schema.

Server-owned code validates the bounded fields, maps `change_rate` to the
trusted payroll capability, loads the approved plan and manifest, and supplies
the policy context to CAPS. The server may also resolve stable business data
such as employee identifiers and fixed demo parameters. The model is not the
source of authority for any of those decisions.

## Failure states before and inside CAPS

These outcomes are deliberately different:

| Outcome | Where it occurs | Meaning | Executor called? |
| --- | --- | --- | --- |
| `MODEL_OUTPUT_REJECTED` | Before CAPS | The provider output is malformed, out of schema, contains unsupported fields, or attempts to cross the authority boundary. | No |
| `INTENT_UNRESOLVED` | Before CAPS | The request is ambiguous or missing information needed for a safe bounded intent. Ask for clarification or stop. | No |
| `BLOCK` | CAPS | A valid bounded capability reached CAPS, but policy forbids it. | No |
| `REVIEW_REQUIRED` | CAPS | A valid capability is sensitive but may proceed only after the required HITL decision. | No, until approved |
| `ALLOW` | CAPS | A valid capability satisfies policy and may be authorized for execution. | Yes, if execution succeeds |

`MODEL_OUTPUT_REJECTED` and `INTENT_UNRESOLVED` are not CAPS policy blocks:
CAPS never received an authorized capability to evaluate. `BLOCK` is a CAPS
decision on a valid capability.

## Concrete payroll examples

### 1. Safe read: allowed

User request:

```text
"Show Sarah's approved hours for this pay period."
```

The provider resolves a bounded intent:

```json
{
  "intent": "view_hours",
  "employee_id": "E104"
}
```

Server-owned code maps it to `search_time_entries`. CAPS evaluates the
read-only capability and returns `ALLOW`; the executor may run it and the
trace records the decision and result.

### 2. Sensitive write: review before execution

User request:

```text
"Pay Sarah using the new $35 rate."
```

The provider may resolve the rate-change portion as:

```json
{
  "intent": "change_rate",
  "employee_id": "E104",
  "proposed_rate": 35
}
```

The server maps it to `change_hourly_rate`. CAPS returns
`REVIEW_REQUIRED`. There is no rate-change sink call before approval. A
server-created review is then approved or rejected. Approval resumes the same
persisted operation, and replaying an already-resolved review is rejected
instead of executing a second time.

### 3. Irreversible action: blocked

User request:

```text
"Release the payroll payment for E104."
```

Even if the provider resolves this unambiguously to:

```json
{
  "intent": "release_payment",
  "employee_id": "E104"
}
```

CAPS maps the intent to the server-owned `disburse_bank_payment` capability,
classifies it as irreversible, and returns `BLOCK`. No payment executor call is
made. A stronger model does not turn this `BLOCK` into an `ALLOW`.

### 4. Ambiguous request: clarify or fail closed

User request:

```text
"Do John's payroll thing."
```

There is no safe way to determine whether the user wants hours, a rate change,
or payment. The provider should return `INTENT_UNRESOLVED` and ask what the
user wants. It must not invent an operation, and CAPS must not be used to make
the guess appear authorized.

### 5. Unsupported authority request: reject

An output such as this is not a capability request:

```json
{
  "intent": "change_rate",
  "employee_id": "E104",
  "proposed_rate": 35,
  "tool": "run_shell",
  "manifest_path": "/tmp/custom.json",
  "approval": true
}
```

Strict validation returns `MODEL_OUTPUT_REJECTED`. The server does not honor
the extra fields, and no CAPS or executor call is needed.

## Provider independence

The intent provider is an adapter, not the security boundary. It should be
replaceable without changing CAPS policy or executor authorization:

```text
Ollama adapter         \
Hosted-model adapter     \
Deterministic parser      ---> bounded intent schema
Custom classifier        /
                                      |
                                      v
                           same server-owned mapping
                                      |
                                      v
                           same CAPS Guard policy
```

Provider changes may affect how often a request is resolved or how often a
user is asked to clarify. They must not change which tools, manifests, plans,
approval controls, or executor arguments the provider can select.

## Adoption guidance

Keep the boundary explicit:

1. Define a small, versioned bounded-intent schema.
2. Validate provider output strictly and reject unsupported fields.
3. Treat ambiguity and missing facts as clarification/failure, not permission
   to guess.
4. Map intents to capabilities in server-owned code.
5. Keep manifests, plans, policies, executor arguments, and approval state
   outside model control.
6. Send only the validated, server-selected capability to CAPS.
7. Use CAPS decision, HITL state, audit/trace evidence, and replay protections
   as the execution authority.

Do not expand CAPS Guard into a general NLP layer to make weak or ambiguous
language appear executable. If natural-language coverage needs to improve,
improve or replace the intent provider while preserving this boundary.

## Scope of this repository demo

This repository demonstrates the separation with synthetic payroll data and a
local CAPS Guard integration. Its deterministic bounded agent and MCP path are
useful for repeatable boundary tests. The optional Ollama/LangGraph path shows
how a local model can sit upstream of the same boundary; it is not required to
use CAPS Guard and is not, by itself, a production authorization system.

The demo's local reviewer, synthetic records, local runtime, and example
executor must not be presented as authenticated production payroll
authorization, real employee data, or a guarantee of production deployment
properties.
