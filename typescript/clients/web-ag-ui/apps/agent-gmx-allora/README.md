# GMX Allora Agent

This agent uses Allora prediction feeds to make deterministic trading decisions for GMX perpetuals on Arbitrum and then:

- builds **transaction plans** to open/modify/close positions via `onchain-actions`
- (future) **submits user transactions** (normal user flows, not GMX keeper "execution")

## Roadmap Vocabulary

- **Transaction planning**: producing `transactions[]` that a wallet can sign and submit.
- **Transaction submission**: broadcasting signed transactions and recording tx hashes in artifacts/history.

## Current Milestones

- Plan-building mode (no submission) is implemented.
- Next: validate onchain-actions read-path correctness (markets/positions/balances) before enabling transaction submission.

## Environment

- `GMX_MIN_NATIVE_ETH_WEI`: minimum native ETH (in wei) required in the operator wallet before the agent will proceed (defaults to `2000000000000000` = 0.002 ETH).
- `GMX_ALLORA_TX_SUBMISSION_MODE`: transaction submission mode. Supported values:
  - `plan` (default): build and emit `transactions[]` but do not broadcast.
  - `submit`: broadcast planned transactions for `long` and `short` actions via an embedded wallet (no delegations). Close/reduce submission is blocked until onchain-actions supports GMX decrease orders.
- `GMX_ALLORA_EMBEDDED_PRIVATE_KEY`: required when `GMX_ALLORA_TX_SUBMISSION_MODE=submit` (0x + 64 hex chars). Only for local/dev use.
