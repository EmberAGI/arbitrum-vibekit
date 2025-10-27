Short version: when you both **change the interface** _and_ **add responsibilities**, don’t force one pattern to do everything. Use a **stack**:

- **Adapter (schema transformer)** at the boundary to normalize the MCP server’s tool schemas to _your_ client-facing contract.
- **Facade / Application Service** to expose a **single, simple tool** to the LLM (e.g., `submitTransaction`).
- **Strategy (plugins)** for pluggable `Signer` and `Sender` implementations (KMS, wallet, RPC).
- **Interceptors / Middleware (hooks)** to add cross-cuts (logging, policy, retries) without changing the Facade’s interface.
- Optionally **Bridge** if you want an Abstraction↔Implementor split that evolves independently (e.g., `TransactionService` ↔ `Backend`).

That gives you interface _translation_ (Adapter) plus added _behavior_ (Interceptors/Decorators) while keeping the LLM’s surface area tiny (Facade).

---

## Reference layout (what goes where)

```
LLM
  └── (sees ONE tool)  submitTransaction(input)
        │          ↑ same interface to caller
        │  Interceptors/Middleware (hooks: before/after/around)
        ▼
   Facade/Application Service  ←— adds orchestration responsibility (create→sign→send)
        ▼
   Schema Adapter(s)  ←— transforms MCP server tool schemas & payloads ↔ normalized types
        ▼
   MCP Server tools: createTransaction | signTransaction? | sendTransaction?
        ▼
   Plugins (Strategies): Signer, Sender (KMS, Ledger, MetaMask, RPC, etc.)
```

- **Why hooks aren’t Decorators:** your hooks are better modeled as **Interceptors/Middleware** that can observe/alter the flow. Decorator wraps a _single object_ while preserving the same interface; here you want pipeline stages across an operation.

---

## Minimal TypeScript sketch (client side)

### Example “hooks” you can drop in

You’d construct the service like:

---

## Why this satisfies your goals

- **“Interface changes”** → done by the **Schema Adapter** (anti-corruption layer) that maps the MCP server’s tool schema to your normalized `CreateTxInput` / `UnsignedTx` / `SignedTx`.
- **“Added responsibilities”** (create→sign→send orchestration, policy, retries, metrics) → done by **Facade + Interceptors** without leaking complexity to the LLM.
- **Client-owned signing** → via **Signer Strategy** plugin; you can swap Ledger, OS keychain, KMS, browser wallet, etc., without changing the LLM-visible tool.
- **Not polluting the LLM’s context** → the model only sees **one tool** (`submitTransaction`), with a compact schema; orchestration lives in code.
- **Bridge where helpful** → if you expect many backends, split `TransactionService` (Abstraction) from a `Backend` Implementor and keep adapters per backend SDK.

---

## When to choose which label (so reviewers agree)

- Call the boundary piece a **Schema Adapter** or **Anti-Corruption Layer** (DDD)—it explicitly **transforms the original interface**.
- Call the single LLM tool surface a **Facade** or **Application Service**—it **simplifies** and **orchestrates**.
- Call your pluggable sign/send components **Strategies** (and optionally compose them under a **Bridge** if both sides evolve).
- Call your “hooks” **Interceptors/Middleware**, not Decorators.

This combination is the clean, standard way to handle “interface changes + extra responsibilities” without coupling the LLM to backend quirks or leaking key material.

Totally valid. A **tightly-coupled Facade** is a great phase-1 if you want speed and a tiny surface for the LLM. The trick is to keep **seams** so you can peel middleware out later without a rewrite.

# When “just the Facade” is the right call

Choose it if most of these are true:

- 1 backend (or 1–2), policies are simple/static.
- Cross-cuts are light: basic logging, a single quota check, maybe a 1-shot retry on `send`.
- Single tenant or uniform policy; no per-tenant toggles.
- You control both sides (client + MCP server schemas) or you have a stable adapter.

Risks that push you toward middleware later:

- Per-tenant policies/quotas, selective retries, circuit-breakers, fallback RPCs.
- Auditable “deny” paths, capability gating, or idempotency requirements.
- Multiple backends with different failure modes (you’ll want stage-scoped error handling).

# How to keep it simple _and_ future-proof

Use a **Facade + Schema Adapter + Strategies**, and keep hooks read-only. Inside the Facade, compose **small internal steps** so they can be lifted to middleware later.

### Shape

- **Facade** (what the LLM sees): one tool, e.g. `submitTransaction(input)`.
- **Schema Adapter**: maps your DTOs ↔ MCP tool schemas (anti-corruption layer).
- **Strategies**: `Signer`, `Sender` (client-owned, pluggable).
- **Observers**: read-only hooks for logs/metrics (no flow control).
- **Inline steps**: tiny functions (`policy`, `idempotency`, `create`, `sign`, `send`, `retrySend`) called in a fixed order.

### Guardrails (so refactor is a 1-commit job later)

1. Keep a request `ctx` object (input, unsigned, signed, result, meta).
2. Make each step **pure-ish** and accept `(ctx) => Promise<void>`.
3. Centralize error mapping to a small `errors.ts` (same taxonomy across steps).
4. Observers get `phase` + `Readonly<ctx>`; never mutate or throw.
5. Keep the **Adapter** separate from the Facade.
6. Put policy thresholds and toggles in a config object (not hardcoded).
7. Keep step order in one array so you can swap it for a compose() later.

---

## Minimal TS Facade (no middleware, hooks are read-only)

### Why this works now—and later

- **Simple today**: one class, linear control flow, no middleware framework.
- **Hooks stay read-only**: great for telemetry; zero risk of accidental short-circuit.
- **Seams preserved**: each step is a small function; later you can:
  - replace the hard-coded call sequence with a `compose([...steps])`,
  - lift `policy`, `idempotency`, `retrySend` into true interceptors,
  - make the steps array configurable per tenant.

# Quick decision rule

- If your cross-cuts fit in **≤5 small inline steps** and don’t need per-tenant variation, keep the **tight Facade**.
- If you find yourself adding **conditionals per tenant/back-end** or need **stage-scoped** error handling (e.g., “retry send but not sign”), move those steps into **interceptors** with the same `(ctx, next)` signature you already implied here.

This gives you the simplicity you want now, plus a clean on-ramp to middleware if/when you outgrow it.
