# **Lesson 15: Observability and Metrics**

---

### 🔍 Overview

As agents grow more capable, it's important to know what's happening under the hood. Observability helps you debug, optimize, and monitor behavior. This lesson introduces lightweight logging, counters, and tracing that plug into tools, hooks, and state.

You can start small with in-memory counters and later integrate full tracing systems like OpenTelemetry and Grafana.

---

### 📊 Built-in Counters (State Metrics)

The global store includes a reserved slice called `metrics`. You can increment or track things like tool usage:

```ts
update((draft) => {
  draft.metrics.toolCalls ??= {};
  draft.metrics.toolCalls[ctx.tool] ??= 0;
  draft.metrics.toolCalls[ctx.tool]++;
});
```

This can be placed in a `before` hook or shared reducer.

---

### 🛠 Examples of Useful Metrics

- Total tool calls per name
- LLM request → tool call ratios
- Latency measurements (see Lesson 11 for reducers)
- Token usage (if available from provider)
- A2A task counts by `threadId`

---

### 🧪 Logs and Tracing

Each agent can emit structured logs for:

- Errors (via `AgentError`)
- Hook timing or results
- Response payloads or audit trails

You can emit logs directly or use a tracer like OpenTelemetry. Later, pipe that data to Grafana, DataDog, or your platform of choice.

---

### ⚠️ What Not to Do

- Don’t log sensitive data (user keys, raw txs)
- Don’t block execution just to collect metrics
- Don’t hard-code metric keys—use constants or helper functions

---

### ✅ Summary

Observability is how agents explain themselves. Start with lightweight metrics in global state and expand into full tracing as needed. It makes everything easier: debugging, optimization, and proving value.

> "If you can’t measure it, your agent can’t grow."

| Decision                          | Rationale                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Metrics slice in global state** | Gives zero-setup counters; juniors can `update(d=>d.metrics.calls++ )` without external DB.                  |
| **OTEL tracer stub**              | Ready path to full tracing; can swap `ConsoleSpanExporter` for OTLP without touching business code.          |
| **Structured error + trace IDs**  | Combines `AgentError` codes with span IDs, making cross-service debugging straightforward in Grafana/Jaeger. |
| **Logging guidance**              | Recommends console logs in dev and structured logs in prod; prevents accidental PII leakage by default.      |
