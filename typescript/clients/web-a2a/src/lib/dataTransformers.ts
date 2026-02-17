/**
 * Data Transformers
 *
 * This module contains transformation functions that convert raw MCP tool responses
 * into component-friendly prop structures. Each function handles the specific data
 * format expected by its corresponding custom component.
 */

export interface TransactionPreview {
  fromTokenAmount?: string;
  fromTokenSymbol?: string;
  fromTokenAddress?: string;
  fromChain?: string;
  toTokenAmount?: string;
  toTokenSymbol?: string;
  toTokenAddress?: string;
  toChain?: string;
}

export interface TransactionPlan {
  approvals?: Array<{
    token: string;
    spender: string;
    amount: string;
  }>;
  mainTransaction?: {
    to: string;
    data: string;
    value: string;
  };
  chainId?: number;
  gasEstimate?: string;
}

export interface SwapComponentProps {
  txPreview: TransactionPreview;
  txPlan: TransactionPlan | null;
  metadata?: any;
}

/**
 * Transform createSwap MCP response into Swaps component props
 */
export function transformCreateSwapResponse(mcpResponse: any): SwapComponentProps {
  console.log('[transformCreateSwapResponse] Input:', mcpResponse);

  // Handle different possible response structures
  const response = mcpResponse?.content?.[0]?.text
    ? JSON.parse(mcpResponse.content[0].text)
    : mcpResponse;

  // Handle the actual createSwap response format
  const data = response?.data || response;

  // Extract transaction plan from transactions array
  let txPlan: any = null;
  if (data?.transactions && Array.isArray(data.transactions)) {
    // Convert transactions array to TxPlan format
    txPlan = data.transactions.map((tx: any) => ({
      to: tx.to,
      data: tx.data,
      value: tx.value,
      chainId: parseInt(tx.chainId),
    }));
  }

  const transformedData: SwapComponentProps = {
    txPreview: {
      fromTokenAmount: data?.displayFromAmount || data?.fromAmount,
      fromTokenSymbol: data?.fromToken?.symbol,
      fromTokenAddress: data?.fromToken?.tokenUid?.address,
      fromChain: data?.fromToken?.tokenUid?.chainId || 'Unknown',
      toTokenAmount: data?.displayToAmount || data?.toAmount,
      toTokenSymbol: data?.toToken?.symbol,
      toTokenAddress: data?.toToken?.tokenUid?.address,
      toChain: data?.toToken?.tokenUid?.chainId || 'Unknown',
    },
    txPlan: txPlan,
    metadata: {
      estimation: data?.estimation,
      providerTracking: data?.providerTracking,
      fromToken: data?.fromToken,
      toToken: data?.toToken,
    },
  };

  console.log('[transformCreateSwapResponse] Output:', transformedData);
  return transformedData;
}

/**
 * Transform lending tool response for Lending component
 *
 * @param mcpResponse - Raw MCP response from lending tools
 * @returns Transformed props for Lending component
 */
export function transformLendingResponse(mcpResponse: any) {
  console.log('[transformLendingResponse] Input:', mcpResponse);

  // Handle different possible response structures
  const response = mcpResponse?.content?.[0]?.text
    ? JSON.parse(mcpResponse.content[0].text)
    : mcpResponse;

  // Handle the actual tool response format - data is nested inside response.data
  const data = response?.data || response;

  // Extract transaction plan from transactions array if it exists
  let txPlan: any = null;
  if (data?.transactions && Array.isArray(data.transactions)) {
    txPlan = data.transactions.map((tx: any) => ({
      to: tx.to,
      data: tx.data,
      value: tx.value,
      chainId: parseInt(tx.chainId),
    }));
  }

  const transformedData = {
    txPreview: {
      action: data?.action || 'LEND',
      amount: data?.amount || data?.displayAmount,
      tokenName: data?.token?.symbol || data?.tokenSymbol,
      tokenAddress: data?.token?.tokenUid?.address || data?.tokenAddress,
      chainId: data?.token?.tokenUid?.chainId || data?.chainId,
      protocol: data?.protocol,
      apy: data?.apy,
    },
    txPlan: txPlan,
    protocol: data?.protocol,
    token: data?.token,
    apy: data?.apy || 0,
    tvl: data?.tvl || 0,
    amount: data?.amount || data?.displayAmount,
    metadata: {
      toolName: response?.toolName,
      description: response?.description,
      estimation: data?.estimation,
      ...data?.metadata,
    },
    ...data, // Pass through any additional properties
  };

  console.log('[transformLendingResponse] Output:', transformedData);
  return transformedData;
}

/**
 * Transform liquidity tool response for Liquidity component
 *
 * @param mcpResponse - Raw MCP response from liquidity tools
 * @returns Transformed props for Liquidity component
 */
export function transformLiquidityResponse(mcpResponse: any) {
  console.log('[transformLiquidityResponse] Input:', mcpResponse);

  const response = mcpResponse?.content?.[0]?.text
    ? JSON.parse(mcpResponse.content[0].text)
    : mcpResponse;

  // Handle the actual tool response format - data is nested inside response.data
  const data = response?.data || response;

  // Extract transaction plan from transactions array if it exists
  let txPlan: any = null;
  if (data?.transactions && Array.isArray(data.transactions)) {
    txPlan = data.transactions.map((tx: any) => ({
      to: tx.to,
      data: tx.data,
      value: tx.value,
      chainId: parseInt(tx.chainId),
    }));
  }

  // Handle different response formats for liquidity tools
  const transformedData = {
    positions: data?.positions || null,
    pools: data?.pools || null,
    txPreview: data?.txPreview ||
      data?.preview || {
        action: data?.action || 'ADD_LIQUIDITY',
        token0Amount: data?.token0Amount || data?.displayToken0Amount,
        token0Symbol: data?.token0?.symbol,
        token1Amount: data?.token1Amount || data?.displayToken1Amount,
        token1Symbol: data?.token1?.symbol,
        pairHandle: data?.pairHandle || `${data?.token0?.symbol}/${data?.token1?.symbol}`,
        priceFrom: data?.priceFrom,
        priceTo: data?.priceTo,
      },
    txPlan: txPlan,
    token0: data?.token0,
    token1: data?.token1,
    protocol: data?.protocol,
    chain: data?.chain,
    pool: data?.pool,
    apy: data?.apy || 0,
    tvl: data?.tvl || 0,
    volume24h: data?.volume24h || 0,
    fees: data?.fees || 0,
    transaction: data?.transaction,
    metadata: {
      toolName: response?.toolName,
      description: response?.description,
      estimation: data?.estimation,
      ...data?.metadata,
    },
    ...data,
  };

  console.log('[transformLiquidityResponse] Output:', transformedData);
  return transformedData;
}

/**
 * Transform perpetuals tool response for Perpetuals component
 *
 * @param mcpResponse - Raw MCP response from perpetuals tools
 * @returns Transformed props for Perpetuals component
 */
export function transformPerpetualsResponse(mcpResponse: any) {
  console.log('[transformPerpetualsResponse] Input:', mcpResponse);

  const response = mcpResponse?.content?.[0]?.text
    ? JSON.parse(mcpResponse.content[0].text)
    : mcpResponse;

  // Handle the actual tool response format - data is nested inside response.data
  const data = response?.data || response;

  // Extract transaction plan from transactions array if it exists
  let txPlan: any = null;
  if (data?.transactions && Array.isArray(data.transactions)) {
    txPlan = data.transactions.map((tx: any) => ({
      to: tx.to,
      data: tx.data,
      value: tx.value,
      chainId: parseInt(tx.chainId),
    }));
  }

  const transformedData = {
    market: data?.market,
    side: data?.side, // 'long' or 'short'
    leverage: data?.leverage || 1,
    collateral: data?.collateral,
    size: data?.size,
    entryPrice: data?.entryPrice,
    liquidationPrice: data?.liquidationPrice,
    txPreview: data?.txPreview || data?.preview,
    txPlan: txPlan,
    transaction: data?.transaction,
    metadata: {
      toolName: response?.toolName,
      description: response?.description,
      estimation: data?.estimation,
      ...data?.metadata,
    },
    ...data,
  };

  console.log('[transformPerpetualsResponse] Output:', transformedData);
  return transformedData;
}

/**
 * Transform Pendle tool response for Pendle component
 *
 * @param mcpResponse - Raw MCP response from Pendle tools
 * @returns Transformed props for Pendle component
 */
export function transformPendleResponse(mcpResponse: any) {
  console.log('[transformPendleResponse] Input:', mcpResponse);

  const response = mcpResponse?.content?.[0]?.text
    ? JSON.parse(mcpResponse.content[0].text)
    : mcpResponse;

  // Handle the actual tool response format - data is nested inside response.data
  const data = response?.data || response;

  // Extract transaction plan from transactions array if it exists
  let txPlan: any = null;
  if (data?.transactions && Array.isArray(data.transactions)) {
    txPlan = data.transactions.map((tx: any) => ({
      to: tx.to,
      data: tx.data,
      value: tx.value,
      chainId: parseInt(tx.chainId),
    }));
  }

  const transformedData = {
    markets: data?.markets || null,
    isMarketList: !!(data?.markets && Array.isArray(data.markets)),
    txPreview: data?.txPreview ||
      data?.preview || {
        fromTokenAmount: data?.displayFromAmount || data?.fromAmount,
        fromTokenSymbol: data?.fromToken?.symbol,
        fromTokenAddress: data?.fromToken?.tokenUid?.address,
        fromChain: data?.fromToken?.tokenUid?.chainId,
        toTokenAmount: data?.displayToAmount || data?.toAmount,
        toTokenSymbol: data?.toToken?.symbol,
        toTokenAddress: data?.toToken?.tokenUid?.address,
        toChain: data?.toToken?.tokenUid?.chainId,
      },
    txPlan: txPlan,
    metadata: {
      toolName: response?.toolName,
      description: response?.description,
      estimation: data?.estimation,
      providerTracking: data?.providerTracking,
      ...data?.metadata,
    },
    ...data,
  };

  console.log('[transformPendleResponse] Output:', transformedData);
  return transformedData;
}

/**
 * Generic transformer that passes data through unchanged
 * Use this for simple tools that don't need transformation
 */
export function passthroughTransformer(mcpResponse: any) {
  console.log('[passthroughTransformer] Input:', mcpResponse);

  const response = mcpResponse?.content?.[0]?.text
    ? JSON.parse(mcpResponse.content[0].text)
    : mcpResponse;

  // Handle the consistent response format - extract data property
  const data = response?.data || response;

  const transformedData = {
    ...data,
    metadata: {
      toolName: response?.toolName,
      description: response?.description,
      hasData: response?.hasData,
      ...data?.metadata,
    },
  };

  console.log('[passthroughTransformer] Output:', transformedData);
  return transformedData;
}

/**
 * Transform strategy display artifact - pass through as-is since it's already in the correct format
 */
export function transformStrategyDisplayResponse(data: any) {
  console.log('[transformStrategyDisplayResponse] Input:', data);
  // Data is already in the correct format for StrategyInputDisplay component
  return data;
}

/**
 * Transform workflow dispatch response - pass through as-is
 */
export function transformWorkflowDispatchResponse(data: any) {
  return {
    ...data,
    taskId: data?.taskId || data?.id || data?.childTaskId,
    childTaskId: data?.childTaskId || data?.taskId || data?.id,
  };
}

/**
 * Transform strategy dashboard display artifact - pass through as-is
 */
export function transformStrategyDashboardResponse(data: any) {
  // Data is already in the correct format for StrategyDashboard component
  return data;
}

/**
 * Transform transaction history display artifact - pass through as-is
 */
export function transformTransactionHistoryResponse(data: any) {
  // Data is already in the correct format for TransactionHistory component
  return data;
}

/**
 * Transform strategy settings display artifact - pass through as-is
 */
export function transformStrategySettingsResponse(data: any) {
  // Data is already in the correct format for StrategySettings component
  return data;
}

/**
 * Transform strategy policies display artifact - pass through as-is
 */
export function transformStrategyPoliciesResponse(data: any) {
  // Data is already in the correct format for StrategyPolicies component
  return data;
}

/**
 * Registry of transformation functions by tool name
 * Add new transformers here as you create them
 */
export const transformers = {
  createSwap: transformCreateSwapResponse,
  ember_onchain_actions__create_swap: transformCreateSwapResponse,
  lendToken: transformLendingResponse,
  borrowToken: transformLendingResponse,
  addLiquidity: transformLiquidityResponse,
  removeLiquidity: transformLiquidityResponse,
  getLiquidityPositions: transformLiquidityResponse,
  getLiquidityPools: transformLiquidityResponse,
  getPendleMarkets: transformPendleResponse,
  createPendlePosition: transformPendleResponse,
  perpetualLongPosition: transformPerpetualsResponse,
  perpetualShortPosition: transformPerpetualsResponse,
  'strategy-input-display': transformStrategyDisplayResponse,
  dispatch_workflow_usdai_points_trading_strateg: transformWorkflowDispatchResponse,
  'strategy-dashboard-display': transformStrategyDashboardResponse,
  'transaction-history-display': transformTransactionHistoryResponse,
  'strategy-settings-display': transformStrategySettingsResponse,
  'strategy-policies-display': transformStrategyPoliciesResponse,
  // Add more transformers as needed
} as const;

/**
 * Get the appropriate transformer for a tool
 *
 * @param toolName - Name of the MCP tool
 * @returns Transformation function or passthrough
 */
export function getTransformer(toolName: string) {
  return transformers[toolName as keyof typeof transformers] || passthroughTransformer;
}
