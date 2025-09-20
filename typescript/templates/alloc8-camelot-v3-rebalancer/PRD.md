# PRD: Camelot v3 LP Rebalancing Agent

## 1. Summary & Goals

We are building an **automated LP rebalancing agent** for Camelot v3 concentrated liquidity pools. The agent will:

* Dynamically adjust liquidity ranges using a quantitative algorithm.
* Support both **Active Mode (auto-execution)** and **Passive Mode (alert-only)**.
* Be reusable as a **Vibekit template agent** (typescript/templates/alloc8-camelot-v3-rebalancer).
* Demonstrate **MCP tool integration** and **A2A Tasks** for real-world DeFi automation.

**Key Goal:** Provide a working example of how Vibekit + A2A can automate LP strategies for DeFi users.

---

## 2. Features

* Supports Camelot v3 concentrated liquidity pools.
* **User-selectable risk profiles** (low, medium, high).
* Fetches live pool data & token prices via MCP tools.
* Calculates optimal ranges using a quantitative strategy.
* Monitors positions for drift/volatility triggers.
* **Modes of operation:**

  * **Passive Mode (A2A Task)** → Evaluate & notify user (Telegram).
  * **Active Mode (A2A Task)** → Evaluate, then withdraw + rebalance automatically on-chain.
* **Configurable check interval (default: 1 hour)**.
* Logs APR, fees, and rebalance history for analysis.

---

## 3. Non-Goals

* No complex ML models in v1 (only rule-based quant strategy).
* No multi-chain support in v1 (limited to Arbitrum/Camelot v3).

---

## 4. Architecture Overview

### 4.1 High-Level Flow

```
[Agent Init]  
   → Load Config (env + user configs)  
   → Connect to MCP tools  
   → Create A2A Task (ActiveModeTask or PassiveModeTask)  
   → Every 1h:  
       - getWalletLiquidityPositions  
       - getLiquidityPools  
       - getTokenMarketData  
       - Run strategy → Calculate optimal range  
       - IF Passive → Send alert (Telegram)  
       - IF Active → withdrawLiquidity → swapTokens (if needed) → supplyLiquidity  
       - Log results (APR, fees, rebalance history)
```

### 4.2 Core Components

1. **Agent Entry (Vibekit Template)**

   * Located under `typescript/templates/alloc8-camelot-v3-rebalancer`.
   * Loads config and starts correct A2A task.

2. **A2A Tasks**

   * **PassiveModeTask**

     * Runs evaluation logic.
     * Sends results (rebalance suggestion) via Telegram.
   * **ActiveModeTask**

     * Runs evaluation logic.
     * Executes on-chain rebalance using MCP tools with wallet signing.

3. **MCP Tool Integrations**

   * `getWalletLiquidityPositions` → check LPs.
   * `getLiquidityPools` → fetch pool state.
   * `getTokenMarketData` → live prices.
   * `withdrawLiquidity` → close positions.
   * `supplyLiquidity` → open new positions.
   * `swapTokens` → balance ratio if required.
   * `getWalletBalances` → check token availability.

4. **Config Management**

   * Risk profiles (low/med/high).
   * Mode (active/passive).
   * Pool ID / Tokens.
   * Wallet private key (via `.env`).
   * Telegram bot token + chat ID.
   * Check interval (default 1h).
   * Stored in a JSON config file or persisted via A2A Tasks (future extension).

5. **Wallet & Security**

   * v1: Agent signs transactions using user-supplied private key from `.env`.
   * Future: Support smart contract wallet / MPC for improved security.

6. **Notifications**

   * Telegram bot integration.
   * Alerts include:

     * Mode (Passive/Active).
     * Suggested/Executed rebalance range.
     * Estimated APR impact.
     * Tx hash (for Active Mode).

---

## 5. A2A Task Design

### 5.1 Task Purpose

* **PassiveModeTask** → Monitors liquidity, evaluates ranges, sends Telegram alert if rebalance is suggested.
* **ActiveModeTask** → Same as Passive, but also executes on-chain transactions (withdraw, swap, supply).

### 5.2 Task Creation Flow

1. Agent loads config (mode, pool ID, risk profile, wallet key, etc.).
2. Based on `mode` → instantiate `PassiveModeTask` or `ActiveModeTask`.
3. Register with A2A runtime.
4. Task runs in a loop at configured interval (default 1h).

### 5.3 Example Implementation (Skeleton)

```ts
import { Task } from "@a2a/sdk";
import { fetchAndEvaluate } from "./strategy";
import { sendTelegram } from "./notify";
import { withdrawLiquidity, supplyLiquidity, swapTokens } from "./mcp";

export class PassiveModeTask extends Task {
  async run() {
    const result = await fetchAndEvaluate();
    if (result.needsRebalance) {
      await sendTelegram(`Rebalance suggested: ${result.newRange}`);
    }
  }
}

export class ActiveModeTask extends Task {
  async run() {
    const result = await fetchAndEvaluate();
    if (result.needsRebalance) {
      await withdrawLiquidity(result.currentPos);
      if (result.needsSwap) await swapTokens(result.swapDetails);
      const txHash = await supplyLiquidity(result.newRange);

      await sendTelegram(
        `Rebalanced: ${result.newRange}, Tx: ${txHash}`
      );
    }
  }
}
```

### 5.4 Scheduling

```ts
async function startTask(task: Task, intervalMs: number = 3600000) {
  while (true) {
    await task.run();
    await new Promise(r => setTimeout(r, intervalMs)); // default 1h
  }
}
```

---

## 6. Detailed Workflow

### Initialization

* Load configs from JSON + `.env`.
* Connect to MCP server.
* Instantiate Telegram client.
* Create correct A2A task.
* Start 1h loop.

### Evaluation Loop

1. Fetch Data (`getWalletLiquidityPositions`, `getLiquidityPools`, `getTokenMarketData`).
2. Analyze + calculate optimal range based on risk profile.
3. If rebalance needed →

   * Passive → Telegram notify.
   * Active → Withdraw + Swap + Supply + Telegram confirm.
4. Log actions & APR impact.

---

## 7. Example Use Case

* User config: **ETH/USDC pool**, **medium risk**, **Passive Mode**.
* At 12:00 → pool drift detected.
* Passive → Telegram: *“Rebalance suggested: New range \[1850–1950 USDC]. Est. APR +2.1%.”*
* If in Active Mode → agent executes withdraw + mint, then sends: *“Rebalanced. Tx Hash: 0xabc123. New range \[1850–1950 USDC].”*

---

## 8. Technical Stack

* **Language:** TypeScript
* **Framework:** Vibekit + A2A SDK
* **MCP Tools:** Provided liquidity/price/execution functions
* **Notification:** Telegram Bot API
* **Persistence:** JSON config (v1), extendable to A2A task persistence
* **Security:** Wallet private key in `.env`

---