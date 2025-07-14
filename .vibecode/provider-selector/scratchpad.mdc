---
description: 
globs: 
alwaysApply: false
---
# Project: Refactor Agents to Use Provider Selector
Last Updated: 2025-06-20T04:45:00Z
Current Role: Executor

## Background and Motivation
The user wants to refactor all example and template agents to use the new `provider-selector` from `arbitrum-vibekit-core` (no scoped namespace). This change will centralize and simplify AI provider configuration, making it easier to manage API keys and switch between models. The current implementation often hardcodes provider choices (e.g., `openrouter(...)`), which we will replace with a unified `createProviderSelector()` call.

## Key Challenges and Analysis
- **Consistency**: Ensuring all agents are updated to use the new `createProviderSelector` function from `arbitrum-vibekit-core` consistently.
- **Configuration**: The new `createProviderSelector` function takes an object with API keys (e.g., `openRouterApiKey`, `openaiApiKey`, `xaiApiKey`, `hyperbolicApiKey`). While the function itself does **not** depend on environment variables directly, we will typically load these keys from the environment (e.g., `process.env.OPENROUTER_API_KEY`) when constructing the configuration object at runtime.
- **Dependency Management**: Each agent's `package.json` must depend on the latest version of `arbitrum-vibekit-core` and remove direct dependencies on provider-specific SDK packages (`@openrouter/ai-sdk-provider`, `@ai-sdk/openai`, `@ai-sdk/xai`, `@hyperbolic/ai-sdk-provider`) unless still needed elsewhere.
- **Scope**: We need to correctly identify all agents in `typescript/examples` and `typescript/templates` that require this refactoring.

## High-level Task Breakdown
### Task 1: Refactor Example Agents
- **Description**: Update all agents in `typescript/examples/` to use the `createProviderSelector` utility.
- **Success Criteria**: All example agents instantiate their AI provider via `createProviderSelector()` and no longer have direct dependencies on provider-specific packages like `@openrouter/ai-sdk-provider` for provider instantiation.
- **Dependencies**: None.
- **Status**: Not Started

### Task 2: Refactor Template Agents
- **Description**: Update all agents in `typescript/templates/` to use the `createProviderSelector` utility.
- **Success Criteria**: All template agents instantiate their AI provider via `createProviderSelector()`, setting a clear pattern for new projects.
- **Dependencies**: None.
- **Status**: Not Started

### Task 3: Docs & Env Files (README updates)
- [x] `lending-agent-no-wallet`
- [x] `liquidity-agent-no-wallet`
- [x] `pendle-agent`
- [x] `swapping-agent`
- [x] `swapping-agent-no-wallet`
- [x] `allora-price-prediction-agent`
- [x] `langgraph-workflow-agent`
- [x] `lending-agent`
- [x] `quickstart-agent`

Pending:
- [ ] `.env.example` / `env.example` templates creation (blocked by tooling restrictions)

### Task 4: Update Package Dependencies
- **Description**: For every agent, add `arbitrum-vibekit-core` as a dependency (workspace reference) and remove any direct provider-specific SDK dependencies no longer required.
- **Success Criteria**: `pnpm install --frozen-lockfile` succeeds, and lockfile changes reflect updated dependencies. No agent imports provider SDKs directly (except through `arbitrum-vibekit-core`).
- **Dependencies**: Tasks 1 & 2 (code changes)
- **Status**: Not Started

### Task 5: Adjust Tests & CI
- **Description**: Update unit/integration tests (and CI scripts) to initialize providers via `createProviderSelector`. Remove any test mocks that stub provider constructors directly.
- **Success Criteria**: All test suites pass after refactor (`pnpm test -r`).
- **Dependencies**: Tasks 1,2,4
- **Status**: Not Started

### Task 6: Update Dockerfiles & Sample Commands
- **Description**: Ensure Dockerfiles copy `.env.example` (or reference) and set `ENV` instructions for expected variables. Update any startup scripts to use provider selector.
- **Success Criteria**: `docker build` for each agent succeeds and containers run without hardcoded provider IDs.
- **Dependencies**: Tasks 1-4
- **Status**: Not Started

### Task 7: Graceful Shutdown Handlers
- **Description**: Add consistent SIGINT/SIGTERM handlers to all refactored agents for production readiness.
- **Success Criteria**: All agents handle both signals with proper cleanup via `agent.stop()`.
- **Dependencies**: Tasks 1 & 2 (agents must be refactored first).
- **Status**: Completed

## Project Status Board
### Task 1: Example Agents (`typescript/examples/`)
- [x] `lending-agent-no-wallet`
- [x] `liquidity-agent-no-wallet`
- [x] `pendle-agent`
- [x] `swapping-agent`
- [x] `swapping-agent-no-wallet`
- [ ] `trendmoon-agent` (skipped – relies heavily on OpenAI SDK directly)

### Task 2: Template Agents (`typescript/templates/`)
- [x] `allora-price-prediction-agent`
- [x] `langgraph-workflow-agent`
- [x] `lending-agent`
- [x] `quickstart-agent`

### Task 3: Docs & Env Files
- [x] `lending-agent-no-wallet`
- [x] `liquidity-agent-no-wallet`
- [x] `pendle-agent`
- [x] `swapping-agent`
- [x] `swapping-agent-no-wallet`
- [x] `allora-price-prediction-agent`
- [x] `langgraph-workflow-agent`
- [x] `lending-agent`
- [x] `quickstart-agent`

### Task 4: Dependencies Cleanup
- [ ] All `package.json` files updated

### Task 5: Tests & CI
- [ ] All test suites updated & passing

### Task 6: Dockerfiles
- [ ] All Dockerfiles updated

### Task 7: Graceful Shutdown Handlers
- [x] Example agents:
  - [x] pendle-agent
  - [x] lending-agent-no-wallet
  - [x] liquidity-agent-no-wallet
  - [x] swapping-agent
  - [x] swapping-agent-no-wallet
- [x] Template agents:
  - [x] allora-price-prediction-agent
  - [x] langgraph-workflow-agent
  - [x] lending-agent
  - [x] quickstart-agent

## Current Status / Progress Tracking
2025-06-20T00:00:00Z – Executor began implementation with `pendle-agent`:
• Replaced `@openrouter/ai-sdk-provider` with `createProviderSelector` from `arbitrum-vibekit-core`.
• Updated provider initialization in `src/agent.ts`.
• Removed `@openrouter/ai-sdk-provider` from `package.json`.
• Implemented flexible provider selection:
  - Auto-detects available providers from environment variables
  - Uses first available provider by default
  - Allows explicit provider selection via `AI_PROVIDER` env var
  - Supports custom model selection via `AI_MODEL` env var
  - Provider functions now include built-in default models via optional `model` parameter
• Updated README.md with comprehensive configuration documentation
• Synced README default model list with latest defaults (`gemini-2.5-flash`, `gpt-4o`, `grok-3`, `Llama-3.3-70B-Instruct`)

2025-06-20T02:00:00Z – Refactored `lending-agent-no-wallet`:
• Implemented flexible provider selection via `createProviderSelector`, mirroring `pendle-agent` pattern.
• Added multi-provider support and environment-based selection in `src/agent.ts`.
• Removed direct dependency `@openrouter/ai-sdk-provider` from `package.json`.
• Added fallback default models per provider to satisfy TypeScript `strictNullChecks`.

2025-06-20T02:25:00Z – Fixed provider-selector type signatures (optional model param) in core package and rebuilt. Removed remaining cast in lending-agent-no-wallet. Build clean.
Next: verify pendle-agent after core fix (no change needed) then proceed to liquidity-agent-no-wallet.

2025-06-20T03:00:00Z – Refactored `liquidity-agent-no-wallet`:
• Implemented flexible provider selection via `createProviderSelector`.
• Added multi-provider env-based configuration in `src/agent.ts`.
• Removed `@openrouter/ai-sdk-provider` from `package.json`.
• Updated status board.

Next: proceed to swapping-agent.

2025-06-20T03:20:00Z – Refactored `swapping-agent`:
• Replaced OpenRouter with provider selector pattern in `src/agent.ts`.
• Removed dependency on `@openrouter/ai-sdk-provider`.
• Updated status board.

Next: proceed to swapping-agent-no-wallet.

2025-06-20T03:35:00Z – Refactored `swapping-agent-no-wallet`:
• Replaced OpenRouter with provider selector logic.
• Removed `@openrouter/ai-sdk-provider` dependency.

Next: proceed to langgraph-workflow-agent.

2025-06-20T04:00:00Z – Refactored `allora-price-prediction-agent` template:
• Added multi-provider selection and env-based override logic in `src/index.ts`.
• Removed `@openrouter/ai-sdk-provider`