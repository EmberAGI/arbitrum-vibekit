# **Lesson 11: Global State and Why It Matters (Legacy)**

---

### 🔍 Overview

Some agents need memory. They may need to track user preferences, conversation history, shared caches, counters, or long-running workflow status.

That’s where **global state** comes in. It provides a centralized, mutable store that tools, hooks, and tasks can all read from or write to. State is optional—many tools will remain stateless—but when you need it, it's easy to access and safely update.

---

### 🌀 How State Works

The global state object is created once using `createGlobalStore()` from `arbitrum-vibekit`. It uses **Immer** under the hood, so you can write code that looks imperative, but still updates immutably.

```ts
import { store, update } from "arbitrum-vibekit/state";

update((draft) => {
  draft.userCache[ctx.userId] = { seenSymbols: ["ETH", "USDC"] };
});

const seen = store.userCache[ctx.userId]?.seenSymbols;
```

All updates go through the `update()` function, which guarantees consistency and lets you subscribe to changes if needed.

---

### 🚫 What Not to Store

Avoid storing:

- Per-request data (that should live in `ctx.meta`)
- Large documents (use external persistence if needed)
- Sensitive tokens or secrets (use environment vars)

State should hold **shared, evolving context** that's cheap to keep in memory and safe to replicate.

---

### 📖 Reserved Slices

Some parts of global state are used by the framework to manage LLM interaction and system-level behavior:

- `llm.meta`: internal coordination and system prompt overrides (not included in prompt context)
- `llm.ctx`: **user-defined prompt context** passed into the LLM
- `metrics`: call counters and usage analytics

#### LLM Context vs Internal State

- Use `llm.ctx` to pass **select values into the LLM's prompt**—e.g. user roles, preferences, or constraints.
- Use the rest of global state (like `userCache`, `threadData`) for **agent-side memory**—things the LLM shouldn't or doesn’t need to see.

This separation keeps your prompts lean and relevant, while letting your agent maintain rich internal context across time.

> Only include what the LLM needs to reason about. Leave the rest for the agent.

---

### ✅ Summary

- Global state is optional but powerful
- You can read from `store` or write via `update()`
- Immer lets you mutate safely and ergonomically
- Avoid using global state as a dumping ground—treat it like a shared memory map

> "Stateless tools run fast. Stateful tools run deep."

| Decision                                               | Rationale                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Immer via `update()`**                               | Empowers junior developers to write “mutable” code that remains immutable under the hood, supporting time-travel and safe concurrency.                        |
| **Reserved slices (`llm.meta`, `llm.ctx`, `metrics`)** | Separates system prompts (`llm.meta`) from user-shown prompt context (`llm.ctx`) and metric counters, preventing accidental context bloat or name collisions. |
| **Clear read vs write APIs**                           | Enforces reading from `store` and writing via `update()`, avoiding direct mutations and ensuring state changes are logged and traceable.                      |
| **Task vs Global state boundary**                      | Guards against misuse: per-call or per-task data stays in task state, while global state holds shared, long-lived context.                                    |
| **Prompt hygiene reminder**                            | Explicitly warns to include only necessary data in `llm.ctx`, preserving token budget and model performance.                                                  |
