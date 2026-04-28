# ADR 0009: postgres-centered-persistence-for-pi-runtime

Status: Accepted
Date: 2026-03-17

## Context

This ADR builds on ADR 0006 and locks the persistence mechanism and durability shape for the Pi-backed runtime.

ADR 0006 established the core runtime model:
- `PiThread`
- `PiExecution`
- `PiAutomation`
- `AutomationRun`

It also locked durability tier B, durable automation/background state, and exactly-once-ish dedupe for risky side effects. What remained open was the concrete persistence architecture.

In this initiative, durability tier B means:
- durable user-facing thread state survives restart
- durable automation definitions and queued/scheduled automation work survive restart
- pending structured interrupts survive restart and can be resurfaced
- visible current-state artifacts and append-only activity history survive restart
- durable outbox/dedupe state for risky side effects survives restart
- exact in-flight execution-step resume is not required

Put differently:
- after restart, the runtime must be able to recover durable thread/automation truth and pending durable work
- after restart, the runtime may recreate or restart interrupted `PiExecution` work from the last durable state rather than resuming an exact mid-step checkpoint

The Pi-backed runtime is intended to be:
- a standalone long-lived service
- the canonical runtime-of-record for Pi-backed agents
- reusable across multiple clients such as AG-UI and future Telegram support
- capable of structured interrupts, durable automation scheduling, and replay-safe side effects

That makes persistence requirements materially stronger than a local single-process chat app:
- multiple runtime entry points may touch the same state
- execution, automation, interrupt, and outbox transitions need clear transactional boundaries
- queued/background work must survive restart
- risky side effects need dedupe constraints that are stronger than in-memory checks

The persistence choice also affects developer experience. A file-based store or SQLite default could simplify local startup, but they would introduce either weaker concurrency semantics or a second primary persistence mode that differs from production.

## Decision

Adopt a Postgres-centered hybrid persistence architecture for the Pi-backed runtime.

Rules:
- Postgres is the canonical system of record for:
  - root user-visible `PiThread` records
  - `PiExecution`
  - `PiAutomation`
  - `AutomationRun`
  - interrupt state
  - visible artifact metadata/state
  - durable scheduler state
  - durable outbox and dedupe state
- The persistence model is hybrid:
  - relational current-state records for canonical runtime entities
  - append-only execution/activity history where auditability or replay matters
- Scheduling uses a DB-backed queue/lease model initially.
- Scheduled automation run prompts execute in ephemeral runtime context and are not persisted as normal `PiThread` rows.
- Scheduled-run session snapshots must persist execution/interrupt checkpoints for the root thread record plus a bounded execution-scoped `automation-run-snapshot` artifact/event; they must not insert or update a `pi_threads` row for the internal `automation:<automationId>:run:<runId>` prompt context.
- Scheduled-run durability is captured by `AutomationRun`, `PiExecution`, execution events, root-thread activity/projection, run-snapshot artifacts, failures, timeout state, and outbox/dedupe records.
- The scheduler claims due work with a row-count-checked `scheduled -> running` update in the same Postgres transaction as the running event/activity writes. A zero-row claim or later write failure rolls back the batch, so this process must not invoke the agent unless the claim and audit writes commit together.
- Scheduler work is serialized per automation id rather than globally. A still-running invocation for one automation blocks only that automation's next firing, not unrelated due automations.
- Terminal scheduled-run updates are row-count-checked claims too. Completion/failure/timeout must only update `running` rows, cancellation must only update the current scheduled or active row, and a zero-row terminal update must roll back any replacement run insertion.
- Stale-active timeout handling must catch lost row-count terminal races, skip the stale run, and continue processing later due automations in the same scheduler tick.
- The same scheduler process that starts a scheduled invocation must enforce the configured timeout even when the agent stream hangs. Timeout handling aborts the active runtime run, uses the same runtime-owned timeout transaction, and advances the next run on cadence without waiting for process restart or another scheduler.
- Canceling automation must suspend future cadence and stop only an active same-process scheduled invocation owned by the active root thread through the runtime stop path so later completion cannot advance cadence. The persisted cancel transaction must scope automation updates, run updates, execution updates, and scheduler-lease cleanup to the active root thread record; a caller that knows an automation id from another thread must not be able to cancel it. The linked `PiExecution` must move to an unsuccessful terminal status when the active run is canceled, preserving operator inspection consistency. If there is no current run/execution, the transaction must suspend the automation and may write nullable root activity, but must skip non-null execution-event insertion.
- Terminal scheduled-run persistence must use the terminal-decision timestamp, not the tick-start timestamp, for `completed_at`, terminal execution/activity events, scheduler lease expiry, stable replacement ids, and cadence calculations.
- Initial and rescheduled `AutomationRun.scheduled_at` values must use the future cadence timestamp, matching `PiAutomation.next_run_at`, not the definition creation, prior completion, tick-start, or terminal timestamp.
- Inspection/control loading must include artifact payloads and execution/activity payloads; persisted `automation-run-snapshot` payloads are part of the inspectable runtime state, not write-only audit rows. Runtime completion must project the same snapshot artifact into live root activity before publishing terminal status, and cold hydration must re-append any persisted snapshot artifacts missing from the root session.
- Persisted automation list projections must classify suspended automations as canceled before treating `next_run_at = null` as completed, because cancellation intentionally sets both `suspended = true` and `next_run_at = null`.
- Previous-run scheduled context must prefer the actual persisted scheduled-run snapshot summary and artifact reference before falling back to generic root activity status text. Persisted snapshot summaries and prompt-injected previous-run summaries must be compact, bounded, and single-line so a long assistant response is never carried forward verbatim as recurring context.
- Runtime-owned tool checkpoints created inside scheduled execution must use the scheduled automation `PiExecution` and root `PiThread` so identity, signing, interrupt, outbox, and dedupe paths stay on the same fail-closed boundary as direct execution.
- Web-facing run inspection is a projection of that runtime-owned activity/artifact state. The web may render run ids, statuses, summaries, and artifact references, and must provide root-thread-scoped control-plane-backed inspect/open affordances for persisted run snapshots/artifacts. The AG-UI gateway service wrapper must pass the requested root-thread scope through to canonical runtime control reads, and those reads must filter automation runs and artifacts before id selection; the web must not infer automation truth from chat transcript messages, static labels, local-only anchors, or unscoped runtime-wide lists.
- Exactly-once-ish risky side effects use a durable outbox plus unique wallet/account + action-fingerprint constraints in Postgres.
- Redis is not part of the initial persistence architecture.
- SQLite is not the default backend, including for `npx` startup flows.
- Local developer UX and `npx pi-agent` should make Postgres feel automatic rather than introducing a second default storage mode.
- Zero-config local-first UX is still a requirement:
  - developers should be able to start Pi and spawn sub-process work without manually provisioning database infrastructure first
  - local-first UX should be achieved by packaging/bootstrap automation around the canonical store, not by replacing the canonical store with a weaker default architecture
- Session/runtime maintenance is a first-class architectural concern, not a cleanup afterthought:
  - retention/archival policy for activity history and artifacts must be explicit
  - maintenance/cleanup workflows must preserve canonical thread/execution truth
  - operator-facing inspection/maintenance surfaces should rely on the canonical Postgres store rather than scraping transport logs
- The persistence architecture must satisfy durability tier B explicitly:
  - preserve durable thread, interrupt, artifact, automation, queue, and outbox state across restart
  - permit execution restart/recreation from durable state instead of requiring exact in-flight resume

Expected implementation shape:
- normalized tables for root entities and queue/outbox state
- append-only execution/activity/event tables where history matters
- transactional boundaries around automation firing, execution checkpoints, and side-effect intent persistence
- explicit running, terminal, timeout, and reschedule transactions for automation-triggered executions

## Rationale

- Matches the service-grade runtime shape better than file-backed JSON/JSONL storage.
- Gives clear transactional semantics for execution, automation, interrupt, and outbox state.
- Supports exactly-once-ish dedupe with database-enforced uniqueness instead of ad hoc file locking.
- Keeps local and production persistence behavior aligned.
- Avoids introducing Redis before there is evidence that coordination or throughput requires it.
- Avoids making SQLite the default and thereby creating a second primary operational mode with different concurrency behavior.
- Preserves room for Codex/OpenCode-like low-latency local UX without giving up a stronger gateway durability model.

This also aligns with the strongest patterns we want to borrow from adjacent systems:
- LangGraph’s durable checkpointing and server-grade persistence expectations
- OpenClaw’s separation of canonical session state from isolated automation execution contexts
- Codex’s durable thread identity and append-only session history
- OpenClaw’s treatment of session maintenance/cleanup as real architecture

## Alternatives Considered

- File-based JSON/JSONL as the primary store:
  - Rejected because cross-file atomicity, concurrency, dedupe, and recovery semantics are too weak for the intended multi-client long-lived runtime.
- SQLite as the default backend:
  - Rejected because it would create a second primary persistence mode with meaningfully different concurrency and operational characteristics from production.
- Redis as the primary store:
  - Rejected because the runtime’s core problems are durable relational state, transactions, dedupe, and recovery rather than ephemeral coordination.
- Postgres + Redis from day one:
  - Rejected because it adds cross-store complexity before there is evidence that the simpler DB-backed queue/lease model is insufficient.
- Pure event sourcing:
  - Rejected because it adds machinery beyond what the current runtime and durability requirements need.

## Consequences

- Positive:
  - Stronger correctness and recovery guarantees.
  - Cleaner exactly-once-ish outbox design.
  - Better fit for multi-client and future horizontal runtime growth.
  - Easier operational querying and debugging of runtime state.
- Tradeoffs:
  - Local startup is heavier unless the repo provides a bootstrap path.
  - Requires migration tooling and deployment discipline around schema changes.
- Follow-on work:
  - Make local startup and `npx pi-agent` bootstrap Postgres automatically when no external `DATABASE_URL` is provided.
  - Define how ephemeral local/sub-process runs can use parent-owned persistence or other zero-config bootstrap paths without creating a second canonical store.
  - Define the concrete schema and transactional boundaries for `PiThread`, `PiExecution`, `PiAutomation`, `AutomationRun`, scheduler rows, and outbox rows.
  - Define retention, archival, and maintenance policy for thread activity, artifacts, and operator-facing history views.
  - Add readiness/health checks and migration handling around the Postgres dependency.
