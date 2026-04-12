# ADR 0013: direct forwarded command lane precedes inference

Status: Accepted
Date: 2026-03-30

## Context

ADR 0001 established AG-UI as the only web-to-agent contract.
ADR 0011 established that runtime assembly and projection ownership belong to `agent-runtime`, not to React or downstream apps.
ADR 0012 established that LangGraph and `agent-runtime` must converge on one shared web-facing snapshot contract.

Portfolio-manager onboarding exposed a separate contract gap on the command path:
- `agent-runtime` already supports a direct AG-UI control lane via `forwardedProps.command`
- interrupt resumes already use that direct lane
- some imperative web actions historically still traveled as JSON user messages and relied on the model to call `agent_runtime_domain_command`
- LangGraph currently uses `forwardedProps.command` only for interrupt resume, not for imperative named commands or `command.update` state-write actions

That split is architecturally wrong for imperative controls. Commands such as `hire`, `fire`, `command.update`, and interrupt resume are not natural-language inputs that need interpretation. They are control-plane requests from the client to the runtime. Routing them through inference adds nondeterminism, couples business flow to prompt/tool behavior, and creates live regressions where the direct runtime path already exists and is better tested.

## Decision

Adopt `forwardedProps.command` as the canonical direct command lane for `agent-runtime`.

The rules are:
- when an AG-UI `run` request includes `forwardedProps.command`, `agent-runtime` must evaluate that command before any inference or model/tool routing
- `forwardedProps.command` is an out-of-band control-plane input, not conversational message content
- imperative client actions for `agent-runtime`, including named commands, `command.update`, and interrupt resume, must use `forwardedProps.command` rather than synthesizing JSON chat messages
- interrupt `resume` payloads may be structured objects and should traverse the direct command lane unchanged; only text-only runtime fallbacks may serialize them later
- `command.update` is the canonical shared-state mutation lane: the client writes writable `/shared` paths with revision-guarded JSON Patch, and the runtime answers with authoritative `shared-state.control` acknowledgments plus any resulting `/shared` and `/projected` state deltas
- accepted `command.update` writes must update the visible client model from the authoritative `STATE_DELTA` before the matching `shared-state.control` `update-ack` clears optimistic pending state
- conversational turns remain message-driven and may use inference normally
- if a direct command is present, the runtime must not require the model to rediscover that intent via `agent_runtime_domain_command`

Preferred cross-runtime direction:
- `forwardedProps.command` is the preferred transport for imperative client actions across runtime families, not only for `agent-runtime`
- runtime families may keep different internal execution models, but the web should converge on one command-lane convention: conversational user input in messages, imperative control actions in `forwardedProps.command`
- until a legacy runtime gains equivalent direct-command support, compatibility branching may remain in the web, but it is a migration state rather than the desired permanent contract

Compatibility rule:
- legacy runtime families may continue using message-driven command dispatch until they gain an equivalent direct command lane, but that compatibility path must not redefine the `agent-runtime` contract or the preferred long-term web command convention

## Rationale

- Keeps imperative business flow deterministic and runtime-owned.
- Aligns command dispatch with the already-canonical interrupt resume path.
- Reduces prompt/tool coupling for state transitions that should not depend on model interpretation.
- Preserves a clean separation between conversational input and control-plane input.
- Makes live command regressions easier to test at the AG-UI boundary.

## Alternatives Considered

- Keep command JSON inside user messages and let the model call `agent_runtime_domain_command`:
  - Rejected because imperative controls become nondeterministic and can fail even when the runtime already supports a direct command lane.
- Move all command interpretation into the web layer:
  - Rejected because React should not own agent business flow or runtime state transitions.
- Remove the model-exposed domain command tool entirely:
  - Rejected because conversational model-driven command selection can still be useful for agent-authored or natural-language flows; the problem is using that path for explicit client control actions.

## Consequences

- Positive:
  - `agent-runtime` commands become deterministic and easier to reason about.
  - Web command handling can share one explicit control-lane contract with interrupt resume.
  - Manual QA and automated tests can exercise command flows without depending on prompt/tool behavior.
  - Future migration away from LangGraph can converge on one control-lane convention instead of preserving two imperative command transports forever.
- Tradeoffs:
  - The web app must distinguish between direct command-capable runtimes and legacy message-driven runtimes during the migration period.
  - Existing tests that assert message-injection for imperative `agent-runtime` commands need to be updated.
- Follow-on work:
  - update web command dispatch so PI-runtime imperative actions use `forwardedProps.command`
  - keep LangGraph compatibility isolated until it gains an equivalent direct command lane for imperative actions
  - add regression coverage that proves direct command forwarding is used for `agent-runtime` named commands and `command.update`
  - when LangGraph is retired or replaced, remove the remaining message-driven imperative-command compatibility path rather than preserving it as a permanent dual-mode convention
