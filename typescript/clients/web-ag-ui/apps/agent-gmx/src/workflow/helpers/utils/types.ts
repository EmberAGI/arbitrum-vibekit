// Order types from GMX
export enum OrderType {
  MarketSwap,
  LimitSwap,
  MarketIncrease,
  LimitIncrease,
  MarketDecrease,
  LimitDecrease,
  StopLossDecrease,
  Liquidation,
  StopIncrease,
}

// Position direction
export enum PositionDirection {
  Long = 0,
  Short = 1,
}

// Swap type for decrease positions
export enum DecreaseSwapType {
  NoSwap = 0,
  SwapPnlTokenToCollateralToken = 1,
  SwapCollateralTokenToPnlToken = 2,
}

interface GMXOrderParams {
  // Basic params
  orderType: OrderType;
  direction: PositionDirection;
  sizeDeltaUsd: bigint; // in USD with 30 decimals
  acceptablePrice: bigint; // price bound with 30 decimals

  // Token params
  collateralToken: string;
  collateralAmount: bigint; // token amount with appropriate decimals

  // Market
  marketAddress: string;

  // Fees
  executionFee: bigint; // in native token (ETH)

  // Optional
  isLong?: boolean;
  swapPath?: string[];
  callbackContract?: string;
  uiFeeReceiver?: string;
  minOutputAmount?: bigint; // For swaps and decrease orders
  triggerPrice?: bigint; // For limit/stop orders
  decreasePositionSwapType?: DecreaseSwapType; // For decrease orders
  shouldUnwrapNativeToken?: boolean; // For ETH unwrapping
}
