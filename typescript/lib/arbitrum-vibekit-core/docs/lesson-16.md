**Lesson 16: Validations and Caveats**

---

### 🔍 Overview

Some tools—especially those related to transaction execution—require more than input validation. You may want to confirm conditions like wallet ownership, session duration, token allowance, or external authorization before the tool completes.

This is where **validations and caveats** come in. Validations are runtime checks. Caveats are persisted guarantees attached to a delegation or signed session.

---

### ✅ Runtime Validations (Agent-Controlled)

These are custom checks you run in a `before()` hook or middleware. For example:

```ts
export const before = async (ctx) => {
  if (!ctx.meta.session?.isVerified) {
    throw new AgentError("SessionInvalid", "Session must be verified");
  }
};
```

Runtime validations are dynamic, per-request checks that control access to the tool logic.

---

### 🔏 Caveats (Delegation-Controlled)

Caveats are attached to a **signed delegation** using something like MetaMask's Delegation Toolkit. These are external constraints that persist with a signature:

- Token limit per session
- Tool call whitelist
- Expiry timestamps

Your agent can **enforce caveats** at runtime by verifying that the session meets all the attached requirements.

---

### 🧩 Combining Both

In most real-world cases:

- Caveats define the **outer contract** of a delegation
- Runtime validations enforce **local policy** inside the agent

This lets users delegate safely, while your agent still protects its own logic.

---

### ⚠️ What Not to Do

- Don’t rely only on client-side caveats
- Don’t hard-code validation logic—use named validators or shared helpers
- Don’t assume a signature is enough—always check context

---

### ✅ Summary

Validations are your safety net. Caveats are their signed complement. Use both to ensure your agent only executes when the environment is trusted and secure.

> "Signed intent is not enough. You must still verify context."

---

### 📚 Rationale

We took design cues from both OpenAI and MetaMask:

**From OpenAI Agent SDK:**

- Guardrails that run before any tool logic → inspired `before()` validation
- Typed, structured errors surfaced to models → became `AgentError`
- Built-in trace support → influenced our OpenTelemetry integration in Lesson 15

**From MetaMask Delegation Toolkit:**

- Signed "caveats" represent session-bound constraints (token cap, whitelist, expiry)
- Agents—not wallets—enforce those caveats at runtime
- Clear split between signature-level constraints and agent-specific validations

Together, these patterns help agents enforce multi-layered safety: signed intent from the user, local policy from the developer.. Caveats are their signed complement. Use both to ensure your agent only executes when the environment is trusted and secure.

> "Signed intent is not enough. You must still verify context."

| Decision                              | Rationale                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Two–layer security model**          | _Outer_ layer = signed MetaMask _delegations_ (caveats); _inner_ layer = runtime `before()` validations. Covers both persistent permission limits and per-call context checks. |
| **Caveat verification in `before()`** | Keeps enforcement code adjacent to business logic; avoids a separate middleware tier that could be bypassed.                                                                   |
| **Env var `AGENT_WALLET_PK`**         | Hot-wallet key is injected, not committed. Makes clear the agent’s signing key differs from user keys.                                                                         |
| **Sequence diagram in docs**          | Shows juniors exactly how delegation flows: user → wallet → agent hot-wallet → chain. Clarifies that the agent never holds the user’s private key.                             |
| **AgentError `CaveatFail`**           | Provides explicit, typed feedback when a delegation doesn’t satisfy caveats, aligning with SDK error style.                                                                    |
