# AG-UI Frontend/Backend Contract for UI Stability

Status: Proposed  
Date: 2026-02-27  
Scope: `apps/web`, `apps/agent*`, `apps/agent-workflow-core`

## 1. Problem

UI layout can oscillate (`pre-hire <-> metrics`) when transient intent/state snapshots are interpreted as durable render state.

Observed coupling points:

- control intent (`command`) and render model are mixed in shared agent state.
- multiple ingress channels (`connect`, `run`, list poll, cron state updates) can project state with different timing.
- layout branch decisions currently still depend on command-derived booleans.

## 2. Existing Baseline

This contract extends:

- `docs/c4-target-architecture-web-ag-ui-agents.md`
- `docs/ag-ui-client-runtime-invariants.md`

It stays AG-UI-only at the web boundary and focuses on making render state monotonic and explicit.

## 3. Contract Overview

Use one-way MVVM/MVI-lite rules:

- View: render-only, no business transitions.
- ViewModel/store: applies events and derives `UiState`.
- Domain/agent: owns `ThreadState` lifecycle and domain invariants.
- Data transport (AG-UI): event stream and command dispatch only.

### 3.1 Control Plane (intent)

- User/system intents are ephemeral command events (`hire`, `sync`, `fire`, `resume`, `cycle`).
- Intents are not durable render state.
- Intent metadata must not live in shared render-driving state.

### 3.2 State Plane (canonical agent/domain state)

Agents must emit a durable lifecycle field in `ThreadState`:

- `thread.lifecycle.phase`: `prehire | onboarding | active | firing | inactive`
- optional: `thread.lifecycle.reason`, `thread.lifecycle.updatedAt`

Monotonic requirements:

- onboarding completion cannot regress to `prehire` without explicit `fire`/reset transition.
- terminal onboarding statuses clear legacy onboarding step/key.
- interrupt/input-required transitions must include non-empty task message content.

### 3.3 Projection Plane (web VM/read model)

- A single projection reducer in the ViewModel applies AG-UI snapshots/events and builds `UiState`.
- source authority is explicit per agent/thread:
  - active detail route: `connect` stream authority,
  - non-active detail: poll run authority,
  - temporary fallback: active command run authority.
- stale events are ignored by `(threadId, runId)` and projection version/epoch checks.

### 3.4 Layer Mapping (defacto naming)

- Agent/domain output: `ThreadState` (workflow and lifecycle truth).
- ViewModel output: `UiState` (screen-ready derived state).
- View input: `UiState` only.

## 4. Rendering Rules

Layout should derive from canonical lifecycle in `ThreadState`-derived `UiState`, not command:

- post-hire layout when `phase in {onboarding, active, firing}`.
- pre-hire layout when `phase in {prehire, inactive}`.

Local transient VM state (in-flight command lane, retries, pending intent) can drive spinners/toasts.
Command must not be persisted in shared render-driving state.

## 5. Required Invariants

1. Shared `ThreadState` contains domain/workflow truth only; no UI-only flags.
2. `thread.lifecycle.phase` is render truth source.
3. projection merge must be undefined-safe and preserve durable fields unless explicitly replaced.
4. out-of-band cron updates must preserve full durable lifecycle context or skip state writes.
5. sync confirmation remains explicit (`clientMutationId -> lastAppliedClientMutationId`) until lifecycle/version ack supersedes it.
6. Invariants are enforced in two layers:
   - domain invariants in agents (authoritative business/workflow truth),
   - VM invariants in web reducer (stale/out-of-order event defense).

## 6. Concrete Touchpoints

Frontend:

- `apps/web/src/hooks/useAgentConnection.ts`
  - derive `isHired`/layout flags from lifecycle phase.
  - keep run/thread stale guards.
- `apps/web/src/components/AgentDetailPage.tsx`
  - branch layout using lifecycle phase.
- `apps/web/src/contexts/agentProjection.ts`
  - preserve lifecycle fields and avoid clobber from sparse payloads.
- `apps/web/src/contexts/agentListProjection.ts`
  - project sidebar status from lifecycle + task, not command.

Backend shared core:

- `apps/agent-workflow-core/src/*`
  - add lifecycle helpers and transition guards.
  - keep command routing separate from lifecycle projection.

Agents:

- `apps/agent*/src/workflow/context.ts`
  - compute lifecycle phase from onboarding/task/setup/fire states.
- `apps/agent*/src/workflow/nodes/runCommand.ts`
  - consume command as intent input only.
- `apps/agent*/src/agent.ts` cron update paths
  - preserve full view invariants on out-of-band state updates.

## 7. Migration Slices

1. Introduce lifecycle phase field in `ThreadState` and derive it in agent reducers.
2. Update web render gates to lifecycle phase.
3. Remove shared command field from render-driving state.
4. Add regression tests for post-onboarding no-flap behavior.
5. Harden cron state update fallback paths to preserve lifecycle context.

## 8. Exit Criteria

- no observed `metrics <-> pre-hire` oscillation after onboarding completion and delegation submission.
- command transitions no longer directly toggle layout.
- AG-UI projection remains stable under connect + polling + cron activity.
