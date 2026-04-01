# ADR 0011: blessed-agent-runtime-factory-and-runtime-owned-projection-assembly

Status: Accepted
Date: 2026-03-28
Supersedes: ADR 0010

## Context

ADR 0010 correctly established that agent-family lifecycle behavior should live in a Pi-owned domain layer above the core runtime model instead of being pushed into AG-UI adapters or React.

However, ADR 0010 also assigned too much projection ownership to the domain-module layer:
- domain-specific current-state and activity projection rules
- domain-specific A2UI payload/artifact production

The post-`#533` builder work demonstrated a cleaner normal-consumer boundary:
- `agent-runtime` should own runtime assembly
- `agent-runtime` should own projection assembly
- downstream apps should configure a blessed builder/factory and receive a ready runtime service
- domain modules should return semantic, adapter-neutral outputs instead of runtime-shaped thread/session DTOs

Without an explicit correction, the repository keeps teaching two competing architectures:
- an older projection-hook/domain-module boundary
- a newer blessed-factory/runtime-owned projection boundary

That ambiguity is dangerous because it encourages downstream consumers to:
- recreate private runtime wrappers
- treat runtime/projection helpers as normal integration points
- emit runtime-shaped DTOs or session patches from domain code
- expose transport/bootstrap internals as if they were part of the supported public API

We also need to settle the boundary for A2UI. A2UI is a protocol/content language, not necessarily a private runtime detail. The domain may need some control over what structured UI content is shown to the user. But that does not require the domain to own projection placement, thread patches, AG-UI labels, or session wiring.

Finally, deprecated LangGraph-backed agents remain supported for compatibility, but they are not the target architecture for new Pi runtime work and must not constrain the public boundary we ratify here.

## Decision

Ratify the post-`#533` architecture as the authoritative boundary for Pi-backed runtime integration.

The architecture rules are:
- `agent-runtime` exposes one blessed normal-consumer factory/builder surface from the package root.
- The blessed surface is configuration-only and dependency-inversion-only.
- The blessed surface returns an already-instantiated runtime/service surface for the consumer to run or mount.
- Consumers must not manually construct runtime, projection, transport, control-plane, persistence, or bootstrap internals.

### Ownership

- Core Pi runtime and `agent-runtime` own:
  - runtime assembly
  - projection assembly
  - interrupt packet assembly and resurfacing plumbing
  - concrete running-agent/service construction
  - persistence wiring
  - automation scheduling/recovery loops
  - transport wiring
  - control-plane wiring
- Domain modules own:
  - lifecycle vocabulary and transitions
  - domain commands and policies
  - interrupt schemas
  - dynamic system context
  - semantic domain state updates
  - semantic domain outputs
- Domain modules do not own:
  - thread patches
  - session-shaped DTOs
  - AG-UI labels
  - artifact-channel routing
  - projection placement into runtime/session/transport records

### A2UI boundary

- Domain modules may emit A2UI payload content as part of semantic outputs.
- That allowance exists because A2UI is a protocol/content language and may legitimately express domain-authored structured UI content.
- `agent-runtime` still owns how that A2UI payload is attached, projected, routed, persisted, replayed, and surfaced across runtime/session/transport boundaries.
- In other words:
  - domain may author A2UI payload content
  - runtime owns A2UI projection

### Public API shape

- The normal-consumer package-root API should look like a factory/builder contract.
- Normal consumers may pass configuration such as:
  - model
  - system prompt
  - tools
  - domain configuration
  - persistence configuration such as a database URL or similarly small config object
- Normal consumers must not pass:
  - prebuilt Postgres clients/pools/stores
  - session stores
  - control planes
  - AG-UI handlers
  - projection helpers
  - runtime wrappers
  - bootstrap plans or bootstrap executors

### Transport and bootstrap helpers

- Transport/bootstrap helpers are not part of the blessed public API.
- They must not appear as normal-consumer guidance.
- They must not survive as "advanced public subpaths" for standard integration.
- If `agent-runtime` still needs internal helper modules, they remain internal implementation details rather than supported package-entry surfaces.

### Legacy scope constraint

- Deprecated LangGraph-backed agents do not define the target public architecture for Pi-backed runtime work.
- Compatibility support for those agents may remain, but their patterns must not block or dilute the blessed Pi runtime boundary.

## Rationale

- Preserves the useful part of ADR 0010: agent-family lifecycle rules belong in a Pi-owned domain layer above the core runtime.
- Removes the harmful part of ADR 0010: domain ownership of projection assembly and runtime-shaped view construction.
- Matches the intent of `#533`, which is the cleanest downstream contract.
- Produces a clearer factory/builder API similar to the Codex SDK model:
  - configuration in
  - ready runtime/service out
  - no consumer-owned construction graph
- Prevents downstream repos from copying transitional or internal helper usage as precedent.
- Keeps persistence and transport concerns configurable without leaking lifecycle ownership.
- Allows domain-authored A2UI content where that is genuinely part of the user-facing business experience, while still protecting runtime-owned placement and replay semantics.

## Alternatives Considered

- Keep the ADR 0010 projection-hook/domain-module boundary:
  - Rejected because it keeps projection ownership soft and encourages domain/runtime DTO leakage.
- Expose transport/bootstrap helpers as advanced but public entry points:
  - Rejected because those helpers become the de facto supported path over time and reintroduce consumer-owned assembly.
- Accept prebuilt persistence clients or stores on the blessed API:
  - Rejected because it leaks internal lifecycle ownership and forces consumers to reason about runtime machinery.
- Make runtime the sole author of all A2UI payload content:
  - Rejected because it would remove a legitimate way for domain code to specify structured UI content.
- Let deprecated LangGraph package patterns influence the new boundary:
  - Rejected because they are legacy compatibility surfaces rather than the target architecture.

## Consequences

- Positive:
  - One clear architecture replaces two competing ones.
  - The package root becomes a true blessed builder/factory surface.
  - Downstream domains stay adapter-neutral.
  - A2UI can remain expressive without reopening thread/session ownership leaks.
- Tradeoffs:
  - Some currently exported helper surfaces will need to be removed or internalized.
  - Some existing docs, tests, and package boundaries will need explicit cleanup.
  - The blessed runtime factory may need to become more opinionated, and possibly asynchronous, to hide bootstrap details cleanly.
- Follow-on work:
  - shrink the `agent-runtime` root surface to the blessed builder contract
  - remove or internalize public projection-hook/domain-module seams that contradict this ADR
  - update docs/tests to teach runtime-owned projection assembly consistently
  - define the semantic domain output contract for optional A2UI payload content without exposing runtime-shaped projection data
