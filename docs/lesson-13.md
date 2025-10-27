# **Lesson 13: Error Handling**

---

### 🔍 Overview

Good agents fail gracefully. This lesson shows you how to catch, wrap, and return errors in a way that works across MCP, A2A, and HTTP. The framework provides a lightweight system for structured error handling so that failures are consistent, traceable, and LLM-friendly.

---

### ⚡ The AgentError Class

The framework includes a built-in `AgentError` class. Use it to throw consistent, typed errors that tools, hooks, and A2A handlers can interpret.

```ts
import { AgentError } from "arbitrum-vibekit/errors";

throw new AgentError("InvalidParams", "Symbol is missing", 400);
```

Arguments:

- `code`: a short string like `InvalidParams`, `NotFound`, or `UpstreamFail`
- `message`: a human-readable explanation
- `status`: HTTP-compatible status code (used for formatting responses)

---

### ✋ wrapAsync: Safe Async Tools

Most tools are `async` functions. To avoid unhandled errors, you can wrap them using `wrapAsync()`:

```ts
import { wrapAsync } from "arbitrum-vibekit/errors";

export default wrapAsync(async (ctx) => {
  const price = await fetchPrice(ctx.args.symbol);
  if (!price) throw new AgentError("NotFound", "Token not found");
  return { price };
});
```

This wrapper automatically catches thrown errors and formats them as structured responses.

---

### 🚫 What Not to Do

- Don’t throw raw `Error()` objects—always use `AgentError`
- Don’t return vague messages like “Something went wrong”
- Don’t forget to wrap `async` tools—even if they're small

---

### ✉ Built-in Middleware

The Express app automatically uses a framework-provided error handler. You don’t need to register it manually. It:

- Converts `AgentError` into clean HTTP or MCP responses
- Logs internal errors to stderr
- Ensures consistent error shape for LLMs and agents

---

### ✅ Summary

- Throw `AgentError` for clear, typed exceptions
- Wrap tools in `wrapAsync()` to avoid crashes
- Let the middleware handle response formatting

> "Failures are expected. Confusion is not."

| Decision                                  | Rationale                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **`AgentError` with `(code,msg,status)`** | Aligns with OpenAI SDK’s typed errors, so LLMs and dashboards can branch on `code` without regex on messages. |
| **`wrapAsync()` helper**                  | One-liner to guarantee async errors bubble to Express middleware; prevents unawaited Promise crashes.         |
| **Central error middleware**              | Formats HTTP, MCP, and A2A errors identically; ensures consistent JSON shape for clients and agents.          |
| **Discourage raw `Error` throws**         | Forces every failure to carry machine-readable intent; eases monitoring and automatic retries.                |
