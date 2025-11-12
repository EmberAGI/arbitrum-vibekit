---
title: "Error Handling and Resilience"
category: "intermediate"
difficulty: "intermediate"
duration: "15 minutes"
prerequisites: ["lesson-08"]
next_lesson: "lesson-10"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["error-handling","resilience","reliability"]
---

# **Lesson 9: How Tool Hooks Work (`before` and `after`)**

---

### 🔍 Overview

Tool hooks are optional functions you can define to run logic immediately **before** or **after** a tool’s main implementation (`impl`). They let you customize behavior without cluttering your business logic. Hooks apply whenever the agent invokes a tool—whether that invocation originates from an MCP request or as part of handling an A2A Task.

Each hook receives the same context object as the tool’s `impl`, giving it access to validated inputs, internal state, metadata, and return values—depending on hook type.

---

### 🌐 Hook Locations

Hooks live next to the tool and are exported from the same file.

```ts
export const before = (ctx) => {
  ctx.args.symbol = ctx.args.symbol.toUpperCase();
};

export const after = (ctx) => {
  logToolCall(ctx.tool, ctx.args, ctx.result);
};
```

You can export one or both. If neither is present, the tool behaves normally.

---

### 🔠 What Hooks Can Do

**Before Hook**:

- Normalize or coerce input values
- Validate conditions or deny access
- Load data into `ctx.meta` for later use
- Trigger early returns (abort with error)

**After Hook**:

- Log or trace the result
- Cache the response
- Modify output (e.g. redact fields)
- Update task or global state

Hooks have full access to:

- `ctx.args` (input)
- `ctx.meta` (shared across hooks/tool)
- `ctx.result` (after only)
- `ctx.taskId`, `ctx.getTaskState()`, `ctx.setTaskState()`

---

### ⚠️ When Not to Use Hooks

Hooks are powerful, but you should avoid them for:

- Core logic (that belongs in `impl`)
- Anything you expect to unit test independently
- Using hooks to perform input validation that belongs in the tool’s schema (e.g., Zod or JSON Schema), rather than manual checks in `before()`

  _Explanation:_ Input validation should be declared in the tool’s schema so the framework can provide automatic error handling, type inference, and clear documentation. Use hooks only for supplemental checks, not as a substitute for schema validation.

Use hooks to extend behavior—not replace structure.

---

### ✅ Summary

Hooks let you wrap tool logic with flexible pre/post behavior. They help with normalization, logging, validation, and light orchestration—but shouldn’t be abused to replace clean function structure.

> "Hooks are scaffolding, not the foundation. Use them to shape behavior—not to carry the building."

> 📝 **Note on Design**
> We chose **hooks** instead of middleware to support clean, transparent tool customization:
>
> • **File-local proximity** – Hooks live right beside each tool, so their effects are easy to see and maintain.
> • **Implicit structure** – Hooks always run in a defined order: `before` → `impl` → `after`, with no need for `next()` calls or global chaining.
> • **Typed and focused** – Hooks operate on a validated `ctx` object, reducing boilerplate and improving safety.
>
> Middleware could have achieved similar effects, but hooks keep behavior more modular, visible, and per-tool. They offer the simplest way to wrap logic without introducing system-wide coupling or ambiguity.

| Decision                     | Rationale                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **File-local hooks**         | Hooks live next to each tool file, making their effects discoverable in one place—no hunting through global registration or middleware chains.       |
| **Implicit execution order** | Guarantees `before → impl → after` without explicit `next()` calls, avoiding common Express middleware mistakes and making control flow predictable. |
| **Typed `ctx` object**       | Hooks operate on a schema-validated context, not raw `req`/`res`, reducing boilerplate and preventing type mismatches.                               |
| **Decorator compatibility**  | Heavy cross-cutting concerns (e.g., paywall, rate-limit) stay in decorators outside the hook pipeline, preserving separation of responsibilities.    |
