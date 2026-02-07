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

