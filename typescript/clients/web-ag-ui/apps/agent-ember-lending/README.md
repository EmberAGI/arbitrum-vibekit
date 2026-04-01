# Ember Lending Agent

`agent-ember-lending` is the first concrete downstream managed subagent on the
public PI `agent-runtime` path.

This package currently establishes the thin blessed app scaffold:

- public `agent-runtime` consumption only
- app-owned runtime bootstrap
- AG-UI HTTP service mounting
- thin Shared Ember HTTP host and bounded subagent adapter

The intended downstream role for this agent is to act on a bounded Shared Ember
subagent surface for:

- portfolio-state reads
- planner-backed candidate-plan creation
- transaction-plan execution
- escalation requests

Direct lending-agent onboarding is intentionally out of scope here. The
portfolio manager owns onboarding and activation; this runtime reads the
managed lane's current Shared Ember truth and projects the lending wallet,
mandate, reservation, planning, execution, and escalation state into AG-UI.

Like the portfolio manager app, this package should stay a thin downstream app.
Shared Ember business logic and durable truth remain outside the app behind the
Shared Ember Domain Service boundary.
