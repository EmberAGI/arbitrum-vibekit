# Rehire Runtime Validation Checklist (Pendle + GMX)

This runbook validates rehire behavior in a real wallet-driven browser flow.

## Scope

- Pendle rehire flow after fire
- GMX rehire flow after fire
- Lifecycle projection safety during background cycle dispatch

## One-time setup

1. Enable strict lifecycle projection assertion for the agent service you are testing:
   - `AGENT_STRICT_INACTIVE_CYCLE_ASSERT=true`
2. Restart the service so the new env var is active.

## Pendle checklist

1. Hire Pendle agent with wallet and complete onboarding.
2. Let one cycle complete.
3. Fire the agent and wait for fire task terminal state.
4. Confirm UI shows fired/inactive state.
5. Rehire the same agent.
6. Confirm onboarding starts (not blocked/active-stuck).
7. Complete onboarding and confirm cycle resumes.

Expected logs while lifecycle is inactive:

- Presence: `"[cron] Cycle projection diagnostics (inactive lifecycle)"`
- Absence: `"[cron] Inactive lifecycle projection drift detected"`
- With strict assert on, any drift aborts cycle update with:
  - `"Cycle projection drift detected: inactive lifecycle was not preserved..."`

## GMX checklist

1. Hire GMX agent with wallet and complete onboarding.
2. Let one cycle complete.
3. Fire the agent and wait for fire task terminal state.
4. Confirm UI shows fired/inactive state.
5. Rehire the same agent.
6. Confirm onboarding starts (not blocked/active-stuck).
7. Complete onboarding and confirm cycle resumes.

Expected logs are the same as Pendle.

## Evidence to capture

Collect these artifacts for each agent:

1. Timestamped screenshots:
   - fired terminal state
   - rehire onboarding started
   - rehire onboarding completed
2. Agent logs around rehire window containing:
   - `Cycle projection diagnostics (inactive lifecycle)`
   - absence of `Inactive lifecycle projection drift detected`
3. If strict assert fails, copy full error line and surrounding 20-30 log lines.

## Pass criteria

- Rehire starts onboarding from inactive without blocked/active flicker.
- Rehire completes and cycles continue normally.
- No projection drift warning lines.
- No strict assertion failures.
