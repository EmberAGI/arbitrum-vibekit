/**
 * Type definitions for Radiant Capital V2 lending plugin
 * Contains interfaces and types for adapter configuration, market data, and transaction results
 */
import type { Address } from 'viem';

/**
 * Configuration parameters for RadiantAdapter initialization
 */
export interface RadiantAdapterParams {
  chainId: number;
  rpcUrl: string;
  wrappedNativeToken?: string;
}

/**
 * Radiant market data structure
 */
export interface RadiantMarket {
  symbol: string;
  address: string;
  decimals: number;
  ltv: number;
  liquidationThreshold: number;
  supplyAPR: string;
  borrowAPR: string;
  liquidity: string;
  price: string;
}

export interface RadiantPosition {
  address: string;
  healthFactor: string;
  totalCollateralUSD: string;
  totalDebtUSD: string;
  positions: {
    asset: string;
    supplied: string;
    borrowed: string;
  }[];
}

export interface RadiantTxResult {
  to: string;
  data: string;
  value: string;
}

export interface RadiantSupplyParams {
  token: Address;
  amount: string;
  onBehalfOf?: Address;
}

export interface RadiantWithdrawParams {
  token: Address;
  amount: string;
  to?: Address;
}

export interface RadiantBorrowParams {
  token: Address;
  amount: string;
  rateMode?: number;
  onBehalfOf?: Address;
}

export interface RadiantRepayParams {
  token: Address;
  amount: string;
  rateMode?: number;
  onBehalfOf?: Address;
}

export interface RadiantSetCollateralParams {
  token: Address;
  useAsCollateral: boolean;
}

export const RADIANT_CONFIG = {
  chainId: 42161,
  addresses: {
    poolAddressProvider: '0x454a8daf74b24037ee2fa073ce1be9277ed6160a',
    lendingPool: '0xE23B4AE3624fB6f7cDEF29bC8EAD912f1Ede6886',
    dataProvider: '0x596B0cc4c5094507C50b579a662FE7e7b094A2cC',
    oracle: '0xC0cE5De939aaD880b0bdDcf9aB5750a53EDa454b',
    rdntToken: '0x3082CC23568eA640225c2467653dB90e9250AaA0'
  }
} as const;

export function wrapRadiantError(context: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`[RadiantPlugin] ${context}: ${message}`);
}
