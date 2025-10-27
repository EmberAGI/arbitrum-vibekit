# Architecture Canvas — A2A Agent with Skills, Workflows, and MCP

## Objectives

- **Single workspace (`config/`)** for customization.
- **Independent skills** (A2A-compliant) that compose into **one agent card**.
- **Global registries** for **MCP servers** and **workflows**; skills **select** and optionally **override**.
- Deterministic composition, strict scoping, and portable artifacts.

## Core Entities

- **Agent**: base system prompt + base card.
- **Skill**: A2A fragment (card subset), sub-prompt, selections (MCP/Workflows), overrides.
- **MCP Server**: runnable tool provider (from global registry).
- **Workflow**: script module (.ts or .js) implementing `WorkflowPlugin`; declared via plugin registry, resolved at runtime.
- **Registries**: canonical catalogs: `mcp.json` (Claude-compatible; drop-in, no extras), `workflow.json` (explicit allowlist).

## File Layout (single workspace)

```
/config
  agent.manifest.json        # entrypoint; picks skills and registries
  agent.md                   # main prompt + frontmatter (base card)
  mcp.json                   # shared MCP catalog (Claude-compatible; drop-in)
  workflow.json              # shared plugin allowlist (JSON registry)
  /skills                    # independent skill files
    extract.md
    classify.md
    reconcile.md
  /workflows
    invoices.ts
    vectorstore.js
```

## Minimal Schemas (essentials)

**Agent Base (`agent.md` with YAML frontmatter)**

```markdown
---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'Acme Invoice Agent'
  description: 'An AI agent that processes invoices, reconciles accounts, and extracts structured data'
  url: 'https://api.acme.com/agent'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'Acme Corp'
    url: 'https://acme.com'
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json']

# Agent-level model configuration (default for all skills)
model:
  provider: anthropic # openai, anthropic, google, etc.
  name: claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1.0
    reasoning: medium # none, low, medium, high (provider-specific)
---

You are an invoice processing agent. Your primary role is to help users extract, classify, and reconcile invoice data...
```

**Agent Manifest**

```yaml
version: 1
skills: [./skills/extract.md, ./skills/reconcile.md]
registries: { mcp: ./mcp.json, workflows: ./workflow.json }
merge:
  card: { capabilities: 'union', toolPolicies: 'intersect', guardrails: 'tightest' }
```

**Skill (.md with YAML frontmatter)**

```markdown
---
skill:
  # A2A standard fields
  id: invoice-extractor
  name: Invoice Extractor
  description: 'Extracts structured data from invoice documents using OCR and schema validation'
  tags: [ocr, extraction, validation]
  examples:
    - 'Extract line items from this invoice PDF'
    - 'Parse invoice header information'
  inputModes: ['application/pdf', 'image/png']
  outputModes: ['application/json']

  # Extension: Model override (optional, overrides agent-level config)
  model:
    provider: openai
    name: gpt-5-mini
    params:
      temperature: 0.0 # Deterministic extraction
      reasoning: none

  # Extension: MCP server selection
  mcp:
    servers:
      - name: files
        allowedTools: [read_file, list_directory] # omit allowedTools → allow all from server
      - name: search # no allowedTools → allow all

  # Extension: Workflow selection
  workflows:
    include: ['@acme/invoices', 'local-summarizer']
    overrides:
      '@acme/invoices': { config: { postingMode: 'off' } }
---

You are the Invoice Extractor skill. You specialize in reading invoice documents and extracting structured data...
```

**MCP Registry (Claude-compatible)**

```json
{
  "mcpServers": {
    "files": { "command": "node", "args": ["./servers/files/index.js"] },
    "search": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] },
    "invoices": { "command": "python", "args": ["-m", "mcp_invoices"] }
  }
}
```

This object is directly usable by Claude Desktop (`claude_desktop_config.json`) and, under `claudeCode.mcpServers`, by Claude Code (`settings.json`). No extra fields beyond Claude’s schema.

HTTP streamable transport (Claude-compatible):

```json
{
  "mcpServers": {
    "notes-http": {
      "transport": {
        "type": "http",
        "url": "https://api.example.com/mcp",
        "headers": { "Authorization": "Bearer ..." }
      }
    }
  }
}
```

**Workflow Plugin Registry**

```json
{
  "workflows": [
    { "id": "invoices", "from": "./config/workflows/invoices.ts", "enabled": true },
    { "id": "local-summarizer", "from": "./config/workflows/summarizer.ts", "enabled": true }
  ]
}
```

Note: Workflow metadata belongs inside each workflow module, not in the registry. Example workflow module shape:

```ts
// ./config/workflows/invoices.ts
import type { WorkflowPlugin, WorkflowContext, WorkflowState } from '@agent-node/workflows';
import { z } from 'zod';

const plugin: WorkflowPlugin = {
  id: 'invoices',
  name: 'Invoice Processor',
  description: 'Processes invoice documents and extracts structured data',
  version: '1.0.0',
  inputSchema: z.object({
    invoiceUrl: z.string().url(),
    format: z.enum(['pdf', 'png', 'jpg']).optional(),
  }),
  async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState, void, unknown> {
    yield { type: 'status', status: { state: 'working', message: 'Processing invoice...' } };

    // Skill overrides are merged into context.parameters
    // Example: skill specifies { config: { postingMode: 'off' } }
    const postingMode = context.parameters?.postingMode ?? 'auto';

    const result = await processInvoice(context.parameters, { postingMode });

    yield {
      type: 'artifact',
      artifact: { name: 'invoice-data.json', mimeType: 'application/json', data: result },
    };
  },
};

export default plugin;
```

## Composition Rules (deterministic)

- **Prompt**: `final = agent.md + "\n\n" + each(skill.body (markdown) in manifest order)`.
- **Agent Card**:
  1. Start with `agent.md` frontmatter (base A2A card fields).
  2. Extract A2A fields from each skill and add to the agent card's `skills` array, applying `merge.card` policy.
  3. Validate final against A2A schema.

- **MCP/Workflows**:
  - Effective sets = union of skill selections (by name or tag).
  - De-dup by key; conflict on runtime args → **error**.
  - Apply per-skill overrides on top of registry defaults (shallow merge).
  - Per-skill MCP tool scoping: if `mcp.servers[].allowedTools` is present, only those tools from that server are exposed; if omitted, all tools from that server are available to the skill.

## Runtime Flow

1. **Load** agent manifest → registries → skills.
2. **Resolve selections** (names/tags) → compute effective MCP/Workflow sets.
3. **Instantiate** MCP servers & workflows.
4. **Compose prompt + agent card** → validate.
5. **MVP routing**: none. All skills’ MCP servers, tools, and workflows are merged into a single context Tool and Workflow plugin context. Agent card still shows separate skills.
6. **Scope tools (MVP)**: expose the union of MCP + workflow tools across skills. Per-skill whitelists/namespacing remain in config but are not enforced at runtime yet.
7. **Execute**; tag logs/metrics with available identifiers (e.g., `skill_id` for provenance) while the tool context is global.

## Scoping & Namespacing

- Tool names should be **namespaced**: `extract.summarize_text`, `reconcile.post_invoice`.
- Activation gates:
  - **Visibility**: only register tools for active skill(s).
  - **Policies**: intersect guardrails; “most restrictive wins”.

- MVP note: runtime merges tool visibility across skills; per-skill gates are not enforced until routing lands.

- Cross-skill episodes: allow sequenced activation with explicit handoff rules.

## Conflict Resolution Defaults

- **Duplicate tool names**: forbid (require namespace).
- **Workflow/MCP differing configs**:
  - If same key: **error**.

- **Model/runtime settings**: agent-level wins unless a skill marks **allowed overrides**.

## Security & Isolation

- **Workflows**: load in-process via dynamic import (ESM/CJS). Keep it simple; no worker/child by default. Optional TS support via in-memory build (e.g., esbuild/tsx).
- **MCP**: isolate as external processes; per-instance env; pin versions.
- **Secrets**: loaded via ConfigManager from `.env` (validated with Zod schema). No file overlays.
- **Policy merge**: intersect tool policies; deny on ambiguity.
- **Workflow import**: disable auto-discovery by default; load only workflows listed in `workflow.json` (or `.js`).

## Developer Experience

- **CLI**:
  - `agent init` (scaffold `config/` workspace and sample registries)
  - `agent run --profile=dev`
  - `agent doctor` (validate schemas, print effective config/graph)
  - `agent print-config` (composed prompt/card, tool lists)
  - `agent bundle` (export monofile for deployment)

- **Hot Reload**: watch `config/**/*`; restart affected components minimally (skills/workflows without bouncing model session when possible).
- **Schemas**: publish JSON Schemas; editor association for YAML + MD frontmatter.

## Decision Principles

- **Independence (config-level)**: each skill is self-contained in configuration (A2A fields, sub-prompt, MCP/workflow selections). Runtime execution merges into shared context (MVP).
- **Reuse**: MCP & workflows are selected from shared registries.
- **Determinism**: order and merge policies are explicit and testable.
- **Safety first**: intersection of policies; scoped tools; isolated execution (future).
- **Portability**: keep MCP schema Claude-compatible; A2A-compliant final card.
- **Explicit control**: workflows loaded via registry allowlist; no automatic import from `workflows/`.
