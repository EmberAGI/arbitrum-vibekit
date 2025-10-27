---
title: "Performance Optimization"
category: "intermediate"
difficulty: "hard"
duration: "19 minutes"
prerequisites: ["lesson-09"]
next_lesson: "lesson-16"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["performance","optimization","scaling"]
---

# **Lesson 10: Adapting Third-Party Tools**

---

### 🔍 Overview

Not every tool your agent needs has to be written from scratch. Many core utilities—like price lookups, transaction builders, or explorer queries—already exist as third-party MCP tools. But you often need to slightly change how these tools behave:

- Translate inputs (e.g. map `symbol` to `chain/address`)
- Insert side logic (e.g. fee checks, rate limits)
- Modify the output (e.g. redact or reformat the result)

To solve this, we use **adapters**: lightweight wrappers around existing tools that let you extend, remap, or customize their behavior.

---

### 🚂 When to Use an Adapter

- You want to customize the interface of a third-party tool without forking or rewriting it
- You want to run `before`/`after` logic around a third‑party tool you don’t own (you can’t add hooks inside its file). Creating an adapter gives you a place to attach those hooks.
- You want to expose a simplified or opinionated version of an external tool to the LLM

---

### 🔧 How Adapters Work

Adapters are just tools themselves. You import the original tool, and then use the same `before`, `after`, and decorator patterns you already know:

```ts
// adapters/getTokenPrice.ts
import { getPrice } from "arbitrum-vibekit/providers/price";
import { withPaywall } from "arbitrum-vibekit/paywall";

export const before = (ctx) => {
  ctx.args = { ...ctx.args, symbol: ctx.args.symbol.toUpperCase() };
};

export default withPaywall(getPrice, { pct: 0.01 });
```

This lets you wrap behavior cleanly while keeping the underlying tool untouched.

---

### 🚪 What Not to Do

- Don’t duplicate a tool just to change one argument format
- Don’t fork third-party tools when a hook or adapter would suffice
- Don’t mix too many unrelated concerns into one adapter—compose adapters if needed

---

### ✅ Summary

Adapters let you reshape third-party tools into the exact form your agent needs. Use them to modify input, output, or intermediate behavior in a clean, modular, and testable way.

> "Don’t rewrite the wheel. Wrap it."

| Decision                              | Rationale                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Adapter = wrapper tool**            | When you don’t control a provider’s source, an adapter file lets you attach hooks/decorators without modifying upstream code.      |
| **Schema remapping in one place**     | Keeps input/output transformations (symbol→address, param renames) centralized, avoiding scattered logic across multiple tools.    |
| **Single-purpose adapters**           | Encourages focused adapter files—each does one job (mapping, validation, paywall), so they remain small, testable, and composable. |
| **Guidance on when _not_ to adapter** | Prevents over-engineering: if you control the source, use hooks directly; if no modification is needed, call the tool straight.    |
