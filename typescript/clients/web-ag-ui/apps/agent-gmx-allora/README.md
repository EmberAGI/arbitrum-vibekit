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

- `GMX_MIN_NATIVE_ETH_WEI`: minimum native ETH (in wei) required in the operator wallet before the agent will proceed (defaults to `2000000000000000` = 0.002 ETH).
- `GMX_ALLORA_TX_SUBMISSION_MODE`: transaction submission mode. Supported values:
  - `plan` (default): build and emit `transactions[]` but do not broadcast.
  - `submit`: broadcast planned transactions via an embedded wallet (no delegations). Requires an onchain-actions version that correctly plans the requested GMX action (especially close via decrease order).
- `GMX_ALLORA_EMBEDDED_PRIVATE_KEY`: required when `GMX_ALLORA_TX_SUBMISSION_MODE=submit` (0x + 64 hex chars). Only for local/dev use.
