# GMX Allora Agent

This agent uses Allora prediction feeds to make deterministic trading decisions for GMX perpetuals on Arbitrum and then:

- builds **transaction plans** to open/modify/close positions via `onchain-actions`
- optionally **submits user transactions** in embedded-wallet mode (normal user flows, not GMX keeper "execution")

## Roadmap Vocabulary

- **Transaction planning**: producing `transactions[]` that a wallet can sign and submit.
- **Transaction submission**: broadcasting signed transactions and recording tx hashes in artifacts/history.

## Current Milestones

- Plan-building mode (no submission) is implemented.
- Next: validate onchain-actions read-path correctness (markets/positions/balances) before enabling transaction submission.

## Test Taxonomy

- `test:unit`: deterministic unit coverage for core decisioning, plan building, and client adapters.
- `test:int`: workflow-level integration tests (node-level orchestration and action wiring).
- `test:e2e`: intentionally reserved for full graph + service lifecycle tests; currently no e2e specs are checked in yet.
- `test:smoke`: live end-to-end transaction smoke script against a configured onchain-actions API URL.

For web-driven E2E (`apps/web/tests/gmxAllora.system.e2e.test.ts`), the agent supports:
- `E2E_PROFILE=mocked`: enable agent-local MSW interception for Allora + onchain-actions.
- `E2E_PROFILE=live`: disable interception and use real HTTP providers.

## Transaction Submission Behavior

The agent always uses onchain-actions to build a `transactions[]` plan for the chosen action (`long`, `short`, `close`).

- `GMX_ALLORA_TX_SUBMISSION_MODE=plan`:
  - The agent emits the planned `transactions[]` in artifacts/history and does not broadcast anything.
- `GMX_ALLORA_TX_SUBMISSION_MODE=submit`:
  - `long`: build `transactions[]` via onchain-actions, then broadcast each transaction sequentially and wait for receipts; record `txHashes` and `lastTxHash` in artifacts/history.
  - `short`: same as `long`.
  - `close`: build `transactions[]` via onchain-actions, then broadcast each transaction sequentially and wait for receipts.
    - Note: this requires an onchain-actions GMX plugin that plans position closes using GMX decrease orders. Older onchain-actions versions may return order-cancellation transactions instead.

## Environment

- `GMX_ALLORA_POLL_INTERVAL_MS`: poll interval (ms) for each agent cycle. Defaults to `1800000` (30m).
- `GMX_MIN_NATIVE_ETH_WEI`: minimum native ETH (in wei) required in the operator wallet before the agent will proceed (defaults to `2000000000000000` = 0.002 ETH).
- `Allora topic whitelist` (enforced in `src/config/constants.ts`):
  - `TOPIC 1`: `BTC/USD - Log-Return - 8h`
  - `TOPIC 3`: `SOL/USD - Log-Return - 8h`
  - `TOPIC 14`: `BTC/USD - Price - 8h`
  - `TOPIC 19`: `NEAR/USD - Log-Return - 8h`
  - `TOPIC 2`: `ETH/USD - Log-Return - 24h`
  - `TOPIC 16`: `ETH/USD - Log-Return - 24h`
  - `TOPIC 2`: `ETH/USD - Log-Return - 8h`
  - `TOPIC 17`: `SOL/USD - Log-Return - 24h`
  - `TOPIC 10`: `SOL/USD - Price - 8h`
- `ALLORA_INFERENCE_CACHE_TTL_MS`: cache TTL (ms) for Allora consumer inference requests. Defaults to `30000`; set to `0` to disable caching.
- `ALLORA_8H_INFERENCE_CACHE_TTL_MS`: cache TTL (ms) specifically for the GMX agent's 8-hour inference fetch. Defaults to `30000`; set to `3600000` (1 hour) to avoid re-fetching on every 5s poll tick.
- `GMX_ALLORA_TX_SUBMISSION_MODE`: transaction submission mode. Supported values:
  - `plan` (default): build and emit `transactions[]` but do not broadcast.
  - `submit`: broadcast planned transactions via an embedded wallet (no delegations). Requires an onchain-actions version that correctly plans the requested GMX action (especially close via decrease order).
- `E2E_PROFILE`: optional system-test profile.
  - `mocked`: deterministic agent-local MSW handlers intercept Allora + onchain-actions.
  - `live` (default): normal runtime behavior with real providers.
- `GMX_ALLORA_AGENT_WALLET_ADDRESS`: optional override for the agent wallet (delegatee) address. If omitted, it is derived from `A2A_TEST_AGENT_NODE_PRIVATE_KEY`.
- `A2A_TEST_AGENT_NODE_PRIVATE_KEY`: required when `GMX_ALLORA_TX_SUBMISSION_MODE=submit` (0x + 64 hex chars). Only for local/dev use.
- `ARBITRUM_RPC_URL`: RPC URL for broadcasting transactions when submission is enabled.
