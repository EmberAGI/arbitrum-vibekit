## EmberAI Overview

- Ember is a powerful MCP (Model Context Protocol) server that enables AI agents to interact with DeFi protocols or on-chain services without requiring custom implementations.

- Ember features simple, well-documented interfaces that empower LLMs to dynamically select and compose tools.

- Ember's MCP-powered connectivity establishes a declarative DeFi layer, which not only enables AI agents to interpret and execute user intents but also offers developers a unified interface to the entire DeFi ecosystem.

- Ember serves as a one-stop solution for managing and executing complex DeFi operations across various chains. Developers can use Ember's rich market data to create custom DeFi strategies.

## Prerequisites

**1. Node.js ≥22**

**2. pnpm**

**3. TypeScript** (configured in the `tsconfig.json` file)

## Quickstart

1. Clone the Vibekit repository and navigate to the `emberai-mcp` folder.

   ```bash
   git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
   cd arbitrum-vibekit/typescript/lib/mcp-tools/emberai-mcp

   ```

2. Install dependencies and build the project:

   ```
   pnpm install &&
   pnpm build
   ```

3. Start the MCP server:

   ```bash
   pnpm start
   ```

Clients can now connect via STDIO transport to invoke the MCP tools.

## Available Tools

Below is a comprehensive list of MCP tools offered by Ember. For more details on Ember's capabilities, visit the [official documentation page](https://docs.emberai.xyz/).

### 1. swapTokens:

Facilitates the exchange of one cryptocurrency for another across various decentralized exchanges (DEXs).

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

Enables users to take out loans from various DeFi lending protocols by supplying collateral.

**Parameters:**

- tokenAddress (string): Contract address of the token to borrow.

- tokenChainId (string): Chain ID where the token resides.

- amount (string): Amount to borrow (in precise, non-human readable format).

- userAddress (string): Wallet address initiating the borrow.​

**Return Value:**

An array of transaction objects representing the borrow operation.​

---

### 3.repay:

Allows users to pay back outstanding loans on DeFi lending protocols.

**Parameters:**

- tokenAddress (string): Contract address of the token to repay.

- tokenChainId (string): Chain ID where the token resides.

- amount (string): Amount to repay (in precise, non-human readable format).

- userAddress (string): Wallet address initiating the repayment.​

**Return Value:**

An array of transaction objects representing the repayment operation.​

---

### 4. supply:

Enables users to deposit assets into DeFi lending protocols to earn interest or to serve as collateral for borrowing.

**Parameters:**

- tokenAddress (string): Contract address of the token to supply.

- tokenChainId (string): Chain ID where the token resides.

- amount (string): Amount to supply (in precise, non-human readable format).

- userAddress (string): Wallet address supplying the tokens.​

**Return Value:**

An array of transaction objects representing the supply operation.​

---

### 5. withdraw:

Allows users to retrieve assets they have previously deposited into DeFi lending protocols, including any accrued interest or unlocking collateral.

**Parameters:**

- tokenAddress (string): Contract address of the token to withdraw.

- tokenChainId (string): Chain ID where the token resides.

- amount (string): Amount to withdraw (in precise, non-human readable format).

- userAddress (string): Wallet address initiating the withdrawal.​

**Return Value:**

An array of transaction objects representing the withdrawal operation.​

---

### 6. getCapabilities:

Retrieves a detailed list of functionalities and services supported by the Ember MCP server. This can include supported chains, protocols, and specific actions the server can perform.

**Parameters:**

- type (enum of CapabilityType): Specifies the type of capabilities to retrieve.​

**Return Value:**

An object detailing the capabilities supported by Ember's MCP server.​

---

### 7. getUserPositions:

Fetches a comprehensive overview of a user's holdings and investments across various DeFi protocols and assets, including token balances, supplied/borrowed amounts, and liquidity pool shares.

**Parameters:**

- userAddress (string): Wallet address to fetch positions for.​

**Return Value:**

An object containing the user's wallet positions across various tokens and protocols.​

---

### 8. getTokens:

Retrieves a list of tradable tokens supported by Ember, with options to filter by chain ID or other criteria.

**Parameters:**

- chainId (string, optional): Chain ID to filter tokens.

- filter (string, optional): Additional filter criteria for tokens.​

**Return Value:**

An array of token objects matching the specified criteria.

---

### 9. supplyLiquidity:

Enables users to deposit a pair of tokens into a liquidity pool on a decentralized exchange (DEX), facilitating trading and earning fees.

**Parameters:**

- token0Address (string): Contract address of the first token in the pair.
- token0ChainId (string): Chain ID where the token0 contract resides.
- token1Address (string): Contract address of the second token in the pair.
- token1ChainId (string): Chain ID where the token1 contract resides.
- amount0 (string): Amount of token0 to supply.
- amount1 (string): Amount of token1 to supply.
- priceFrom (string): Lower bound price for the liquidity range.
- priceTo (string): Upper bound price for the liquidity range.
- userAddress (string): Wallet address supplying the liquidity.

**Return Value:**

An array of transaction objects representing the supply operation.

---

### 10. withdrawLiquidity:

Allows users to remove their supplied tokens from a liquidity pool on a DEX, retrieving their share of the pool's assets and any accrued fees.

**Parameters:**

- tokenId (string): NFT token ID representing the liquidity position to withdraw.
- providerId (string): ID of the liquidity provider protocol.
- userAddress (string): Wallet address withdrawing the liquidity.

**Return Value:**

An array of transaction objects representing the withdrawal operation.

---

### 11. getLiquidityPools:

Retrieves information about available liquidity pools across various DEXs, including details on token pairs, current liquidity, and fee structures.

**Return Value:**

An object containing the available liquidity pools.

---

### 12. getUserLiquidityPositions:

Fetches details of a user's specific investments in liquidity pools, including the amount of tokens supplied, the share of the pool, and unrealized gains or losses.

**Parameters:**

- userAddress (string): Wallet address to fetch liquidity positions for.

**Return Value:**

An object containing the user's liquidity positions.

---

### 13. getYieldMarkets:

Retrieves information about available yield-generating opportunities across various DeFi protocols. This can include details on staking, lending, and liquidity mining, along with their potential returns and associated risks.

**Return Value:**

An object containing yield market information.

## Chains and Protocols

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

---

### 2. Token Swaps

Enables users to exchange one token for another at determined rates. Key features include:

- Direct token exchanges
- Cross-chain swaps
- Access to 7,785 tradeable tokens

#### Supported Chains:

Ember supports swaps across 200+ chains, including:

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

---

### 3. Liquidity Provision & Management

Ember facilitates participation in decentralized exchange (DEX) liquidity pools, a cornerstone of automated market makers (AMMs). Users can contribute assets to these pools to enable trading for others and, in return, earn a share of the transaction fees. Ember provides tools to manage these activities comprehensively. Key actions include:

- Supply assets to liquidity pools
- Withdraw assets from liquidity pools
- Discover available liquidity pools
- Track liquidity positions
