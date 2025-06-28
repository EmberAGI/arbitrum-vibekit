# Compound V3 MCP Tool

This tool is part of the Arbitrum VibeKit and enables testing and interacting with the Compound Finance V3 on an Arbitrum-compatible network. It is built with flexibility in mind — you can run it on a **local fork**, **testnet**, or **mainnet**, depending on your `.env` settings.

> ⚠️ **Important:** This tool defaults to a **local fork of Arbitrum** for development/testing. You can configure it for live networks by updating the `.env` file. Sample credentials provided are **publicly known** and **not safe for mainnet usage**.

---

##  Environment Setup

1. **Copy the environment config**

While inside compound-v3-mcp directory:

```bash
cp .env.example .env
```

This creates your local `.env` file with default settings for the local fork. You can modify it to target testnet or mainnet by changing the RPC URLs, private keys, token addresses, etc.

> 🔐 **Warning:** The default `.env` values are for development only. Do **not** use them in production or with real funds.

---

##  Quickstart

### 1. Start Local Hardhat Node

```bash
cd typescript/lib/mcp-tools/compound-v3-mcp/arbitrum-fork
pnpm hardhat node
```

---

### 2. Fund Your Local Wallet

In another terminal, still in the `arbitrum-fork` directory:

```bash
TOKEN=WBTC AMOUNT=0.9 pnpm exec hardhat run scripts/fund.js --network localhost
```

This simulates funding your wallet with `0.9 WBTC` on the local fork.

---

### 3. Start the MCP Server

In a new terminal:

```bash
cd typescript/lib/mcp-tools/compound-v3-mcp
pnpm dev
```

---

### 4. Open the MCP Inspector

Choose either of these:

```bash
# Option A: From repo root
pnpm -F @arbitrum-vibekit/compound-v3-mcp inspect:npx

# Option B: From MCP tool directory
cd typescript/lib/mcp-tools/compound-v3-mcp
pnpm inspect:npx
```

This opens the Inspector in your browser.

> 🔐 Copy the **Proxy Session Token** printed in your terminal and paste it into the Inspector’s **Configuration → Proxy Session Token** field.

---

##  Sample Workflow (Local Fork)

The following steps simulate a complete flow: **supply collateral → borrow → repay**.

All values here are based on the assumption that 1 WBTC ≈ $60,000 (mocked value in local fork). You can change the asset amounts to reflect different test cases or asset prices.

---

###  1. Supply Collateral

In the **Inspector**, under **Supply**, input:

```
Asset: WBTC
Amount: 0.3
```

This supplies `0.3 WBTC`  to Compound V3 as collateral.

---

###  2. Borrow USDC

In the **Borrow** section, input:

```
Asset: USDC
Amount (atomic): 15000000
```

This borrows **15,000 USDC** (in atomic units — USDC has 6 decimals).
The borrow is safely within your available collateral range.

---

### 3. Repay Loan

To repay the 15,000 USDC loan, input:

```
Asset: USDC
Amount: 15000
```

This repays the full loan. Optionally add a small buffer (e.g., `15000.01`) to account for interest dust.

---

###  4. Refresh State

After each operation, always click:

```
"Get Market Data"
```

This updates your view of your current borrow balance, collateral, utilization, etc.

---

##  Notes & Tips

* **USDC atomic value** = amount × 1,000,000
* **WBTC atomic value** = amount × 100,000,000
* Small residual debt (e.g., `0.000001 USDC`) may occur due to rounding/interest; repay slightly more to clear.
* You can adjust the `.env` file to point to testnets or mainnet using your own RPCs and keys.
* The `scripts/fund.js` can be modified to support more tokens or amounts.

---

## ⚠️ Security Notice

* The `.env.example` file contains **test credentials** — including private keys and addresses that are **publicly known**.
* **Do not** use these values on mainnet or with real funds.
* Always replace with your own secrets in secure environments.

---

##  Need Help?

If you’re stuck or seeing unexpected values:

* Double-check all terminals are using the **same network** (e.g., `localhost`)
* Ensure the **MCP server** is running (`pnpm dev`)
* Always refresh **market data** in the Inspector after each step
