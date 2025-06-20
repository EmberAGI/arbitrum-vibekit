---
description: 
globs: 
alwaysApply: false
---
# Project: Arbitrum Vibekit Environment Standardization
Last Updated: 2025-06-19T00:00:00Z
Current Role: Planner

## Background and Motivation
Over months of iterative development we created multiple prototype agents in `typescript/examples/*` and production-ready template agents in `typescript/templates/*`. Each prototype hard-coded its own set of environment variables (e.g. `OPENROUTER_API_KEY`, `QUICKNODE_API_KEY`, `TRENDMOON_API_KEY`). Some include `.env.example` files, others do not, and Docker/Compose files reference yet another set. This inconsistency causes build failures, onboarding friction, and unclear documentation. The goal is to establish a single, coherent environment-variable strategy that:
• Works for local, CI and container execution out-of-the-box.
• Provides a master list of required variables with descriptions and defaults.
• Eliminates duplicated configuration and "magic" behaviors.
• Keeps READMEs and examples fully in sync with the actual code.

## Key Challenges and Analysis
1. Discovery – Enumerate every `process.env.*` reference across the monorepo.
2. De-duplication – Many variables map to the same service but have different names.
3. Cross-package impact – Updating a variable name touches code, tests, Dockerfiles, Compose and docs.
4. Secret handling – Some variables are sensitive and must **not** be committed even in examples.
5. CI & Docker – Workflows hard-code paths to `.env` files that may change.
6. Port number coupling – Changing an agent's port currently requires edits in code, Dockerfile, Compose, and docs.

## The Final, Unified Strategy
1. **Single Source of Truth**: There will be **one** `typescript/.env` file (created from `typescript/.env.example`) containing all shared and agent-specific variables, including unique port numbers for each agent.
2. **No File Duplication**: Agent directories will **not** contain their own `.env` files. This prevents secrets from being duplicated and scattered across the filesystem.
3. **Tooling-based Loading**: Environment variables will be loaded into local development sessions using `dotenv-cli` in `pnpm` scripts, not with custom code helpers. This makes the loading mechanism explicit and standard.
4. **Consistent & Specific Variables**: Each agent will look for its own specific port variable (e.g., `QUICKSTART_AGENT_PORT`) in its code. This same variable name will be used in the `.env` file and `docker-compose.yml`, ensuring consistency and eliminating ambiguity between local and containerized environments.

## High-level Task Breakdown
### Task 1: Environment Audit & Naming Convention
- Description: Scan the codebase for all `process.env` usage and establish a consistent naming convention for all variables (e.g., `QUICKSTART_AGENT_PORT`, `OPENROUTER_API_KEY`).
- Success Criteria: A complete list of standardized variables is created and approved.
- Dependencies: None
- Status: Not Started

### Task 2: Create Master `.env.example`
- Description: Create a single `typescript/.env.example` file containing all standardized variables for all agents, clearly commented and grouped.
- Success Criteria: The `.env.example` file is comprehensive and serves as the single source of truth for configuration.
- Dependencies: Task 1
- Status: Not Started

### Task 3: Dotenv-CLI Integration
- Description: Add `dotenv-cli` as a workspace dev dependency. Update the root `typescript/package.json` to include a helper script for loading the root `.env` file.
- Success Criteria: `pnpm add -Dw dotenv-cli` is run; a script like `"dev-env": "dotenv -e ./.env --"` is added.
- Dependencies: None
- Status: Not Started

### Task 4: Refactor All Code to Use Standardized Variables
- Description: Update all codebases (agents, core libs, test utils, clients, MCP tools) to use the new standardized variable names, including agent-specific `*_PORT` variables (e.g., `process.env.QUICKSTART_AGENT_PORT`).
- Success Criteria: All hardcoded ports and old variable names are removed from application code, test files, and utility libraries.
- Dependencies: Task 1
- Status: Not Started

### Task 5: Update Agent `package.json` Scripts
- Description: Update the `dev` script in every agent's `package.json` to use the `dotenv-cli` helper (e.g., `dotenv -e ../../.env -- tsx src/index.ts`).
- Success Criteria: `pnpm --filter <agent> dev` works correctly, loading configuration from the root `.env` file.
- Dependencies: Task 3, Task 4
- Status: Not Started

### Task 6: Align Docker Compose Configuration
- Description: Update `typescript/compose.yml` to use only the root `env_file`. Remove all `environment:` mappings for ports and use the specific `*_PORT` variables directly for port exposition. Update any agent-local `compose.yml` files to use a relative path (`../../.env`).
- Success Criteria: `docker-compose up` successfully starts multiple agents on their unique, configured ports without collision.
- Dependencies: Task 4
- Status: Not Started

### Task 7: Update CI Workflow
- Description: Create a `typescript/.env.ci` file with non-secret placeholder values. Update the CI workflow to copy this file to `typescript/.env` during setup.
- Success Criteria: CI builds are self-contained and do not rely on `.env.example`.
- Dependencies: Task 6
- Status: Not Started

### Task 8: Documentation Refresh
- Description: Overhaul all README files to reflect the new, simplified environment setup. The instructions should be: 1. `cp .env.example .env`, 2. Edit `.env`, 3. Run the agent.
- Success Criteria: A new developer can successfully run any agent locally or via Docker by following the updated documentation.
- Dependencies: Task 7
- Status: Not Started

## Project Status Board
- [ ] Task 1.1: Scan codebase for `process.env` usage
- [ ] Task 1.2: Define and approve final naming conventions for all variables
- [ ] Task 2.1: Create the master `typescript/.env.example` file
- [ ] Task 3.1: Run `pnpm add -Dw dotenv-cli`
- [ ] Task 3.2: Add `dev-env` helper script to root package.json
- [ ] Task 4.1: Refactor agents to use standardized variables
- [ ] Task 4.2: Refactor core libs and test utils
- [ ] Task 4.3: Refactor clients and MCP tools
- [ ] Task 5.1: Update `dev` scripts in all agent `package.json` files
- [ ] Task 6.1: Refactor `typescript/compose.yml` for the new strategy
- [ ] Task 6.2: Update any local `compose.yml` files with relative paths
- [ ] Task 7.1: Create `typescript/.env.ci` and update the GitHub Actions workflow
- [ ] Task 8.1: Update root README
- [ ] Task 8.2: Update all agent READMEs

## Current Status / Progress Tracking
_No work started yet._

## Executor's Feedback or Assistance Requests
_None at this stage._

## Lessons Learned
*(empty – will be populated during execution)*

## Rationale Log
- **Decision:** A single `typescript/.env` file will be the exclusive source of truth for all environment configuration.
  **Rationale:** This eliminates configuration duplication, prevents secrets from being scattered, and provides a single, clear place for developers to manage settings.
  **Trade-offs:** Requires updating all package.json scripts to use dotenv-cli.
  **Date:** 2025-06-19

- **Decision:** Environment loading for local development will be handled explicitly by `dotenv-cli` in `pnpm` scripts.
  **Rationale:** This avoids "magic" code-based helpers, is platform-agnostic (Windows-safe), and makes the behavior transparent and easy to debug.
  **Trade-offs:** Adds a dev dependency and requires script updates.
  **Date:** 2025-06-19

- **Decision:** Each agent will use a unique, specific port variable (e.g., `QUICKSTART_AGENT_PORT`) consistently in the `.env` file, the agent's code, and Docker Compose.
  **Rationale:** This provides a robust, unambiguous configuration that works identically in both local (`pnpm dev`) and containerized (`docker-compose`) environments, preventing developer confusion.
  **Trade-offs:** Not using standard `PORT` variable means less compatibility with PaaS platforms, but that's not a concern for this monorepo.
  **Date:** 2025-06-19

- **Decision:** All other "smart" solutions (file copying scripts, symlinks, `env.config.js` overrides, code-based env loaders) are rejected.
  **Rationale:** These approaches introduce unnecessary complexity, platform dependencies, or non-standard behaviors that are harder to maintain and debug.
  **Trade-offs:** None - simpler is better.
  **Date:** 2025-06-19

- **Decision:** Keep existing Zod validation in agents; no custom wrapper.
  **Rationale:** Agents already use `z.object().parse(process.env)` which is clear and works well.
  **Trade-offs:** No centralized validation utility, but avoids unnecessary abstraction.
  **Date:** 2025-06-19

- **Decision:** Agent-local compose files reference shared .env via relative path (`../../.env`).
  **Rationale:** Enables independent agent deployment while maintaining single source of truth.
  **Trade-offs:** Relative paths in compose files, but avoids env duplication.
  **Date:** 2025-06-19

## Version History
- 2025-06-19 v1.0: Initial plan with complex per-agent overrides
- 2025-06-19 v2.0: Intermediate plan using `dotenv-cli` but with flawed port mapping logic
- 2025-06-19 v3.0: Final, unified plan based on specific, consistent variables and explicit tooling