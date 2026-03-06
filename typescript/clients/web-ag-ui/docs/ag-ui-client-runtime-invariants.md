# AG-UI Client Runtime Invariants

Status: Draft  
Date: 2026-02-18  
Scope: `apps/web` client behavior for AG-UI `connect`/`run` lifecycle and concurrency handling

## 1. Purpose

Define non-negotiable client invariants for:

- concurrent `connect` and `run` flows on the same `agentId+threadId`
- server-reported busy run conditions
- command-specific behavior (`sync` vs `fire`)

These rules complement the C4 target architecture and make runtime behavior deterministic under race conditions.

## 2. Terms

- `Detail-page connect`: long-lived detail-page stream started via AG-UI `connect` while that agent detail page is active.
- `Run stream`: AG-UI stream created by `run` command execution.
- `Polling snapshot`: short-lived projection update produced by a one-shot AG-UI poll `run` for agents whose detail page is not currently active.
- `Busy`: server rejects a run because an active run already exists (e.g., 409/422 or equivalent busy message).
- `Authority`: source of truth used to update client projection state.
- `Client mutation intent`: web-side state/message change to be applied on agent via the next AG-UI `run` input.
- `ThreadState`: agent-emitted domain/workflow state snapshot.
- `UiState`: ViewModel-derived render model for React components.

## 3. Invariants

1. AG-UI-only boundary:
   - Web communicates with agents only through AG-UI `connect`/`run` flows via `/api/copilotkit`.
   - `stop` is allowed only as a `fire` preemption control.
   - No direct web calls to LangGraph `/threads`, `/runs`, or `/state`.

2. State write path:
   - Client-to-agent state mutation must flow through AG-UI `run` input (`RunAgentInput.state`).
   - `connect` is attach/replay for projection continuity and is not a mutation write channel.
   - Practical client pattern: update local agent state/message model, then dispatch `run`.

3. Stream ownership:
   - At most one long-lived detail-page `connect` stream per web client runtime instance (for example, a browser tab) while an agent detail page is active.
   - Navigating away from the agent detail page (or unmount) must deterministically detach that stream.

4. Polling execution path:
   - Non-active-detail polling must use one-shot AG-UI `run` invocations.
   - Polling must not keep a persistent `connect` loop alive.
   - Poll runs should terminate quickly after emitting the latest projection.

5. State authority:
   - Multiple ingress channels are valid (`connect`, `run`, polling), but authority is single-owner per agent at any moment.
   - Active detail-page agent: `connect` stream is authoritative for continuous projection.
   - Non-active-detail agents: polling snapshots projected from one-shot poll `run` are authoritative for sidebar projection.
   - If neither `connect` nor poll data is available, active `run` stream is temporary authority for that command lifecycle.
   - All ingress channels must honor one authority gate and one projection contract (no split write paths).

6. Local gating is advisory:
   - Client-side in-flight flags prevent accidental double-submit from one UI instance.
   - They are not global truth because agent runs may start externally.

7. Busy response is authoritative:
   - Server busy is normalized to a deterministic concurrency outcome (not an unknown failure).
   - Client transitions to observe/retry policy instead of dead-ending.

8. `sync` command policy (coalescing intent):
   - `sync` represents “latest desired mutation/state refresh intent,” not an unbounded queue item.
   - Keep a single pending `sync` intent per `agentId+threadId` (last-write-wins).
   - If current run is active, defer dispatch; replay once terminal state is observed.
   - If replay hits busy, keep pending and retry with bounded policy.

9. `fire` command policy (preemptive):
   - `fire` is an escape hatch and the only command allowed to preempt active backend execution.
   - Client issues AG-UI stop preemption first, then detaches local stream ownership.
   - Client waits for terminal acknowledgment or bounded timeout before dispatching `fire`.
   - `fire` may use bounded retry for short server finalization windows.

10. Confirmation semantics:
   - “Saved/synced” UX should complete only when AG-UI state confirms application (e.g., task state, version, or acknowledged projection).
   - Current handshake: client sends `clientMutationId` in `sync` command payload; agent projects `lastAppliedClientMutationId` acknowledgment state; UI clears pending sync only when ids match.
   - Optimistic UI is allowed but must reconcile against streamed state.

11. Intent/state boundary:
   - Command intent is transport/control-plane input, not shared render truth.
   - Shared agent state must not persist command as a render-driving field.
   - ViewModel derives `UiState` from `ThreadState` plus local transient command lane state.

12. Two-layer invariants:
   - Agent invariants are authoritative business/workflow invariants.
   - ViewModel invariants are defensive projection invariants (stale run rejection, ordering/authority guards).
   - ViewModel must not re-implement business rules already owned by agents.

## 4. Recommended Implementation Shape

- `AgentCommandScheduler` per `agentId+threadId`:
  - `fire`: preemptive lane
  - `sync`: coalescing lane (single pending intent)
  - other commands: explicit policy (reject-on-busy or constrained retry)
- `AgentStatusPoller`:
  - dispatch one-shot poll `run` per non-active-detail agent on configured cadence
  - avoid persistent `connect` ownership in polling codepaths
- central `AgentProjectionReducer`:
  - dedupe by run/event identity
  - enforce per-agent source ownership gates (`detail-connect` vs `poll`)
  - optional hardening: add ownership token/epoch checks for stale stream/poll cleanup

## 5. Open Design Decisions

1. Confirmation payload:
   - `clientMutationId`/`lastAppliedClientMutationId` is the current explicit mutation acknowledgment path.
   - A future `settingsVersion` contract can supersede this if agents move to versioned settings documents.
2. Retry backoff tuning:
   - Current implementation uses bounded `sync` replay retries (`3`) and replay delay (`500ms`) in `apps/web/src/utils/agentCommandScheduler.ts`.
   - Remaining decision is whether these should become environment-tunable policy values.
3. Telemetry:
   - Emit metrics for busy events, replay count, dropped stale events, and command latency.
