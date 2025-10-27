# **Lesson 14: Long-Running Tasks and Loops (Legacy)**

---

### 🔍 Overview

Not every tool runs once and returns. Some workflows need to run over time: indexing a stream, polling a service, sending periodic updates, or maintaining stateful coordination across agents.

This is where **long-running tasks and loops** come in. The framework gives you simple helpers to start, track, and stop these kinds of processes using A2A and shared task state.

---

### 🔁 Looping with A2A Tasks

Loops are implemented as recurring A2A tasks. Instead of scheduling with cron or external timers, the agent can:

1. Start a loop by registering a task with `createLoopTask()`
2. Execute the task at a fixed interval
3. Use `ctx.setTaskState()` to track progress or emit events
4. Stop the loop by cancelling the task thread

```ts
import { createLoopTask } from "arbitrum-vibekit/a2a";

export default async function startHeartbeat(ctx) {
  createLoopTask("heartbeat", 10, async () => {
    ctx.setTaskState({ timestamp: Date.now() });
  });
  return { ok: true };
}
```

---

### 📦 Task State for Long Workflows

Any A2A task has a `threadId` and an optional `task state`. You can read and write it using:

```ts
const state = await ctx.getTaskState();
ctx.setTaskState({ ...state, step: "phase-2" });
```

This is useful for:

- Progress tracking
- Conversation memory
- Event coordination
- Resumable agents

---

### ⛔ What Not to Do

- Don’t use global state for per-task data
- Don’t forget to cancel loops when they’re no longer needed
- Don’t assume all tasks run forever—design them to exit cleanly

---

### ✅ Summary

Long-running tasks give agents memory, persistence, and the ability to act over time. Loops are just one example—but the real power comes from treating agents as workers that coordinate across tasks.

> "A good agent doesn’t just answer. It remembers. It returns. It evolves."

| Decision                                 | Rationale                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **`createLoopTask(threadId, interval)`** | Abstracts `setInterval` + task state wiring; avoids ad-hoc timers scattered through tools.                      |
| **Store progress in per-task state**     | Keeps memory local to the task, preventing global pollution and enabling multiple concurrent loops safely.      |
| **Use A2A streaming for heartbeat**      | Leverages built-in SSE, giving real-time feedback to UIs or coordinating agents without inventing new channels. |
| **Explicit cancel flow**                 | Encourages graceful shutdown, so loops don’t become zombie timers after agent redeploys.                        |
