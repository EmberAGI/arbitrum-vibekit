# **Lesson 15: Monetization with x402 (Legacy)**

---

### 🔍 Overview

Some tools or services your agent provides may be worth charging for—either with flat fees or as a percentage of something like a swap amount. The framework uses the emerging **x402** protocol to make this simple and compatible with major LLM and agent ecosystems.

x402 allows any tool call to require payment before continuing. The protocol is transparent, LLM-friendly, and works cleanly with retries and signatures.

---

### 💰 The withPaywall Decorator

To require payment for a tool, wrap it in `withPaywall()`:

```ts
import { withPaywall } from "arbitrum-vibekit/paywall";
import { someTool } from "./someTool";

export default withPaywall(someTool, { flat: 0.05 }); // $0.05 USD
```

You can also charge a percentage:

```ts
export default withPaywall(someTool, { pct: 0.01 }); // 1% of amountUsd
```

This ensures the tool doesn’t run unless the request includes a valid x402 payment header.

---

### ⛔ If Payment is Missing

If a user calls a paywalled tool without payment:

- The decorator throws an `AgentError` with code `PaymentRequired`
- The response includes an `x-paylink` header with a payment link
- The caller can pay, then retry with `x402-paid: true`

This model supports:

- Human confirmation flows ("Sign to continue")
- Agent-to-agent delegation with cost forwarding
- Full retry semantics

---

### 💳 How Fees Are Calculated

The decorator uses these fields from `ctx.args`:

- `amountUsd`: used for percentage calculations
- Optional custom logic can be inserted by wrapping `withPaywall` in another function

---

### 🚫 What Not to Do

- Don’t charge users without transparency
- Don’t hard-code logic when you could reuse the decorator
- Don’t forget to test both unpaid and paid flows

---

### ✅ Summary

x402 lets you charge for value in a composable, agent-friendly way. Use `withPaywall()` to wrap tools and let the protocol handle payment enforcement.

> "You don’t need a business model for every tool. Just the ones that deliver value."

| Decision                              | Rationale                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **`withPaywall()` decorator**         | Guarantees payment check occurs before any hooks/logic; tool authors can’t accidentally skip the fee.     |
| **Flat or % fee signature**           | Fits most SaaS or swap-style pricing without bloating API surface.                                        |
| **Returns `402` + `x-paylink`**       | Aligns with emerging industry standard; LLMs or agents know immediately how to settle and retry.          |
| **Fee computed from `amountUsd` arg** | Keeps business maths outside decorator, yet lets decorator remain generic; encourages clear param naming. |
