# Ember Lending Agent

`agent-ember-lending` is the first concrete downstream managed subagent on the
public PI `agent-runtime` path.

This package currently establishes the thin blessed app scaffold:

- public `agent-runtime` consumption only
- app-owned runtime bootstrap
- AG-UI HTTP service mounting
- a lending-specific domain module shell that will be expanded in later slices

The intended downstream role for this agent is to act on a bounded Shared Ember
subagent surface for:

- portfolio-state reads
- candidate-plan materialization
- transaction-plan execution
- escalation requests

Like the portfolio manager app, this package should stay a thin downstream app.
Shared Ember business logic and durable truth remain outside the app behind the
Shared Ember Domain Service boundary.
