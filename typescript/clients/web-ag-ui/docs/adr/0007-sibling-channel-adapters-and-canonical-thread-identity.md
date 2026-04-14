# ADR 0007: sibling-channel-adapters-and-canonical-thread-identity

Status: Accepted
Date: 2026-03-17

## Context

The Pi-backed agent is intended to serve `web-ag-ui` first, but future channels such as Telegram are expected. Without an explicit adapter strategy, there is a risk that:
- AG-UI concepts become the de facto internal runtime model
- new clients are forced to sit on top of web-specific assumptions
- thread identity fragments per client surface
- shared setup/hire/refresh/fire flows drift across channels

We also know the current web app creates deterministic threads based on wallet address plus scoped identifiers, and future product work may need multiple deterministic user-visible threads.

## Decision

Treat AG-UI, Telegram, and future clients as sibling adapters over the same Pi runtime.

Canonical identity and routing rules:
- Canonical root thread identity is `agent + principal identity + scope`.
- Client surface is not the primary thread dimension.
- Cross-client continuity is allowed by default when multiple clients represent the same principal and scope.
- Additional deterministic scopes/threads are allowed when explicitly required by product semantics.
- Identity mapping must stay explicit across the runtime and projection layers:
  - one canonical `PiThread.id` per root visible thread
  - one canonical `PiExecution.id` per unit of work
  - projected AG-UI/A2A/channel ids must trace back to those canonical ids instead of inventing unrelated durable identities

Thread visibility rules:
- One primary visible thread should exist by default.
- Additional visible deterministic threads may exist when they represent product-meaningful scopes.
- Internal operational contexts such as background task/job execution are not first-class user threads by default.

Channel behavior rules:
- Shared flows such as hire/setup/refresh/fire must belong to Pi-owned agent domain modules layered above the core runtime, not only to the AG-UI adapter.
- If autonomous work needs user input, actionable interrupts surface into the root thread so user-visible channels can resolve them.
- Rich channel-specific rendering remains the responsibility of each adapter.

## Rationale

- Keeps Pi channel-neutral and reusable beyond the web frontend.
- Preserves one coherent notion of user/session continuity across clients.
- Avoids making AG-UI the source of truth for thread identity or runtime semantics.
- Supports future product needs for multiple deterministic scopes without making every client its own silo.
- Keeps user-facing flows consistent while allowing channel-specific presentation differences and agent-family-specific domain modules.

## Alternatives Considered

- Make AG-UI the primary adapter and layer Telegram on top of AG-UI events:
  - Rejected because it would push web/protocol assumptions into other channels.
- Key canonical threads by client surface:
  - Rejected because it fragments continuity and makes shared identity unnecessarily hard.
- Expose every internal operational context as a first-class thread:
  - Rejected because it creates UI noise and blurs user-facing versus operational concerns.

## Consequences

- Positive:
  - Cleaner path to Telegram and future channels.
  - Stronger continuity model across adapters.
  - Shared user-facing flows stay consistent across transports.
- Tradeoffs:
  - Requires explicit identity and scope translation rules at adapter boundaries.
  - Requires careful UI projection so internal contexts do not leak as user thread clutter.
- Follow-on work:
  - Define adapter-facing identity/scope mapping rules.
  - Define the projection id contract between `PiThread` / `PiExecution` and AG-UI / A2A / future channels.
  - Define which deterministic scopes are user-visible versus internal-only.
  - Add tests for cross-client thread attachment and interrupt surfacing behavior.
