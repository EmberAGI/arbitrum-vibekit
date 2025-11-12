Short answer: **Yes—use an MCP proxy/adapter for this.** Keep hooks for guardrails/telemetry, but do **sign → (optional simulate) → send** inside a single **adapter-exposed tool** so the model sees one clean contract and never has to orchestrate the steps.

Here’s a concrete pattern that hits all your requirements:

# 1) Expose one high-level tool to the LLM

**`wallet.execute`** (adapter-owned) becomes the only thing the model calls.

**Input (adapted schema):**

```json
{
  "chainId": 1,
  "account": "primary",
  "intent": { "type": "raw_call", "to": "0x...", "data": "0x...", "value": "0x0" },
  "policy": { "simulate": true, "maxValueWei": "100000000000000000", "requireHumanConfirm": true },
  "idempotencyKey": "d3f2c9f2-..."
}
```

**Output:**

```json
{
  "status": "submitted",
  "txHash": "0xabc...",
  "preflight": { "simulationOk": true, "gasEstimate": "21000" },
  "meta": {
    "upstream_tool": "dex.buildTransaction@1.4.2",
    "adapter_version": "0.3.0",
    "signer": "ledger://m/44'/60'/0'/0/0"
  }
}
```

Under the hood the adapter:

1. Calls **upstream** tool(s) (e.g., `createTransaction`) to construct the unsigned tx.
2. Runs your **SignerProvider** (client-owned) to **sign**.
3. Optionally **simulates** (eth_call / tenderly / anvil trace) and enforces policy.
4. **Broadcasts** the signed blob and returns the **tx hash** (or full receipt if you want to wait).

The LLM never sees “do step A then B then C.” It sees “execute,” with strict JSON Schema and clear guarantees.

---

# 2) Keep signing “client-side” and swappable

Make the adapter call a pluggable **SignerProvider** interface; ship multiple implementations and let users pick one per project:

Wire providers however you like:

- **Command**: spawn `cast send --json` / `clef` / a Rust/Bun signer (stdin JSON → stdout JSON).
- **Local API**: WebHID for Ledger/Trezor, or a loopback HTTP service.
- **Smart-account** flavors: 4337 bundler, 7702 temporary code, 7715 delegated exec, Safe, ZeroDev, etc.

Because the adapter is **language-agnostic**, any signer works as long as it speaks your tiny JSON pipe.

---

# 3) Adapt upstream schemas without touching them

The adapter sits between host and upstream MCP servers and performs three transform stages:

- **Catalog transform**
  Map/merge/rename upstream tools into _virtual_ tools and **publish your adapted schemas**:
  - `dex.buildTransaction` + `erc20.approveBuild` → **`wallet.execute`** (with discriminated `intent`).
  - Replace union-heavy or awkward fields with enums/defaults the model can handle.

- **Input transform (pre)**
  Convert your clean input into whatever each upstream expects.
- **Output transform (post)**
  Normalize upstream results; add provenance and risk annotations.

Result: the host/LLM/UI only ever sees **your** schema; upstream quirks are invisible.

---

# 4) Where hooks still shine

Use hooks **around** `wallet.execute` for things that _aren’t_ schema:

- **Pre**: policy checks (allow/ask/deny), limits (value caps, chain allowlist, method selectors), logging.
- **Post**: metrics, notifications, audit log, cache warming.
- **Blocking**: exit-code `2` to veto risky calls before signing.

But avoid relying on hooks to reshape schemas; keep that in the adapter so the catalog the LLM gets is truthful.

---

# 5) Safety & UX you probably want

- **Idempotency**: require `idempotencyKey`; don’t re-send the same signed blob.
- **Dry-run & human-in-the-loop**: `policy.simulate` + `policy.requireHumanConfirm` → adapter pauses and asks the user (not the model) to confirm.
- **Risk filters**: max value, denylist selectors (e.g., `0xdd62ed3e`), recipient allowlist.
- **Replay protection**: fetch nonce/chainId from a trusted RPC; refuse mismatches from upstreams.
- **Receipts**: option to block until `N` confirmations; otherwise return immediately with hash.
- **Provenance**: always include `{ upstream_tool, upstream_version, adapter_version, signer }` in `meta`.
- **Error mapping**: return structured `{code, short, detail, upstream}` so the LLM can reason about retries.

---

# 6) Minimal config (same CLI MCP utility)

Use the **same CLI MCP command** you already planned (stdio MCP server), driven by JSON/YAML:

Run it:

This gives you:

- One **clean tool** in the catalog (`wallet.execute`)
- All heavy lifting **programmatic in the adapter**
- Pluggable signer/broadcaster without leaking into the LLM’s working memory

---

# 7) If you still want step tools

You can also expose three adapted tools—`wallet.build`, `wallet.sign`, `wallet.send`—and mark `wallet.execute` as the **preferred** high-level tool. That lets power users chain steps, while the model defaults to the atomic flow.

---

## Bottom line

- **Use an MCP proxy/adapter** to present a single, safe **`wallet.execute`** tool with your schema; compose build→sign→send inside it.
- Keep **signing client-side** via a pluggable **SignerProvider** (command/HTTP/HID/etc.), invoked by the adapter.
- Reserve **hooks** for policy/telemetry/blocking—not for schema surgery.

If you want, I can draft the `execute.json` schema and a tiny reference adapter (TypeScript or Rust) that forwards to an upstream `createTransaction`, signs via a command signer, simulates, and broadcasts.

Here’s the tight checklist of features you’ve implicitly/explicitly required for your Claude-Code-style orchestrator:

# Architecture & Extensibility

- **Tool Broker (core registry):** Discover, register, and scope tools per agent/session; enforce timeouts, rate limits, and concurrency; normalize JSON-Schema I/O and streaming.
- **MCP-first plugin surface:** Prefer MCP servers (stdio/UDS/TCP) for isolation, discovery, and typed schemas; support multiple upstreams per session.
- **CLI→MCP bridge:** Wrap any command (Bun/Rust/Go/Python/bash, etc.) as a first-class MCP tool via a stdin→stdout JSON contract.

# Adapters/Proxies & Schema Work

- **MCP adapter/proxy pattern:** Publish a _clean_ catalog/schemas to the model; internally map/compose calls to upstream MCP tools.
- **Schema transformation:** Catalog rewrite (rename/merge tools), input coercion/defaults, and output reshaping/redaction—performed inside the adapter (not hooks).
- **Virtual tools:** Expose high-level “recipe” tools (e.g., `wallet.execute`) that orchestrate multiple upstream steps atomically.

# Hooks (narrow, language-agnostic)

- **Pre/Post tool hooks:** Command-based guards and telemetry around calls (policy checks, logging, metrics); ability to **block** quickly.
- **JSON pipe contract:** Hooks receive one JSON event on stdin and emit one JSON decision; exit-code semantics (`0=ok`, `2=block`, else no-op/fallback).
- **No schema mutation via hooks:** Keep schema adaptation in adapters to avoid polluting model context.

# Wallet Execution Flow (client-side responsibility)

- **Single high-level tool:** `wallet.execute` that does _build → (optional) simulate → sign → send_ without exposing steps to the LLM.
- **Pluggable SignerProvider:** Swap signing backends (EIP-1193, Ledger/Trezor, Safe, ZeroDev, 4337 bundler, 7702/7715 paths, `cast/clef`, custom).
- **Pluggable broadcaster/simulator:** Configurable RPC/Tenderly/anvil simulate; configurable broadcast endpoints.
- **Policy & safety gates:** Value/recipient/method caps, chain allowlists, human-confirm option; nonce/chainId verification; error mapping with retry hints.
- **Idempotency & receipts:** Idempotency keys to avoid double-sends; option to return hash immediately or await N confirmations.
- **Provenance:** Always return `{ upstream_tool@ver, adapter_ver, signer_id }` in `meta`.

# Packaging & Runtime Independence

- **Universal manifest:** `id`, `version`, `entry` (transport + cmd), `tools[]` (schemas), `permissions`, `runtimes` (engine constraints), `healthcheck`, optional platform assets.
- **Installer + sandbox:** Fetch (git/tar/registry), verify (sha256/signature), lay out per-tool dirs, create platform shims, manage PATH.
- **Runtime resolution:** Prefer system runtimes; fallbacks (`npx`, `uvx/pipx`, `cargo-binstall`); optional WASI/OCI execution for determinism.
- **Cross-platform transport:** Default stdio (no ports); optional TCP/UDS/HTTP bridges.

# Policy, Security & Governance

- **Capability model:** Allow/ask/deny per capability (fs/net/process), path/domain scoping, per-project sandboxes.
- **Resource controls:** Per-agent budgets for parallel tool calls, CPU/time limits; kill/timeout strategy.
- **Side-effect tagging & caching:** Mark tools `side_effects: false` to enable deterministic result caching.

# Observability & DX

- **Structured logs & metrics:** End-to-end traces of tool calls (host ↔ adapter ↔ upstream), audit logs for wallet actions.
- **Error taxonomy:** Normalized `{code, short, detail, upstream}` for model-friendly reasoning and safe retries.
- **Test harness:** Golden I/O tests for adapters/transforms; `doctor`/healthcheck for env and runtime readiness.
- **Developer UX commands:** `add/install`, `serve`, `test`, `doctor`; interactive policy prompts at install.

# Multi-Agent Hygiene & Context Discipline

- **Per-agent tool scoping:** Don’t dump the full registry; expose only what each agent needs.
- **Minimal context pollution:** Keep orchestration inside adapters; expose concise, high-level tools to the LLM.

If you want, I can turn this into a one-page “spec sheet” with example manifests and a reference `wallet.execute` schema you can drop in.
