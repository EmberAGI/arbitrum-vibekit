/**
 * Prompt mappings configuration
 * Maps MCP prompt IDs to user-friendly templates with trigger words and proper formatting
 */

export interface PromptParameterOverride {
  name: string;
  type?: 'text' | 'number' | 'email' | 'select' | 'boolean';
  placeholder?: string;
  required?: boolean;
  options?: string[];
  description?: string;
}

export interface PromptMapping {
  mcpPromptId: string; // The ID from the MCP server
  name: string; // Display name
  description: string; // User-friendly description
  triggerWords: string[]; // Words that trigger this prompt
  template: string; // Template with {parameter} placeholders
  category?: string;
  example?: string;
  parameterOverrides?: PromptParameterOverride[]; // Custom parameter configurations
}

/**
 * Prompt mappings for EmberAI MCP server
 * Add new mappings here as prompts are added to the MCP server
 */
export const promptMappings: PromptMapping[] = [
  {
    mcpPromptId: 'swapTokens',
    name: 'Swap Tokens',
    description:
      'Swap tokens between different blockchains with intelligent routing and optimal exchange rates. Supports major tokens across multiple chains with customizable slippage protection.',
    triggerWords: ['swap', 'exchange', 'trade'],
    template:
      'Swap {amount} {fromToken} to {toToken} from {fromChain} to {toChain} with {amountType} using wallet {walletAddress}',
    category: 'Trading',
    example: 'swap 100 USDC to ETH from ethereum to arbitrum with exactIn using wallet 0x123...',
    parameterOverrides: [
      {
        name: 'amount',
        type: 'number',
        placeholder: 'Amount (e.g., 100)',
        required: true,
        description: 'The amount of tokens to swap',
      },
      {
        name: 'fromToken',
        type: 'text',
        placeholder: 'From token symbol (e.g., USDC)',
        required: true,
        description: 'Source token symbol',
      },
      {
        name: 'toToken',
        type: 'text',
        placeholder: 'To token symbol (e.g., ETH)',
        required: true,
        description: 'Destination token symbol',
      },
      {
        name: 'fromChain',
        type: 'text',
        placeholder: 'From chain (e.g., ethereum)',
        required: true,
        description: 'Source blockchain',
      },
      {
        name: 'toChain',
        type: 'text',
        placeholder: 'To chain (e.g., arbitrum)',
        required: true,
        description: 'Destination blockchain',
      },
      {
        name: 'amountType',
        type: 'select',
        placeholder: 'Select amount type',
        required: true,
        options: ['exactIn', 'exactOut'],
        description: 'exactIn = exact amount to spend, exactOut = exact amount to receive',
      },
      {
        name: 'walletAddress',
        type: 'text',
        placeholder: 'Wallet address (0x...)',
        required: true,
        description: 'Your wallet address',
      },
    ],
  },
  {
    mcpPromptId: 'perpetualLongPosition',
    name: 'Open Long Position',
    description:
      'Enter a leveraged long position in perpetual futures markets. Profit from upward price movements with customizable leverage up to 100x on supported assets like ETH, BTC, and major altcoins.',
    triggerWords: ['long', 'perpetual', 'leverage'],
    template:
      'Open long position on {market} using {payToken} as payment and {collateralToken} as collateral on {chain} with wallet {walletAddress}',
    category: 'Perpetuals',
    example:
      'long ETH-USD using USDC as payment and USDC as collateral on arbitrum with wallet 0x123...',
  },
  {
    mcpPromptId: 'perpetualShortPosition',
    name: 'Open Short Position',
    description:
      'Enter a leveraged short position in perpetual futures markets. Profit from downward price movements with customizable leverage up to 100x on supported assets.',
    triggerWords: ['short', 'perpetual', 'sell'],
    template:
      'Open short position on {market} using {payToken} as payment and {collateralToken} as collateral on {chain} with wallet {walletAddress}',
    category: 'Perpetuals',
    example:
      'short BTC-USD using USDC as payment and USDC as collateral on arbitrum with wallet 0x123...',
  },
  {
    mcpPromptId: 'lendToken',
    name: 'Lend Token',
    description:
      'Supply tokens to lending protocols to earn passive interest. Your supplied tokens can be borrowed by other users, and you earn yield from the interest they pay.',
    triggerWords: ['lend', 'supply', 'deposit'],
    template: 'Lend {token} on {protocol} on {chain} with wallet {walletAddress}',
    category: 'Lending',
    example: 'lend USDC on Aave on ethereum with wallet 0x123...',
  },
  {
    mcpPromptId: 'borrowToken',
    name: 'Borrow Token',
    description:
      'Borrow tokens from lending protocols by providing collateral. Access liquidity without selling your assets, perfect for leveraging positions or accessing working capital.',
    triggerWords: ['borrow', 'loan'],
    template:
      'Borrow {borrowToken} using {collateralToken} as collateral on {protocol} on {chain} with wallet {walletAddress}',
    category: 'Lending',
    example: 'borrow USDC using ETH as collateral on Aave on ethereum with wallet 0x123...',
  },
  {
    mcpPromptId: 'addLiquidity',
    name: 'Add Liquidity',
    description:
      'Provide liquidity to decentralized exchanges and earn trading fees. By adding both tokens to a liquidity pool, you enable swaps and earn a portion of the trading fees generated.',
    triggerWords: ['liquidity', 'provide', 'pool'],
    template:
      'Add liquidity for {token0} and {token1} on {protocol} on {chain} with wallet {walletAddress}',
    category: 'Liquidity',
    example: 'liquidity ETH and USDC on Uniswap on ethereum with wallet 0x123...',
  },
  {
    mcpPromptId: 'removeLiquidity',
    name: 'Remove Liquidity',
    description:
      "Withdraw your liquidity from a pool and claim your earned trading fees. You'll receive back both tokens from the pair plus any accumulated fees.",
    triggerWords: ['remove', 'withdraw'],
    template:
      'Remove liquidity from {token0}/{token1} pool on {protocol} on {chain} with wallet {walletAddress}',
    category: 'Liquidity',
    example: 'remove liquidity from ETH/USDC pool on Uniswap on ethereum with wallet 0x123...',
  },
  {
    mcpPromptId: 'stake',
    name: 'Stake Tokens',
    description:
      'Stake tokens to earn rewards, secure networks, or participate in governance. Staking locks your tokens for a period and rewards you with additional tokens.',
    triggerWords: ['stake'],
    template: 'Stake {token} on {protocol} on {chain} with wallet {walletAddress}',
    category: 'Staking',
    example: 'stake ETH on Lido on ethereum with wallet 0x123...',
  },
  {
    mcpPromptId: 'unstake',
    name: 'Unstake Tokens',
    description:
      'Withdraw your staked tokens and claim any pending rewards. Note that unstaking may have a cooldown period depending on the protocol.',
    triggerWords: ['unstake', 'withdraw'],
    template: 'Unstake {token} from {protocol} on {chain} with wallet {walletAddress}',
    category: 'Staking',
    example: 'unstake ETH from Lido on ethereum with wallet 0x123...',
  },
  {
    mcpPromptId: 'getTokenPrice',
    name: 'Get Token Price',
    description:
      'Fetch the current price of any token in USD or other currencies. Get real-time pricing data from multiple sources for accurate market information.',
    triggerWords: ['price', 'quote'],
    template: 'Get price of {token} on {chain}',
    category: 'Data',
    example: 'price ETH on ethereum',
  },
  {
    mcpPromptId: 'getWalletBalance',
    name: 'Get Wallet Balance',
    description:
      'Check the token balances in any wallet address. View all tokens held by a wallet across different chains.',
    triggerWords: ['balance', 'holdings'],
    template: 'Get balance of {walletAddress} on {chain}',
    category: 'Data',
    example: 'balance 0x123... on ethereum',
  },
  {
    mcpPromptId: 'getProtocolTVL',
    name: 'Get Protocol TVL',
    description:
      'View the Total Value Locked (TVL) in any DeFi protocol. TVL indicates the total amount of assets deposited and is a key metric for protocol health.',
    triggerWords: ['tvl', 'total value locked'],
    template: 'Get TVL of {protocol} on {chain}',
    category: 'Data',
    example: 'tvl Aave on ethereum',
  },
  {
    mcpPromptId: 'getPoolInfo',
    name: 'Get Pool Info',
    description:
      'Fetch detailed information about liquidity pools including TVL, APY, volume, and fees. Essential for evaluating liquidity provision opportunities.',
    triggerWords: ['pool info', 'pool details'],
    template: 'Get info for {token0}/{token1} pool on {protocol} on {chain}',
    category: 'Data',
    example: 'pool info ETH/USDC on Uniswap on ethereum',
  },
  {
    mcpPromptId: 'getGasPrice',
    name: 'Get Gas Price',
    description:
      'Check current gas prices and estimate transaction costs. Helps you choose the optimal time to execute transactions and save on fees.',
    triggerWords: ['gas', 'fees'],
    template: 'Get gas price on {chain}',
    category: 'Data',
    example: 'gas ethereum',
  },
  {
    mcpPromptId: 'bridgeTokens',
    name: 'Bridge Tokens',
    description:
      'Transfer tokens between different blockchain networks securely. Bridge protocols enable cross-chain asset movement while maintaining security.',
    triggerWords: ['bridge', 'transfer'],
    template: 'Bridge {amount} {token} from {fromChain} to {toChain} using wallet {walletAddress}',
    category: 'Bridge',
    example: 'bridge 100 USDC from ethereum to arbitrum using wallet 0x123...',
  },
];

/**
 * Normalize a prompt ID to handle different naming conventions
 */
function normalizePromptId(id: string): string {
  return id
    .toLowerCase()
    .replace(/[_-]/g, '') // Remove underscores and hyphens
    .replace(/\s+/g, ''); // Remove spaces
}

/**
 * Find a prompt mapping by its MCP prompt ID with flexible matching
 */
export function findPromptMapping(mcpPromptId: string): PromptMapping | undefined {
  console.log(`[findPromptMapping] Looking for mapping for: "${mcpPromptId}"`);

  // First try exact match
  let mapping = promptMappings.find((mapping) => mapping.mcpPromptId === mcpPromptId);
  if (mapping) {
    console.log(`[findPromptMapping] Found exact match for: "${mcpPromptId}"`);
    return mapping;
  }

  // Try normalized matching (case-insensitive, ignore underscores/hyphens)
  const normalizedSearch = normalizePromptId(mcpPromptId);
  mapping = promptMappings.find(
    (mapping) => normalizePromptId(mapping.mcpPromptId) === normalizedSearch,
  );

  if (mapping) {
    console.log(
      `[findPromptMapping] Found normalized match for: "${mcpPromptId}" -> "${mapping.mcpPromptId}"`,
    );
    return mapping;
  }

  console.log(`[findPromptMapping] No mapping found for: "${mcpPromptId}"`);
  console.log(
    `[findPromptMapping] Available mappings:`,
    promptMappings.map((m) => m.mcpPromptId),
  );
  return undefined;
}

/**
 * Find prompt mappings by trigger word
 */
export function findPromptMappingsByTrigger(text: string): PromptMapping[] {
  const lowerText = text.toLowerCase().trim();
  return promptMappings.filter((mapping) =>
    mapping.triggerWords.some((word) => lowerText.startsWith(word)),
  );
}

/**
 * Search prompt mappings by name or description
 */
export function searchPromptMappings(query: string): PromptMapping[] {
  const lowerQuery = query.toLowerCase().trim();
  return promptMappings.filter(
    (mapping) =>
      mapping.name.toLowerCase().includes(lowerQuery) ||
      mapping.description.toLowerCase().includes(lowerQuery) ||
      mapping.triggerWords.some((word) => word.toLowerCase().includes(lowerQuery)),
  );
}

/**
 * Get all prompt mappings grouped by category
 */
export function getPromptMappingsByCategory(): Record<string, PromptMapping[]> {
  const grouped: Record<string, PromptMapping[]> = {};

  promptMappings.forEach((mapping) => {
    const category = mapping.category || 'Other';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(mapping);
  });

  return grouped;
}
