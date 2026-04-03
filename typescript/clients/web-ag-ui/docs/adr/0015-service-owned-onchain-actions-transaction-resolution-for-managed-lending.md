# ADR 0015: service-owned-onchain-actions-transaction-resolution-for-managed-lending

Status: Accepted
Date: 2026-04-03

## Context

Issue `#567` established that the managed lending runtime should own the
concrete Onchain Actions adapter and keep raw transaction artifacts private
behind the lending service boundary.

The first implementation slice improved the live path but left several
important gaps:

- token lookup only read the first paginated `/tokens` page, which broke common
  live assets such as Arbitrum USDC
- the lending service serialized a placeholder EIP-1559 envelope with hard-coded
  nonce, gas, and fee fields instead of resolving the final signable transaction
  bytes from live execution context
- approval-required lending plans were still truncated to the terminal
  transaction even though the live Onchain Actions supply and repay endpoints
  returned ordered two-transaction plans on 2026-04-03
- anchored payload refs still lived only in a resolver-local in-memory `Map`,
  so service restart or cross-instance execution would lose payload resolution
- integration-only payload helpers still lived under production `src/` paths and
  a deprecated optional resolver seam still appeared in production-facing config

ADR 0011 already ratifies that runtime-owned assembly and private integration
seams should not leak into downstream public boundaries. This ADR narrows that
rule for the managed lending execution path.

## Decision

For `agent-ember-lending`:

- the lending service owns the concrete Onchain Actions adapter
- `create_transaction_plan` may anchor only opaque refs and stable metadata back
  into the model-visible contract
- the lending service privately stores the full ordered Onchain Actions
  transaction-request sequence (`to`, `data`, `value`, `chainId`) keyed by the
  anchored payload ref
- that anchored payload record lives in runtime-owned persisted domain state so
  the lookup survives service restart and cross-instance execution on the same
  thread
- `request_transaction_execution` resolves the requested transaction step back
  inside the lending service from that persisted anchored record
- the lending service prepares the exact unsigned transaction bytes only at
  execution time, using:
  - the managed subagent wallet address
  - live chain RPC state for nonce, gas, and fee resolution
- `agent-runtime` remains the signing boundary and still receives only the final
  unsigned transaction bytes for signing
- test-only Shared Ember harness helpers must live outside production `src/`
  paths and must exercise the same `anchoredPayloadResolver` boundary rather
  than a separate production-facing optional resolver seam

## Rationale

- prevents invalid signing by removing fabricated nonce and fee defaults from
  the live path
- preserves approval-before-terminal execution order for multi-transaction
  Onchain Actions lending plans instead of dropping the first step
- keeps Onchain Actions integration private to the lending service instead of
  leaking transaction-construction details through Shared Ember or model-visible
  tool payloads
- preserves the intended boundary:
  - Shared Ember owns preparation records and opaque refs
  - the lending service owns private payload resolution
  - `agent-runtime` owns signing
- makes test support match the production architectural seam so integration
  coverage no longer depends on a misleading production helper path

## Alternatives Considered

- keep serializing placeholder EIP-1559 envelopes at plan time:
  - rejected because the resulting bytes are not chain-aware and can be invalid
    once the signer has real nonce and fee context
- store only the terminal Onchain Actions transaction request:
  - rejected because approval-required supply and repay flows can require more
    than one ordered transaction
- keep anchored payload refs only in a process-local in-memory map:
  - rejected because a service restart or second instance would lose ref
    resolution for already-created candidate plans
- move nonce / gas / fee preparation into Shared Ember:
  - rejected because the issue scope keeps concrete Onchain Actions payload
    ownership inside the lending service, not in the control-plane boundary
- extend the model-visible tool contract to carry unsigned transaction bytes:
  - rejected because the payload should remain private behind the lending
    service boundary
- leave the integration harness in production `src/` as tolerated scaffolding:
  - rejected because it teaches the wrong boundary and keeps a test-only seam in
    production architectural paths

## Consequences

- Positive:
  - live token lookup now follows paginated token catalogs
  - approval-required lending plans now preserve the full ordered Onchain
    Actions transaction sequence instead of truncating to the terminal call
  - anchored payload refs now resolve from runtime-owned persisted domain state
    instead of only from a process-local map
  - managed lending execution signs chain-aware unsigned bytes derived from live
    wallet and RPC context
  - production config no longer advertises the deprecated optional prepared
    unsigned-transaction resolver seam
  - test-only Shared Ember harness code now sits under explicit test support
- Tradeoffs:
  - the lending runtime now depends on chain RPC access for final transaction
    preparation in addition to the Onchain Actions API
  - the service must own a little more transaction-preparation logic before
    delegating to `agent-runtime` for signing
- Follow-on work:
  - keep the app README and C4 docs aligned with the anchored-request boundary
  - keep integration fixtures exercising the `anchoredPayloadResolver` seam
    instead of reintroducing alternate production-shaped helpers
