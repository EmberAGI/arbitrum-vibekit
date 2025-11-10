# Architectural and Implementation Decision Log

This document records significant architectural and implementation decisions made in the Arbitrum Vibekit project, specifically focusing on the agent-node library and ERC-8004 integration.

## Table of Contents

- [Release Workflow Modernization](#release-workflow-modernization)
- [ERC-8004 Core Config Integration](#erc-8004-core-config-integration)
- [Schema and Configuration](#schema-and-configuration)
- [Agent Card Composition](#agent-card-composition)
- [Registration Flow](#registration-flow)

---

## Release Workflow Modernization

### Decision: Adopt `@anolilab/multi-semantic-release` with per-package isolation

**Date**: 2025-11-10

**Context**: Two separate GitHub workflows independently released `@emberai/agent-node` and `@emberai/onchain-actions-registry`. Each package ran plain semantic-release scoped only by path filters, so commits touching both packages caused cross-package version bumps. Maintenance overhead grew (duplicate YAML, divergent Node versions), and failures in one workflow obscured the other’s status.

**Decision**:
- Consolidate to a single release workflow that fans out into a per-package matrix (agent-node, registry).
- Use `@anolilab/multi-semantic-release` as the orchestrator, invoked via `pnpm release -- --packages "<pkg>"` so each matrix job only publishes its target package.
- Require Node 22, enable git-notes (`refs/notes/semantic-release`), and introduce `.multi-releaserc.cjs` plus `typescript/release.base.config.mjs` as shared config.
- Keep GitHub releases per package; no combined changelog. Record the architectural shift in this document for future reference.

**Rationale**:
- Eliminates accidental version bumps by letting MSR scope commits per workspace.
- Shared setup (checkout, pnpm install, build/test gates) runs once, reducing CI time versus two full workflows.
- Matrix isolation ensures one package failing doesn’t block the other while still sharing caching/setup.
- Actively maintained fork (`@anolilab/multi-semantic-release`, Oct 2025 publish) avoids the unmaintained 2023 PoC release.

**Alternatives Considered**:
- Keep dual workflows with semantic-release-monorepo plugin — rejected due to ongoing duplication and missing shared observability.
- Roll our own pnpm-based detection loop in CI — rejected to avoid maintaining bespoke scripting when MSR already solves the orchestration problem.

**Trade-offs**:
- ✅ Consistent release policy across packages with minimal YAML.
- ✅ Easier reruns via `workflow_dispatch` inputs to target specific packages.
- ⚠️ MSR warns it layers on semantic-release internals, so we must monitor upstream changes and keep dry-run checks.
- ⚠️ Adds dependency on git-notes; workflow must fetch/push additional refs.

**Implementation**:
- `.github/workflows/release.yml` — new consolidated workflow with per-package matrix, build/test gates, MSR invocation, git-notes fetch/push.
- `typescript/package.json` — ensure `workspaces` field remains for semantic-release discovery; update `pnpm release` script.
- `typescript/.multi-releaserc.cjs` (new) — configure `deps.bump`, package allowlist, `tagFormat`.
- `docs/rationales.md` — this entry documenting the decision.

---

## ERC-8004 Core Config Integration

### Decision: Use `erc8004` Frontmatter Block with Auto A2A Extension

**Date**: 2025-10-30

**Context**: ERC-8004 agent registration needs to be integrated into the config-driven agent workspace. We needed to decide how to store ERC-8004 configuration and how to advertise support in the Agent Card.

**Decision**:
- Store ERC-8004 settings in agent.md under an `erc8004` frontmatter block
- Composer automatically injects an ERC-8004 A2A extension into `card.capabilities.extensions` when enabled
- Use explicit `erc8004` naming over generic `x-` extension prefix

**Rationale**:
- Clear, explicit naming (`erc8004`) improves readability over generic vendor extension prefix (`x8004`)
- Keeping config colocated in agent.md maintains single source of truth
- Auto-injection ensures Agent Card always reflects current config state
- Separate from A2A card validator allows independent validation with zod

**Alternatives Considered**:
- Keep `x8004` as vendor extension prefix - rejected for clarity
- Store ERC-8004 config in separate file - rejected to maintain colocated config

**Trade-offs**:
- ✅ Improved readability and discoverability
- ✅ Clear separation between config and composed output
- ⚠️ Slight increase in frontmatter surface area
- ⚠️ Requires migration for any existing configs using different naming

**Implementation**:
- `src/config/schemas/agent.schema.ts` - Added `ERC8004ConfigSchema`
- `src/config/composers/card-composer.ts` - Added `buildERC8004Extension()` and `injectERC8004Extension()`

---

### Decision: Canonical Identity Default to Arbitrum One

**Date**: 2025-10-30

**Context**: ERC-8004 requires a canonical chain for agent identity registration. We needed to choose a sensible default that balances cost, performance, and ecosystem reach.

**Decision**:
- Default canonical chain: **Arbitrum One (chain ID 42161)**
- Default mirror chains: **Ethereum Mainnet (1)** and **Base (8453)**
- Allow user override during `agent init` wizard
- Sepolia offered as optional testnet (default off)

**Rationale**:
- Arbitrum One provides low transaction costs for canonical identity writes
- High throughput supports frequent updates without prohibitive gas fees
- Growing ecosystem adoption makes it a practical default
- Mirrors on Ethereum and Base provide broad discovery across major L1 and L2 networks
- User can override during init or via config edit for different requirements

**Alternatives Considered**:
- Default to Ethereum Mainnet - rejected due to higher gas costs
- Default to Base - rejected as less established for identity registries
- No default, force user choice - rejected to streamline setup

**Trade-offs**:
- ✅ Lower costs for canonical identity operations
- ✅ Faster transaction finality
- ✅ Broad discovery through mainnet mirrors
- ⚠️ Some ecosystems may expect mainnet-first (mitigated by mirrors)
- ⚠️ Requires deployed registry contract on Arbitrum (currently placeholder)

**Implementation**:
- `src/cli/commands/init.ts` - Default canonical chain ID 42161 in interactive prompts
- `src/cli/utils/registration.ts` - Chain ID constants and registry addresses

---

### Decision: Compute CAIP-10 at Compose-Time Only

**Date**: 2025-10-30

**Context**: CAIP-10 account identifiers need to appear in the ERC-8004 extension params. We needed to decide whether to store these derived values in config or compute them on-demand.

**Decision**:
- Do NOT persist `canonicalCaip10` or other derived values in agent.md config
- Compute CAIP-10 deterministically at compose-time from source inputs:
  - `erc8004.canonical.chainId` + `erc8004.canonical.operatorAddress` → `canonicalCaip10`
  - `erc8004.canonical.chainId` + `erc8004.identityRegistries[chainId]` → `identityRegistry`
- Composed Agent Card surfaces derived values for API consumers

**Rationale**:
- Prevents drift between stored derived values and source inputs
- CAIP-10 is deterministically computed from chainId and address - storing it duplicates data
- Source inputs (chainId, operatorAddress) are the true source of truth
- Reduces config surface area and eliminates need for sync mechanisms
- Composed output (Agent Card) still provides derived values for clients

**Alternatives Considered**:
- Store both source and derived values - rejected to avoid duplication and drift
- Store only derived values - rejected as it obscures source inputs
- Compute on-read in loaders - rejected to keep loaders simple

**Trade-offs**:
- ✅ Single source of truth prevents inconsistency
- ✅ Simpler config reduces cognitive load
- ✅ Compose-time derivation makes dependencies explicit
- ⚠️ Slightly less visibility in raw config (mitigated by `print-config` command)
- ⚠️ Requires recomposition when inputs change (already required for other changes)

**Implementation**:
- `src/config/composers/card-composer.ts` - `buildERC8004Extension()` computes CAIP-10
- `src/utils/caip.ts` - CAIP formatting utilities
- `src/cli/commands/print-config.ts` - Shows derived values for inspection

---

### Decision: `update-registry` Defaults to `--all` with Override Sync

**Date**: 2025-10-30

**Context**: The `update-registry` command needs to handle multi-chain updates efficiently while keeping config and on-chain state aligned.

**Decision**:
- Default behavior: Update **all configured chains** (canonical + mirrors) via `--all` flag (default true)
- Support single-chain targeting via `--chain <id>` flag
- When override flags (--name, --version, --url, --image) are provided, **prompt user to persist** them back to config
- Persist `registrationUri` automatically after successful updates

**Rationale**:
- Multi-chain default keeps canonical and mirrors synchronized
- Reduces operational friction - one command updates entire agent registration
- Prompt for override persistence prevents config drift
- User retains control over persistence while being guided toward best practice
- Single-chain targeting via `--chain` supports specific update scenarios

**Alternatives Considered**:
- Default to single chain (canonical only) - rejected for convenience
- No persistence prompt, always persist - rejected to maintain user control
- No persistence prompt, never persist - rejected as it leads to config drift
- Force persistence without prompt - rejected as too opinionated

**Trade-offs**:
- ✅ Keeps on-chain state aligned with config by default
- ✅ Reduces manual sync work across chains
- ✅ Persistence prompt educates users about config management
- ⚠️ Longer default operation time (acceptable for update frequency)
- ⚠️ User must explicitly use `--chain` for single-chain updates (documented)

**Implementation**:
- `src/cli/commands/update-registry.ts` - Default `options.all !== false`, `--chain` flag support, persistence prompt
- `src/cli/commands/register.ts` - Similar persistence prompt for consistency

---

## Schema and Configuration

### Decision: Strict Schema Validation with Breaking Changes

**Date**: 2025-10-30

**Context**: Migration from `model` to `ai` frontmatter block required schema updates. We needed to decide on backwards compatibility approach.

**Decision**:
- Apply `.strict()` to all zod schemas (reject unknown keys)
- NO backwards compatibility for deprecated `model` field
- Old configs using `model` will fail validation with clear migration guidance
- `doctor` command reports deprecated fields as **errors**, not warnings

**Rationale**:
- This is an internal codebase, not a public library
- Breaking changes are acceptable in pre-1.0 development
- Backwards compatibility adds complexity without clear benefit
- Strict validation catches configuration errors early
- Clear error messages guide users through migration

**Alternatives Considered**:
- Support both `model` and `ai` fields - rejected to avoid maintaining dual paths
- Deprecation warnings + gradual migration - rejected as unnecessary for internal codebase
- Automatic migration on load - rejected to avoid silent config changes

**Trade-offs**:
- ✅ Simpler codebase without legacy compatibility layers
- ✅ Catches config errors immediately
- ✅ Forces clean migration rather than gradual decay
- ⚠️ Requires active migration for existing configs (acceptable)
- ⚠️ No grace period for deprecation (acceptable for internal use)

**Implementation**:
- `src/config/schemas/agent.schema.ts` - All schemas use `.strict()`
- `src/cli/commands/doctor.ts` - Deprecated field detection as errors
- `src/config/runtime/init.ts` - Adapter functions convert frontmatter to runtime types

---

## Agent Card Composition

### Decision: Separate Routing Configuration from A2A Endpoint

**Date**: 2025-10-30

**Context**: Agent Card hosting path and origin needed to be configurable independently from the A2A service endpoint URL.

**Decision**:
- Add `routing.agentCardPath` to control Agent Card hosting path (default `/.well-known/agent-card.json`)
- Add `routing.agentCardOrigin` to override Agent Card origin (defaults to `origin(card.url)` with path removed)
- Express server serves Agent Card at `routing.agentCardPath` with 308 redirect from default path when customized
- `card.url` in composed Agent Card remains the **A2A service endpoint**, NOT the Agent Card URL
- Agent Card URL composition: `${routing.agentCardOrigin || origin(card.url)} + ${routing.agentCardPath}`

**Rationale**:
- Agent Card URL (for registration) may differ from A2A endpoint due to proxies/CDNs
- Separating concerns allows flexible hosting configurations
- Supporting path prefixes (e.g., `/prefix/.well-known/agent-card.json`) enables multi-tenant hosting
- `card.url` semantic meaning is "A2A service endpoint", not "Agent Card location"
- Redirect ensures compatibility when moving from default to custom path

**Alternatives Considered**:
- Derive Agent Card URL from `card.url` path - rejected as it conflates A2A endpoint with Agent Card location
- Require manual Agent Card URL input - rejected as error-prone
- Single `agentCardUrl` override - rejected as it doesn't separate origin and path concerns

**Trade-offs**:
- ✅ Flexible hosting configurations
- ✅ Clear separation of concerns (A2A endpoint vs. Agent Card location)
- ✅ Supports prefixes and custom origins
- ⚠️ Slight increase in config complexity (mitigated by sensible defaults)
- ⚠️ Two config fields instead of one (mitigated by clear documentation)

**Implementation**:
- `src/config/schemas/agent.schema.ts` - `RoutingConfigSchema`
- `src/a2a/server.ts` - Serves Agent Card at `routing.agentCardPath` with redirect
- `src/cli/commands/register.ts`, `src/cli/commands/update-registry.ts` - Compose Agent Card URL from routing config

---

## Registration Flow

### Decision: Config-Driven Registration with CLI Override Persistence

**Date**: 2025-10-30

**Context**: `register` and `update-registry` commands needed to support both config-driven and CLI flag-driven workflows.

**Decision**:
- Default mode: `--from-config` (reads from agent.md)
- CLI flags override config values when provided
- When overrides are used, **prompt user** to persist back to config before registration
- After successful registration, **automatically persist** `agentId` and `registrationUri` to `erc8004.registrations[chainId]`
- Support multi-chain operations via `--all` (default) and single-chain via `--chain <id>`

**Rationale**:
- Config-driven approach aligns with agent-node's composition model
- CLI overrides support ad-hoc testing and corrections
- Persistence prompt prevents config drift while maintaining user control
- Automatic persistence of registration results keeps config synchronized with on-chain state
- Multi-chain default reduces operational overhead

**Alternatives Considered**:
- CLI-only (no config integration) - rejected as inconsistent with agent-node model
- Always persist overrides without prompt - rejected to maintain user control
- Never persist overrides - rejected as it leads to config drift
- Manual persistence of registration results - rejected as error-prone

**Trade-offs**:
- ✅ Config and on-chain state stay synchronized
- ✅ User retains control over override persistence
- ✅ Reduces manual bookkeeping (agentId, registrationUri)
- ⚠️ Interactive prompts require TTY (acceptable, auto-skip in CI/non-TTY)
- ⚠️ Slightly longer workflow due to prompts (acceptable for infrequent operations)

**Implementation**:
- `src/cli/commands/register.ts` - `--from-config` default, override persistence prompt, agentId/registrationUri auto-persistence
- `src/cli/commands/update-registry.ts` - Same patterns, plus `--chain` flag support

---

## Interactive Init Wizard

### Decision: TTY-Aware Interactive Prompts with Non-Interactive Fallback

**Date**: 2025-10-30

**Context**: `agent init` command needed to collect configuration in a user-friendly way while supporting automated/CI environments.

**Decision**:
- Interactive mode by default when `stdin.isTTY && stdout.isTTY`
- Non-interactive mode via `--yes` or `--non-interactive` flags (uses defaults)
- Collect comprehensive configuration via prompts:
  - Agent basics (name, description, version, provider info, base URL)
  - AI provider selection with model suggestions
  - API key collection for selected provider
  - IPFS credentials (PINATA_JWT, PINATA_GATEWAY)
  - ERC-8004 enable toggle
  - Canonical chain selection (default Arbitrum One)
  - Mirror chain multiselect (Ethereum + Base default on)
  - Optional operator address with validation
- Write collected secrets to `.env`
- Generate agent.md dynamically from collected configuration

**Rationale**:
- Interactive prompts provide guided setup experience for new users
- TTY detection ensures graceful degradation in CI/automated environments
- Comprehensive upfront configuration reduces post-init edits
- Provider-specific model suggestions improve discoverability
- API key collection during init streamlines setup
- Dynamic agent.md generation ensures consistency

**Alternatives Considered**:
- Always interactive - rejected as it breaks CI/automation
- Always non-interactive - rejected as poor UX for manual setup
- Minimal prompts with post-init config - rejected as more friction
- Separate init and config commands - rejected as less cohesive

**Trade-offs**:
- ✅ Excellent UX for interactive setup
- ✅ Graceful fallback for automation
- ✅ Single command completes full setup
- ✅ Reduces configuration errors via validation
- ⚠️ More complex implementation (acceptable)
- ⚠️ Longer init time for interactive mode (acceptable, one-time operation)

**Implementation**:
- `src/cli/commands/init.ts` - TTY detection, prompts integration, dynamic agent.md generation, .env secret writing

---

## Validation and Developer Experience

### Decision: Comprehensive Validation in `doctor` Command

**Date**: 2025-10-30

**Context**: Complex configuration with multiple blocks (ai, routing, erc8004) required comprehensive validation with actionable feedback.

**Decision**:
- Strict schema validation for all config artifacts (agent.md, skills, mcp.json, workflow.json)
- Dedicated validators for `erc8004` and `routing` configs
- Unknown keys treated as **errors** (strict mode enforcement)
- Deprecated fields reported as **errors** with migration guidance
- `doctor` command aggregates and reports errors and warnings
- Extension inspection in composed Agent Card
- Warnings for:
  - Zero-address registry placeholders
  - Missing operator address (cannot form CAIP-10)
  - Local URLs in production
  - Custom routing config (non-default paths/origins)

**Rationale**:
- Early error detection prevents runtime failures
- Actionable warnings guide users toward best practices
- Strict validation catches typos and structural errors
- Separate validators allow focused, maintainable validation logic
- Extension inspection verifies composition correctness

**Alternatives Considered**:
- Minimal validation - rejected as error-prone
- Runtime-only validation - rejected as late detection
- Warnings instead of errors for unknown keys - rejected as too permissive

**Trade-offs**:
- ✅ Catches errors before deployment
- ✅ Clear, actionable feedback
- ✅ Prevents subtle config bugs
- ⚠️ More upfront validation code (acceptable)
- ⚠️ Stricter than some users may expect (mitigated by clear error messages)

**Implementation**:
- `src/config/validators/erc8004-validator.ts` - ERC-8004 specific validation
- `src/config/validators/routing-validator.ts` - Routing config validation
- `src/cli/commands/doctor.ts` - Aggregated validation with extension inspection
- `src/cli/commands/print-config.ts` - ERC-8004 status extraction

---

## Summary

These decisions collectively establish a config-driven, composable approach to ERC-8004 agent registration within the agent-node library. Key themes:

- **Config as Source of Truth**: All configuration in agent.md with compose-time derivation
- **Breaking Changes Acceptable**: Internal codebase benefits from clean breaks over backwards compatibility
- **Interactive with Graceful Degradation**: TTY-aware prompts with non-interactive fallback
- **Validation Early and Often**: Strict schemas with actionable feedback
- **Persistence with User Control**: Auto-persist registration results, prompt for overrides
- **Sensible Defaults**: Arbitrum One canonical, Ethereum + Base mirrors, OpenRouter AI provider

These decisions support the overarching goal of making ERC-8004 a first-class, frictionless feature of the agent-node config workspace.
