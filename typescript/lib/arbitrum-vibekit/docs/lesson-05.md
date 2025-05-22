# **Lesson 5: The Tool Call Lifecycle**

---

### 🔍 Overview

Every time a tool is invoked in the agent framework—whether by an LLM through MCP or by another agent through A2A—it follows the same lifecycle pattern: from input validation to response emission.

Understanding this lifecycle will help you reason about how data flows through an agent, and where you can customize behavior.

---

### ⏳ Step-by-Step Lifecycle

1. **Invocation Begins**

   - The agent receives a request via MCP (from an LLM) or A2A (from another agent).
   - A new **Task** object is created with a `threadId`, even if the task is stateless.

2. **Schema Validation**

   - The tool’s input is validated using a Zod (or JSON Schema) definition.
   - If validation fails, the call is rejected with a structured error.

3. **Payment Check (optional)**

   - For tools decorated with a paywall, the framework checks for an `x402-paid` header.
   - If payment is missing, the call responds with `402 Payment Required` and an `x-paylink` header.
   - Once payment is completed, the call can be retried automatically.

4. **Before Hook (optional)**

   - The tool’s input is validated using a Zod (or JSON Schema) definition.
   - If validation fails, the call is rejected with a structured error.

5. **Before Hook (optional)**

   - Runs before your tool logic.
   - Common uses: input normalization, access checks, analytics logging, rate limiting.

6. **Tool Logic Executes**

   - The core function runs with validated arguments.
   - It may access agent state (global or task) if needed.

7. **After Hook (optional)**

   - Runs after the tool returns a result.
   - Common uses: logging, output redaction, caching, telemetry, task updates.

8. **Response Sent**

   - A final structured response is returned to the caller.
   - If the task supports streaming, updates may continue asynchronously via SSE.

---

### ⚖️ Stateless or Stateful?

- Even stateless tool calls create a `Task`, but don't store anything in the task state.
- Stateful tools read/write task state during or after execution.
- Hooks (before/after) can manipulate global state even if the tool itself is stateless.

---

### 🛠️ Developer Touchpoints

You can customize any part of the lifecycle:

- Define the **tool schema** using Zod.
- Write a `before()` or `after()` function in the same file as your tool.
- Use `getTaskState()` or `setTaskState()` in long-running workflows.
- Log custom traces or metrics in the `after()` hook.

---

### ✅ Summary

Tool calls always follow the same clear path:

- Receive input → validate → run hooks → run logic → return response

This consistent lifecycle ensures reliability, traceability, and flexibility—whether you're building simple utilities or orchestrating complex multi-agent workflows.

> "Every tool call is a conversation. The lifecycle makes sure it's heard, checked, and answered."
