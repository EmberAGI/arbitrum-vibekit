## **Introduction**

Ember Onchain Actions is a powerful MCP server that enables AI agents to interact with any DeFi protocol or crypto provider without custom implementations. It can act as a one-stop solution for managing and executing complex DeFi operations on various chains. Developers can harness Ember’s rich intent-based action infrastructure in combination with Vibekit's market data, social signals, and event infrastructure to create custom DeFi strategies.

- **Built for LLMs:** Simple, well-documented interfaces that let agents dynamically select and compose tools.

- **MCP-Powered Connectivity:** A declarative DeFi layer designed to enable AI agents to interpret and execute user intents which allows developers to interact with the entire DeFi ecosystem through a unified interface.

- **Action-as-a-Service:** Instant access via wallet authentication, with pay-as-you-go pricing and flat-rate crypto payments.

## **Prerequisites**

- **Node.js ≥22**

- **pnpm**

- **TypeScript** (configured in the `tsconfig.json` file)

## **Quickstart**

1. Clone the Vibekit repository and navigate to the `emberai-mcp` folder.

   ```bash
   git clone https://github.com/EmberAGI/arbitrum-vibekit.git
   cd arbitrum-vibekit/typescript/lib/mcp-tools/emberai-mcp

   ```

2. Install dependencies and build the project:

   ```
   pnpm install
   pnpm run build
   ```

3. Start the MCP server:

   ```bash
   pnpm start
   ```

Clients can now connect via STDIO transport to invoke the MCP tools.

## **Available Tools**

Below is a list of MCP tools offered by EmberAI. For more details on Ember's capabilities, visit the [official documentation page](https://docs.emberai.xyz/).

### 1. swapTokens:

Swaps one token for another using Ember's MCP server.​

**Parameters:**

- fromTokenAddress (string): Contract address of the token to swap from.

- fromTokenChainId (string): Chain ID where the fromToken resides.

- toTokenAddress (string): Contract address of the token to swap to.

- toTokenChainId (string): Chain ID where the toToken resides.

- amount (string): Amount of fromToken to swap (in precise, non-human readable format).

- userAddress (string): Wallet address initiating the swap.​

**Return Value:**

An array of transaction objects representing the swap operation.​

---

### 2. borrow:

Borrow tokens from lending protocols.

**Parameters:**

- tokenAddress (string): Contract address of the token to borrow.

- tokenChainId (string): Chain ID where the token resides.

- amount (string): Amount to borrow (in precise, non-human readable format).

- userAddress (string): Wallet address initiating the borrow.​

**Return Value:**

An array of transaction objects representing the borrow operation.​

---

### 3.repay:

Repay borrowed tokens.

**Parameters:**

- tokenAddress (string): Contract address of the token to repay.

- tokenChainId (string): Chain ID where the token resides.

- amount (string): Amount to repay (in precise, non-human readable format).

- userAddress (string): Wallet address initiating the repayment.​

**Return Value:**

An array of transaction objects representing the repayment operation.​

---

### 4. supply:

Supply tokens to lending protocols.

**Parameters:**

- tokenAddress (string): Contract address of the token to supply.

- tokenChainId (string): Chain ID where the token resides.

- amount (string): Amount to supply (in precise, non-human readable format).

- userAddress (string): Wallet address supplying the tokens.​

**Return Value:**

An array of transaction objects representing the supply operation.​

---

### 5. withdraw:

Withdraw previously supplied tokens.

**Parameters:**

- tokenAddress (string): Contract address of the token to withdraw.

- tokenChainId (string): Chain ID where the token resides.

- amount (string): Amount to withdraw (in precise, non-human readable format).

- userAddress (string): Wallet address initiating the withdrawal.​

**Return Value:**

An array of transaction objects representing the withdrawal operation.​

---

### 6. getCapabilities:

Get Ember's capabilities.

**Parameters:**

- type (enum of CapabilityType): Specifies the type of capabilities to retrieve.​

**Return Value:**

An object detailing the capabilities supported by Ember's MCP server.​

---

### 7. getUserPositions:

Get user wallet positions.

**Parameters:**

- userAddress (string): Wallet address to fetch positions for.​

**Return Value:**

An object containing the user's wallet positions across various tokens and protocols.​

---

### 8. getTokens:

Get a list of supported tokens.

**Parameters:**

chainId (string, optional): Chain ID to filter tokens.

filter (string, optional): Additional filter criteria for tokens.​

**Return Value:**

An array of token objects matching the specified criteria.

## **Chains and Protocols**

### 1. Lending and Borrowing

Users can supply tokens as collateral to borrow other assets or lend them out to earn interest. Key actions include:

- Supply tokens to earn yield
- Use supplied tokens as collateral
- Borrow tokens against their collateral
- Repay borrowed positions
- Withdraw previously supplied tokens

#### Supported Chains:

- Arbitrum (`42161`)
- Base (`8453`)
- Optimism (`10`)
- Polygon (`137`)
- Ethereum Mainnet (`1`)

### 2. Token Swaps

Enables users to exchange one token for another at determined rates. Key features include:

- Direct token exchanges
- Cross-chain swaps
- Access to 7,785 tradeable tokens

#### Supported Chains: Ember supports swaps across 200+ chains, including:

#### Major EVM Networks

1. Ethereum Mainnet (`1`)
2. Arbitrum (`42161`)
3. Base (`8453`)
4. Optimism (`10`)
5. Polygon (`137`)
6. BSC (`56`)
7. Avalanche (`43114`)
8. Fantom (`250`)
9. Linea (`59144`)
10. Manta (`169`)
11. Mantle (`5000`)
12. Scroll (`534352`)
13. ZkSync Era (`324`)
14. Polygon zkEVM (`1101`)

#### Non-EVM Networks

1. Solana (`1399811149`)
2. Sui (`1002`)
3. Tron (`728126428`)

#### Cosmos Ecosystem

1. Cosmos (`1003`)
2. Osmosis (`1001`)
3. Injective (`1004`)
4. Kava (`1005`)
5. ThorChain (`1006`)
6. Sei (`713`)

#### Other Networks

1. Moonbeam (`1284`)
2. Moonriver (`1285`)
3. Neon (`245022934`)
4. ZetaChain (`7000`)
5. Zilliqa (`32769`)
6. Klaytn (`8217`)
