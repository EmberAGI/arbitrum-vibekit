# Project: Arbitrum Vibekit v2 Monorepo

Last Updated: 2025-09-11T00:00:00.000Z
Current Role: Planner

## Background and Motivation

User asked to understand the codebase. Goal: produce a concise, accurate map of the monorepo, core architecture (agents, skills, tools, hooks, context), build/run flows, and environment requirements. Capture success criteria and next steps.

## Key Challenges and Analysis

- Multi-package pnpm workspace in `typescript/` with templates, examples, core libs, and a Next.js web client.
- Agents are MCP servers using `arbitrum-vibekit-core` (StreamableHTTP + SSE). Skills expose tools; handler optional.
- Provider selector supports OpenRouter, OpenAI, XAI, Hyperbolic via AI SDK.
- Context providers pass MCP clients and shared config/state to tools.
- Web client integrates with MCP endpoints; has DB/migrations and Playwright tests.

## High-level Task Breakdown

### Task 1: Repository and Package Mapping

- Description: List workspace packages, their purposes, and entry points.
- Success Criteria: Clear table of packages with run scripts and roles.
- Dependencies: none
- Status: In Progress

### Task 2: Agent Architecture Overview

- Description: Document `Agent` lifecycle, endpoints, skills→tools orchestration, MCP client setup, context providers, hooks.
- Success Criteria: Diagram/summary covering `Agent.create`, `start`, `.well-known/agent.json`, `/sse`, `/messages`.
- Dependencies: Task 1
- Status: Not Started

### Task 3: Templates and Example Agents

- Description: Identify runnable agent templates and their skills/tools; list env vars.
- Success Criteria: For `quickstart-agent`, `ember-agent`, `langgraph-workflow-agent`: skills, ports, env keys, run commands.
- Dependencies: Task 1
- Status: Not Started

### Task 4: Build/Run & Env Requirements

- Description: Document pnpm bootstrap/build/test flows; per-package dev scripts; required env variables.
- Success Criteria: Copy-pastable commands and env matrix by package/template.
- Dependencies: Task 1
- Status: Not Started

### Task 5: Skills/Tools/Context/Hooks Deep Dive

- Description: Summarize patterns with key examples (`swappingSkill`, `swapTokensTool`, hooks, provider selector, context provider).
- Success Criteria: Short code references and bullet summary of responsibilities.
- Dependencies: Task 2
- Status: Not Started

## Project Status Board

- [x] Task 1.1: Detect current branch and create scratchpad
- [ ] Task 1.2: Map workspace structure and key packages
- [ ] Task 2.1: Describe `Agent` server endpoints and runtime options
- [ ] Task 3.1: Catalog templates and skills with entry points
- [ ] Task 4.1: Document build/test scripts and envs
- [ ] Task 5.1: Provide examples of skills/tools/hooks/context

## Current Status / Progress Tracking

- 2025-09-11: Initialized scratchpad for branch `main`. Performed initial scan of workspace and core files.
- 2025-09-11: Mapped templates and entry points, extracted ports/envs and scripts.

## Templates and Entry Points

- quickstart-agent
  - Entry: `typescript/templates/quickstart-agent/src/index.ts` (PORT default 3007)
  - Skills: `greet`, `getTime` (manual), `echo` (manual)
  - Env: `OPENROUTER_API_KEY` or other provider keys, `AI_PROVIDER`, `AI_MODEL`, `PORT`
  - Scripts: `pnpm dev -F quickstart-agent`, `pnpm build -F quickstart-agent`
- ember-agent
  - Entry: `typescript/templates/ember-agent/src/index.ts` (PORT default 3001)
  - Skills: `swapping`, `documentation` (more planned)
  - Context: loads token map from Ember MCP; requires `ARBITRUM_RPC_URL`, `EMBER_MCP_SERVER_URL`, optional `DEFAULT_USER_ADDRESS`
  - Scripts: `pnpm dev -F ember-agent`, Docker compose supported
- langgraph-workflow-agent
  - Entry: `typescript/templates/langgraph-workflow-agent/src/index.ts` (default port framework 41241)
  - Single skill/tool workflow (`greeting-optimizer` / `optimize-greeting`)
  - Env: provider API key(s), optional `AI_PROVIDER`, `AI_MODEL`
- allora-price-prediction-agent
  - Entry: `typescript/templates/allora-price-prediction-agent/src/index.ts` (PORT default 3008)
  - Integrates Allora MCP via stdio; requires `ALLORA_API_KEY`

## Build/Run & Env Requirements

- Workspace
  - Install: `cd typescript && pnpm install`
  - Build: `pnpm build` (recursive)
  - Test: `pnpm test` (vitest + agents integration)
- Per template
  - Dev: `pnpm dev -F <package>`
  - Start: `pnpm build -F <package> && pnpm start -F <package>`
- Env keys
  - Providers: `OPENROUTER_API_KEY` | `OPENAI_API_KEY` | `XAI_API_KEY` | `HYPERBOLIC_API_KEY`
  - Ember agent: `ARBITRUM_RPC_URL`, `EMBER_MCP_SERVER_URL`, `DEFAULT_USER_ADDRESS`
  - Allora agent: `ALLORA_API_KEY`, optional `ALLORA_MCP_PORT`

## Architecture: Agent, Skills, Tools, Context, Hooks

- Agent (`arbitrum-vibekit-core`)
  - `Agent.create(config, { llm, cors, basePath })` → registers skills as MCP tools
  - `start(port, contextProvider)` → sets up MCP clients per skill `mcpServers`, aggregates clients to context; exposes endpoints:
    - `/.well-known/agent.json` (AgentCard)
    - `/sse` (legacy SSE), `/messages` (StreamableHTTP)
- Skills
  - Defined with `defineSkill({ id, name, description, tags, examples, inputSchema, tools, handler?, mcpServers? })`
  - LLM orchestration by default; manual handler optional
- Tools
  - `VibkitToolDefinition` with `parameters` (zod), `execute(args, context)`
  - Use `withHooks` to compose `before` and `after` hooks
- Context Providers
  - Receive `mcpClients` map; return `custom` context (e.g., token map, RPC URLs, user address)
- Hooks
  - `before` for validation/enrichment (e.g., token resolution, balance checks)
  - `after` for formatting/artifacts (e.g., transaction plans)

## Executor's Feedback or Assistance Requests

- None yet.

## Lessons Learned

- Issue: Provider selection depends on which API keys are set.
  Solution: Use `createProviderSelector` and `getAvailableProviders`; fallback to first available.
  Date: 2025-09-11

- Issue: MCP clients are created per skill via `mcpServers` in skill definition.
  Solution: `Agent.setupSkillMcpClients` aggregates clients and passes to context provider.
  Date: 2025-09-11

## Rationale Log

- **Decision:** Use Planner role to document repo before execution
  **Rationale:** Clarifies architecture and speeds future implementation
  **Trade-offs:** Time to document; lowers confusion later
  **Date:** 2025-09-11

## Version History

- Initialized planning scratchpad on branch `main`.

## Success Criteria

- Accurate map of all workspace packages and roles
- Clear documentation of core agent architecture and endpoints
- Runnable commands for dev/prod across key templates
- Environment variable checklist for templates and web client
- Examples of skills/tools/hooks/context with references to files

## Recommended Next Steps

1. Stand up `quickstart-agent` locally to validate MCP endpoints and agent card
2. Run `ember-agent` swapping flow against Ember MCP; verify token map loads
3. Connect web client via Docker Compose; test chat with swapping/lending examples
4. Plan enhancements: additional skills (lending/liquidity), security reviews, provider fallbacks

## Planned Integration: Tatum MCP for Arbitrum Data

### Objectives

- Provide AI agents access to Arbitrum blockchain data via a dedicated MCP server using Tatum Gateway.
- Expose safe, high-level tools (balance, logs, blocks, tx) and an allow-listed generic RPC tool.
- Wire the MCP server into `ember-agent` as a new `chain-data` skill.

### Design

- New package: `typescript/lib/mcp-tools/tatum-mcp-server/`
  - Transport: HTTP server with `/sse` and `/messages` (SSE + StreamableHTTP compatible), plus STDIO.
  - Auth: `X-API-Key: $TATUM_API_KEY` header.
  - Chain default: `arbitrum-one-mainnet` (support override via env `TATUM_CHAIN`).
  - Rate limiting: `p-retry` with exponential backoff for 429/403.
  - Tools (initial):
    - `get_block_number`
    - `get_native_balance` (address)
    - `get_token_balance` (tokenAddress, address)
    - `get_block_by_number` (number|tag, fullTx?)
    - `get_transaction_by_hash` (hash)
    - `get_logs` (from,to,address,topics)
    - `rpc_call` (method, params[]) – allow-list enforced from gateway methods

- Agent wiring: `typescript/templates/ember-agent/`
  - New skill: `chain-data`
  - `mcpServers`: `{ tatum-gateway: { url: process.env.TATUM_MCP_SERVER_URL || 'http://localhost:3010' } }`
  - Tools (wrappers → MCP): `getNativeBalanceTool`, `getTokenBalanceTool`, `getLogsTool`, `getTxByHashTool`, optional `rpcTool` passthrough.
  - Context: no changes required; tools can access MCP via `context.mcpClients` or provider.

### Environment

- `TATUM_API_KEY` (required)
- `TATUM_CHAIN=arbitrum-one-mainnet` (default)
- `PORT=3010` for Tatum MCP server (default)
- `TATUM_MCP_SERVER_URL=http://localhost:3010` for agents (ember-agent)

### Success Criteria

- Tatum MCP server starts (SSE/STDIO) and responds to `get_block_number`, `get_native_balance`.
- `ember-agent` can call `chain-data` tools and return formatted results as Tasks.
- Minimal integration tests pass for block number and native balance queries.

### Open Questions

- Do we also want to support Arbitrum Nova (`arb-nova-mainnet`) out of the box?
- Any additional convenience tools (e.g., ENS resolution via off-chain providers)?
