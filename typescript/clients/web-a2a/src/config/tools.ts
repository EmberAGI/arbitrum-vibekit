/**
 * Tool Configuration System
 *
 * This configuration maps MCP tools to UI components and categorizes them.
 * Each tool can specify a custom component for rendering results, otherwise
 * it defaults to JsonViewer.
 *
 * Component mapping is handled by toolComponentLoader.ts which dynamically
 * imports the specified components.
 */

export interface ToolConfig {
  id: string; // MCP tool name (must match exactly)
  name: string; // Display name for UI
  description: string; // Tool description
  category: string; // Category ID (must exist in toolCategories)
  component?: string; // Component name (without .tsx extension), defaults to JsonViewer
  enabled: boolean; // Whether tool is enabled/visible
}

export interface ToolCategory {
  id: string;
  name: string;
  description: string;
  color?: string;
}

export const toolCategories: ToolCategory[] = [
  {
    id: 'swapping',
    name: 'Swapping',
    description: 'Cross-chain token swaps and exchange operations',
    color: 'blue',
  },
  {
    id: 'perpetuals',
    name: 'Perpetuals',
    description: 'Leveraged trading with perpetual futures',
    color: 'purple',
  },
  {
    id: 'lending',
    name: 'Lending',
    description: 'DeFi lending, borrowing, and yield farming',
    color: 'green',
  },
  {
    id: 'liquidity',
    name: 'Liquidity',
    description: 'Liquidity pool management and rewards',
    color: 'orange',
  },
  {
    id: 'wallet',
    name: 'Wallet',
    description: 'Wallet balance and portfolio management',
    color: 'gray',
  },
  {
    id: 'market-data',
    name: 'Market Data',
    description: 'Market information and discovery',
    color: 'cyan',
  },
  {
    id: 'interactive',
    name: 'Interactive Components',
    description: 'Components with bidirectional communication and user interaction',
    color: 'pink',
  },
];

export const toolConfigs: ToolConfig[] = [
  // Swapping Category
  {
    id: 'createSwap',
    name: 'Create Swap',
    description:
      'Create a cross-chain token swap transaction plan. Swap tokens from one blockchain to another, supporting both exact input and exact output amounts with customizable slippage tolerance and expiration settings.',
    category: 'swapping',
    component: 'Swaps',
    enabled: true,
  },
  {
    id: 'ember_onchain_actions__create_swap',
    name: 'Create Swap',
    description:
      'Create a cross-chain token swap transaction plan. Swap tokens from one blockchain to another, supporting both exact input and exact output amounts with customizable slippage tolerance and expiration settings.',
    category: 'swapping',
    component: 'Swaps',
    enabled: true,
  },
  {
    id: 'possibleSwaps',
    name: 'Possible Swaps',
    description:
      'Discover available token swap opportunities based on user wallet balances and supported trading pairs. Returns paginated results showing all possible token combinations that can be swapped across different blockchains.',
    category: 'swapping',
    enabled: true,
  },

  // Lending Category
  {
    id: 'lendToken',
    name: 'Lend Token',
    description:
      'Supply tokens to lending protocols to earn passive interest. Your supplied tokens can be borrowed by other users, and you earn yield from the interest they pay.',
    category: 'lending',
    component: 'Lending',
    enabled: true,
  },
  {
    id: 'borrowToken',
    name: 'Borrow Token',
    description:
      'Borrow tokens from lending protocols by providing collateral. Access liquidity without selling your assets, perfect for leveraging positions or accessing working capital.',
    category: 'lending',
    component: 'Lending',
    enabled: true,
  },

  // Liquidity Category
  {
    id: 'addLiquidity',
    name: 'Add Liquidity',
    description:
      'Provide liquidity to decentralized exchanges and earn trading fees. By adding both tokens to a liquidity pool, you enable swaps and earn a portion of the trading fees generated.',
    category: 'liquidity',
    component: 'Liquidity',
    enabled: true,
  },
  {
    id: 'removeLiquidity',
    name: 'Remove Liquidity',
    description:
      "Withdraw your liquidity from a pool and claim your earned trading fees. You'll receive back both tokens from the pair plus any accumulated fees.",
    category: 'liquidity',
    component: 'Liquidity',
    enabled: true,
  },
  {
    id: 'getLiquidityPositions',
    name: 'Get Liquidity Positions',
    description:
      'View your current liquidity positions across different protocols and chains. See your position details, current value, and earned fees.',
    category: 'liquidity',
    component: 'Liquidity',
    enabled: true,
  },
  {
    id: 'getLiquidityPools',
    name: 'Get Liquidity Pools',
    description:
      'Browse available liquidity pools to provide liquidity. View pool statistics, APY, and requirements for each pool.',
    category: 'liquidity',
    component: 'Liquidity',
    enabled: true,
  },

  // Perpetuals Category - Pendle Markets
  {
    id: 'getPendleMarkets',
    name: 'Get Pendle Markets',
    description:
      'Browse available Pendle markets for yield trading. View market statistics, APY, liquidity, and underlying assets for fixed-yield and variable-yield trading.',
    category: 'perpetuals',
    component: 'Pendle',
    enabled: true,
  },
  {
    id: 'createPendlePosition',
    name: 'Create Pendle Position',
    description:
      'Enter a position in Pendle markets for yield trading. Trade principal tokens (PT) and yield tokens (YT) to profit from yield fluctuations.',
    category: 'perpetuals',
    component: 'Pendle',
    enabled: true,
  },

  // Interactive Components Category
  {
    id: 'interactive-example',
    name: 'Interactive Example',
    description:
      'Example component demonstrating bidirectional communication with A2A streams. Shows how components can receive user input and send responses back to active tasks for approval workflows, signatures, and multi-step interactions.',
    category: 'interactive',
    component: 'InteractiveExample',
    enabled: true,
  },

  // Workflow Artifacts
  {
    id: 'strategy-input-display',
    name: 'Strategy Input Display',
    description:
      'Displays strategy information including name, rewards, chains, and token details for workflow approval.',
    category: 'interactive',
    component: 'StrategyInputDisplay',
    enabled: true,
  },
  {
    id: 'dispatch_workflow_usdai_points_trading_strateg',
    name: 'Workflow Dispatch',
    description: 'Dispatches a workflow and shows progress information',
    category: 'interactive',
    component: 'WorkflowDispatched',
    enabled: true,
  },
  {
    id: 'strategy-dashboard-display',
    name: 'Strategy Dashboard',
    description: 'Displays the main dashboard overview for an active strategy',
    category: 'interactive',
    component: 'StrategyDashboard',
    enabled: true,
  },
  {
    id: 'transaction-history-display',
    name: 'Transaction History',
    description: 'Displays transaction history for strategy execution',
    category: 'interactive',
    component: 'TransactionHistory',
    enabled: true,
  },
  {
    id: 'strategy-settings-display',
    name: 'Strategy Settings',
    description: 'Displays and manages strategy settings',
    category: 'interactive',
    component: 'StrategySettings',
    enabled: true,
  },
  {
    id: 'strategy-policies-display',
    name: 'Strategy Policies',
    description: 'Displays and manages delegation policies',
    category: 'interactive',
    component: 'StrategyPolicies',
    enabled: true,
  },
  {
    id: 'delegations-display',
    name: 'Delegations',
    description: 'Displays delegation policies for signing',
    category: 'interactive',
    component: 'WorkflowApprovalHandler',
    enabled: true,
  },
  {
    id: 'delegations-data',
    name: 'Delegation Data',
    description: 'Raw delegation data for signing',
    category: 'interactive',
    component: 'WorkflowApprovalHandler',
    enabled: true,
  },
  {
    id: 'x402-payment-display',
    name: 'X402 Payment',
    description: 'Displays x402 payment information for approval',
    category: 'interactive',
    component: 'X402PaymentDisplay',
    enabled: true,
  },
  {
    id: 'x402-payment-data',
    name: 'X402 Payment Data',
    description: 'Raw x402 payment data',
    category: 'interactive',
    component: 'X402PaymentDisplay',
    enabled: true,
  },
];

export function getToolConfig(toolId: string): ToolConfig | undefined {
  return toolConfigs.find((tool) => tool.id === toolId);
}

export function getToolsByCategory(categoryId: string): ToolConfig[] {
  return toolConfigs.filter((tool) => tool.category === categoryId && tool.enabled);
}

export function getCategoryConfig(categoryId: string): ToolCategory | undefined {
  return toolCategories.find((cat) => cat.id === categoryId);
}

export function getComponentForTool(toolId: string): string {
  const toolConfig = getToolConfig(toolId);
  return toolConfig?.component || 'JsonViewer';
}
