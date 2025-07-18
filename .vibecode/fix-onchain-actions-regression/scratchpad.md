# Project: Fix Onchain-Actions CI Regression

Last Updated: 2023-10-27T11:00:00Z
Current Role: Planner

## Background and Motivation

**Correction:** Initial analysis incorrectly pointed to a protobuf message change as a source of the CI failure. Deeper investigation has shown this to be incorrect.

The CI for the `swapping-agent-no-wallet` is failing with "Token WETH not supported" errors. The **sole root cause** of this regression has been traced to a single breaking change in the `onchain-actions` submodule:

1.  **Empty Database Logic (Commit `ec084339`):** The `tokenImporter` in `onchain-actions` was modified to stop and return an empty token list if its own database is empty. This is the default state in a clean CI environment, causing the `getTokens` tool to return no tokens and the agent's tests to fail.

This plan outlines a temporary workaround to be implemented in `arbitrum-vibekit` to make the CI green again. The proper, long-term fix must be made in the `onchain-actions` repository by removing this "early exit" logic.

## Key Challenges and Analysis

- **Temporary vs. Permanent Fix:** The goal here is a short-term fix to unblock CI. The permanent solution belongs in `onchain-actions`. The workaround should be simple and easily removable.
- **Minimal Impact:** The fix should be scoped as narrowly as possible to the `swapping-agent-no-wallet` example and its tests to avoid introducing complex logic into the core framework.
- **Clarity:** The workaround should be clearly documented with comments explaining why it exists and that it should be removed once `onchain-actions` is fixed.

## High-level Task Breakdown

### Task 1: Implement a Fallback Mechanism in the Swapping Agent

- **Description:** Modify the `swapping-agent-no-wallet` to handle an empty response from the `getTokens` tool call. If the `tokenMap` is empty after the call, populate it with a hardcoded list of essential tokens for the tests (e.g., WETH, USDC).
- **Success Criteria:** The agent's `tokenMap` is successfully populated with fallback tokens when the `getTokens` tool returns an empty list.
- **Dependencies:** None.
- **Status:** Not Started

### Task 2: Update Agent Logic to Use Fallback

- **Description:** In `agent.ts` for the `swapping-agent-no-wallet`, after the `populateGenericTokens` call, check if the `tokenMap` is empty. If it is, call a new function to populate it with the hardcoded fallback data.
- **Success Criteria:** The agent proceeds with a non-empty `tokenMap`, allowing the tests to pass.
- **Dependencies:** Task 1.
- **Status:** Not Started

### Task 3: Add Documentation Comments

- **Description:** Add comments to the new fallback logic explaining that it is a temporary workaround for the `onchain-actions` regression and should be removed later.
- **Success Criteria:** The code contains clear comments linking the workaround to the upstream issue.
- **Dependencies:** Task 1 & 2.
- **Status:** Not Started

### Task 4: Run Tests Locally

- **Description:** Run the `swapping-agent-no-wallet` tests locally to confirm that the workaround fixes the CI failures.
- **Success Criteria:** All tests for the swapping agent pass successfully on the local machine.
- **Dependencies:** Task 1, 2, 3.
- **Status:** Not Started

### Phase 2 (Technical-Debt): Remove Legacy Protobuf Call Pattern

These tasks are not required to make CI green, but they remove the now-obsolete array-based `chainIds` argument and any other vestiges of the old `.proto` interface. They should be tackled after Phase 1 is merged.

#### Task 5: Audit and Update `getTokens` Call Sites

- Description: Find every call to `getTokens` that still sends `chainIds` as an array. Update them to send the single `chainId` string or omit the argument entirely when requesting “all chains”.
- Success Criteria: No code path in `arbitrum-vibekit` passes an out-of-spec argument; type checks pass.
- Dependencies: None (can be done anytime after Phase 1).
- Status: Pending

#### Task 6: Delete Any Remaining Proto References

- Description: Confirm that all references to `onchain_actions.proto` and generated `*.ts` types have been removed. Clean up obsolete imports, types, and scripts.
- Success Criteria: Grep for `onchain_actions.proto` returns zero results; build is clean.
- Dependencies: Task 5.
- Status: Pending

#### Task 7: Update Documentation

- Description: Update READMEs and comments to reflect the MCP-only interface and the new `chain_id` parameter.
- Success Criteria: No docs mention the old `chain_ids` array.
- Dependencies: Task 6.
- Status: Pending

## Project Status Board

- [ ] Task 1.1: Create a hardcoded list of fallback tokens (WETH, USDC for Arbitrum).
- [ ] Task 1.2: Create a new private method in the `Agent` class, e.g., `_populateFallbackTokens()`.
- [ ] Task 2.1: In the `init` method, after calling `populateGenericTokens`, add a check for an empty `this.tokenMap`.
- [ ] Task 2.2: If the map is empty, call `_populateFallbackTokens()`.
- [ ] Task 3.1: Add a block comment above the fallback logic explaining its purpose and the `onchain-actions` commits that necessitate it.
- [ ] Task 4.1: Execute `pnpm test` for the `swapping-agent-no-wallet` package.

## Executor's Feedback or Assistance Requests

Awaiting approval of the plan before switching to Executor mode.

## Lessons Learned

- CI failures can be caused by regressions in dependencies, not just the primary repository.
- Initial analysis can be misleading; it's crucial to verify findings with multiple approaches (`git show`, `git log -S`, `git blame`) to pinpoint the true root cause.
- Submodule updates can introduce breaking changes that are not immediately obvious.

## Rationale Log

- **Decision:** Implement a temporary workaround in `arbitrum-vibekit` instead of immediately fixing `onchain-actions`.
- **Rationale:** Unblocking the CI for the main repository is a higher immediate priority. A proper fix in `onchain-actions` may require more extensive changes and coordination. This workaround provides a fast, targeted solution.
- **Trade-offs:** This introduces technical debt (the workaround) that will need to be removed later. However, it's a necessary trade-off for CI stability.
- **Date:** 2023-10-27

## Version History

- v1.0 (2023-10-27): Initial plan creation.
- v1.1 (2023-10-27): Corrected root cause analysis, removing incorrect protobuf theory and focusing on the empty database logic.

## Regression Timeline & Details

The CI failures were traced to a single, specific commit in the `onchain-actions` submodule.

### Breaking Change: Empty Database Logic

- **Commit Hash:** `ec084339c85bdde9f059bfc32f1a7825c4c7a676`
- **Author:** Tom Daniel <0xtomdaniel@gmail.com>
- **Date:** Sat Jun 28 14:01:45 2025 +0200
- **Message:** `fix: One test`
- **Impact:** This commit introduced a change in the `tokenImporter.ts` service. The new logic causes the service to perform an "early exit" and return an empty array if the token database is empty. In a clean CI environment, the database starts empty, so the `getTokens` tool returns no tokens, causing the downstream failure. This is the sole cause of the regression.

### Historical Note: Legacy Protobuf Change (for Phase 2 Reference)

While not responsible for the current CI break, the change that converted `GetTokensRequest` from `repeated string chain_ids` to `string chain_id` is technical debt we will remove in Phase 2. The earliest commit where the new single-string field appears is:

- **Commit Hash:** `ea8c54e84aa7b6a4ad0ccd43c6fdd224fc3e918a`
- **Author:** Tom Daniel <0xtomdaniel@gmail.com>
- **Date:** Wed Jan 22 17:48:32 2025 +0800
- **Message:** `corrected proto filename`

Subsequent commits (`8fe0dd7`, `643e68f`) expanded the change across all CreateTransaction endpoints.

This information is included so the Executor can quickly locate and remove any remaining references during Phase 2.
