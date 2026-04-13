# ADR 0016: ag-ui state, message, and control-plane boundaries

Status: Accepted
Date: 2026-04-12

## Context

ADR 0001 established AG-UI as the only web-to-agent communication boundary.
ADR 0012 established a runtime-family-neutral `thread` contract for the fields the web uses to make hired/onboarding/active render decisions.
ADR 0013 established the direct command lane and the writable `/shared` versus runtime-owned `/projected` editability model.

That architecture direction still left one important public-contract gap underspecified at the exact AG-UI payload shape:

- some runtime payloads still duplicate domain projection under `thread.domainProjection`
- some web/runtime types still treat `settings` as a top-level convenience shape even though writable state is supposed to live under `/shared`
- some runtime payloads still duplicate messages inside state snapshots as `thread.messages` even though AG-UI already has a distinct message plane
- the public wire contract does not yet state clearly whether `thread` is a reserved cross-runtime envelope or just another bucket for arbitrary runtime/domain data

That ambiguity is dangerous because it encourages accidental compatibility mirrors, state/message duplication, and contract drift between runtime families and web consumers.

The intended migration end-state is a full migration, not a permanent compatibility layer.
`agent-runtime` should not preserve legacy mirrors on the public wire once the canonical contract is settled.

## Decision

Adopt one explicit three-plane AG-UI contract for the public web-facing payload:

1. State plane
   - `STATE_SNAPSHOT` and `STATE_DELTA` carry only the public state document rooted at:
     - `/thread`
     - `/shared`
     - `/projected`

2. Message plane
   - transcript data lives only on AG-UI message events such as:
     - `MESSAGES_SNAPSHOT`
     - `TEXT_MESSAGE_START`
     - `TEXT_MESSAGE_CONTENT`
     - `TEXT_MESSAGE_END`
     - other AG-UI message/tool events as applicable

3. Control plane
   - hydration metadata, shared-state revisions, and mutation acknowledgments live only on control-plane events such as:
     - `shared-state.control`

### State plane ownership

#### `/thread`

- `/thread` is a reserved, read-only, cross-runtime workflow/execution envelope.
- `/thread` exists so the web can depend on one runtime-family-neutral contract for core render and execution state.
- The required `thread` contract from ADR 0012 remains canonical:
  - `thread.id`
  - `thread.lifecycle.phase`
  - `thread.task.taskStatus.state`
  - `thread.task.taskStatus.message` uses `{ content: string }` when present
- Fields such as `thread.lifecycle` and `thread.task` are domain-produced but contract-reserved:
  - the domain/runtime decides when those values change and how internal execution state maps onto them
  - the public wire location, presence requirements, and coarse shared semantics remain standardized for the web contract
- Additional fields may live under `/thread` only when they are intentionally standardized as part of the shared cross-runtime contract.
- Domain-specific public schema must not be placed under `/thread` just because a runtime happens to know how to emit it.
- Existing runtime output is not grandfathered into `/thread` merely because it was emitted historically.
  - For example, legacy `thread.domainProjection` and `thread.messages` remain invalid contract shapes even if older runtime implementations produced them.
- Clients must not patch `/thread` through `command.update`.

#### `/shared`

- `/shared` is the only client-writable public state subtree.
- `/shared` schema is domain-owned and optional.
- `agent-runtime` provides generic shared-state transport, validation, revisioning, and patch application, but it does not own the business meaning of keys inside `/shared`.
- `settings` is not an `agent-runtime` primitive.
  - If a domain chooses to expose writable settings, they may live at `/shared/settings`.
  - If a domain does not define settings, `/shared/settings` need not exist.

#### `/projected`

- `/projected` is the runtime-written, domain-owned public read model.
- `/projected` holds domain projection data and other domain-specific derived state that is public but not client-writable.
- Former `domainProjection`-style public data belongs in `/projected`, not under `/thread`.
- Clients must not patch `/projected` through `command.update`.

### Message plane rule

- Messages must not be duplicated into the state plane.
- Public state snapshots and deltas must not include transcript fields such as `thread.messages`.
- The authoritative transcript snapshot is `MESSAGES_SNAPSHOT`, and the authoritative incremental transcript updates are the AG-UI message events.
- Imperative control intent is not transcript data.
- Synthetic JSON user messages such as `{"command":"sync"}` are invalid as a public command/control transport and must not be emitted just to steer runtime behavior.

### Control plane rule

- Shared-state hydration metadata, revision metadata, and mutation acknowledgments must not be embedded into `/shared`, `/projected`, or `/thread`.
- Those values belong on the control plane, currently via `shared-state.control`.

### No compatibility mirrors on the public wire

- `agent-runtime` and its Pi gateway adapters must not preserve legacy compatibility mirrors once the canonical contract is in place.
- Disallowed public-wire compatibility shapes include:
  - `thread.domainProjection`
  - top-level `settings`
  - `thread.messages`
  - synthetic JSON transcript messages used to smuggle imperative command intent
  - fallback interpretation of legacy `domainProjection` as `/projected`
- If older snapshots need temporary defensive handling, that handling is a migration fallback in consumers and not part of the supported runtime contract.

## Rationale

- Keeps ownership boundaries explicit:
  - `/thread` for shared cross-runtime workflow/execution contract
  - `/shared` for domain-owned writable state
  - `/projected` for domain-owned read model
- Prevents `agent-runtime` from turning historical web conveniences into permanent protocol surface area.
- Preserves ADR 0012's runtime-family-neutral render contract without forcing every domain-specific read model into the reserved `thread` envelope.
- Keeps transcript authority on the AG-UI message plane instead of duplicating it into state.
- Makes the full-migration rule executable and reviewable rather than relying on issue-thread memory.

## Alternatives Considered

- Remove `/thread` entirely and place all public state under `/shared` or `/projected`:
  - Rejected because the web still needs one reserved runtime-family-neutral envelope for lifecycle/task/render truth and execution metadata that is not domain-writable state.
- Keep emitting compatibility mirrors such as `thread.domainProjection` and `thread.messages`:
  - Rejected because the intended end-state is a full migration, not a permanent alias layer, and mirrors create split authority plus future drift.
- Treat `settings` as a framework-owned primitive:
  - Rejected because writable shared-state schema belongs to the domain layer, not to `agent-runtime`.
- Allow runtime-specific ad hoc top-level keys in the state document:
  - Rejected because it weakens the public contract and reintroduces runtime-family branching into the web layer.

## Consequences

- Positive:
  - The AG-UI wire contract becomes easier to reason about and test.
  - Domain-owned schema can evolve under `/shared` and `/projected` without redefining the reserved cross-runtime envelope.
  - Message/state/control responsibilities become unambiguous.
- Tradeoffs:
  - This is a breaking contract cleanup for any code that still reads legacy mirrors such as `thread.domainProjection`, top-level `settings`, or `thread.messages`.
  - Runtime and web tests must be updated in the same slice when the old mirrors are removed.
- Follow-on work:
  - update issue `#589` and parent feature `#588` wording so the execution contract matches this ADR exactly
  - remove legacy compatibility mirrors from `agent-runtime` and Pi runtime emission paths
  - remove web-side projection fallbacks that hydrate legacy top-level `settings` or `thread.domainProjection` from canonical `/shared` and `/projected`
  - add shared contract tests proving snapshots/deltas never emit the disallowed legacy shapes
