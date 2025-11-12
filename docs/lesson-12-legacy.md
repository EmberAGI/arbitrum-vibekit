# **Lesson 12: Reducers and Immutable Updates (Legacy)**

---

### 🔍 Overview

The global state system uses **Immer**, which makes it easy to write updates that _look_ mutable but are actually safe and immutable under the hood. But as your agent grows, it helps to keep logic modular and predictable.

That’s where **reducers** come in. Inspired by Redux, reducers let you group related update logic into named handlers—so state changes stay readable, testable, and composable.

---

### ⚖️ When to Use a Reducer

Use a reducer when:

- A slice of state needs more than one kind of update
- You want to separate business logic from tool files
- The same updates are triggered from multiple tools or hooks

---

### 🌐 Example Reducer

```ts
// state/reducers/metrics.ts

export const metricsReducer = {
  incrementToolCall: (draft, toolName) => {
    draft.metrics.calls[toolName] ??= 0;
    draft.metrics.calls[toolName]++;
  },

  recordLatency: (draft, toolName, ms) => {
    draft.metrics.latency[toolName] = ms;
  },
};
```

Then in a hook or tool:

```ts
import { update } from "arbitrum-vibekit/state";
import { metricsReducer } from "../state/reducers/metrics";

update((draft) => {
  metricsReducer.incrementToolCall(draft, ctx.tool);
});
```

---

### 🚫 What Not to Do

- Avoid giant reducer files that mix unrelated concerns
- Don’t mutate the `store` object directly—always go through `update()`
- Don’t hard-code logic into tools if it's reused or state-specific

---

### ✅ Summary

Reducers give you modular, declarative control over how state is updated. They help clarify what changed, where, and why—without sacrificing Immer's simplicity.

> "Reducers let you name your intent. Not just change your state."

| Decision                                | Rationale                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Redux-style slice reducers**          | Groups related update functions, so state-change intent is named and reusable instead of scattered anonymous `update()` calls. |
| **Keep reducers in `/state/reducers/`** | Physically separates business updates from tool code, aiding unit testing and code-ownership boundaries.                       |
| **Immer draft passed in**               | Lets reducers write intuitive `draft.foo++` code while preserving immutability for time-travel and replay.                     |
| **Call reducers from hooks/tools**      | Encourages thin call-sites and central logic, avoiding copy-pasted `update()` blocks in multiple files.                        |
