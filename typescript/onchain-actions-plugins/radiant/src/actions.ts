/**
 * Transaction builders for Radiant V2 Lending Protocol
 * 
 * This module provides functions to build transaction calldata for:
 * - Supply: Deposit assets into the lending pool
 * - Withdraw: Remove assets from the lending pool
 * - Borrow: Take loans against collateral
 * - Repay: Pay back borrowed assets
 * - SetCollateral: Enable/disable assets as collateral for borrowing
 * 
 * Note: These functions only build transaction data, they don't execute transactions.
 * The caller is responsible for signing and sending the transaction.
 */

import { encodeFunctionData, parseAbi } from 'viem';
import { RADIANT_CONFIG } from '../radiant.config.js';

/**
 * Result of a transaction build operation
 */
export type TxBuildResult = {
  to: string;      // Contract address to send transaction to
  data: string;    // Encoded function call data
  value: string | null;  // ETH value to send (usually "0" for ERC20 operations)
};

/**
 * ABI definitions for Radiant LendingPool contract
 */
const poolAbi = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
  'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)',
  'function setUserUseReserveAsCollateral(address asset, bool useAsCollateral)'
]);

/**
 * Build a supply transaction to deposit assets into Radiant
 * 
 * Before supplying, ensure the user has approved the LendingPool contract
 * to spend the token amount.
 * 
 * @param params.token - Address of the token to supply
 * @param params.amount - Amount to supply in smallest unit (wei for ETH, base units for tokens)
 * @param params.onBehalfOf - Optional: Address to receive the aTokens (defaults to token address)
 * @returns Transaction data ready to be signed and sent
 */
export function supply(params: { token: string; amount: string; onBehalfOf?: string }): TxBuildResult {
  const data = encodeFunctionData({
    abi: poolAbi,
    functionName: 'supply',
    args: [
      params.token as `0x${string}`,
      BigInt(params.amount),
      (params.onBehalfOf || params.token) as `0x${string}`,
      0  // referralCode: 0 (no referral)
    ]
  });

  return {
    to: RADIANT_CONFIG.addresses.lendingPool,
    data,
    value: '0'
  };
}

/**
 * Build a withdraw transaction to remove assets from Radiant
 * 
 * The user must have sufficient supplied balance (aTokens) to withdraw.
 * If the asset is being used as collateral, ensure withdrawal won't cause
 * health factor to drop below 1.0 (which would trigger liquidation).
 * 
 * @param params.token - Address of the token to withdraw
 * @param params.amount - Amount to withdraw in smallest unit
 * @param params.to - Optional: Address to receive withdrawn tokens (defaults to token address)
 * @returns Transaction data ready to be signed and sent
 */
export function withdraw(params: { token: string; amount: string; to?: string }): TxBuildResult {
  const data = encodeFunctionData({
    abi: poolAbi,
    functionName: 'withdraw',
    args: [
      params.token as `0x${string}`,
      BigInt(params.amount),
      (params.to || params.token) as `0x${string}`
    ]
  });

  return {
    to: RADIANT_CONFIG.addresses.lendingPool,
    data,
    value: '0'
  };
}

/**
 * Build a borrow transaction to take a loan from Radiant
 * 
 * Requirements:
 * 1. User must have supplied assets
 * 2. Supplied assets must be enabled as collateral (use setCollateral)
 * 3. Borrow amount must not cause health factor to drop below 1.0
 * 
 * @param params.token - Address of the token to borrow
 * @param params.amount - Amount to borrow in smallest unit
 * @param params.rateMode - Interest rate mode: 1 = stable, 2 = variable (default: 2)
 * @param params.onBehalfOf - Optional: Address to receive the borrowed tokens
 * @returns Transaction data ready to be signed and sent
 */
export function borrow(params: { token: string; amount: string; rateMode?: number; onBehalfOf?: string }): TxBuildResult {
  const data = encodeFunctionData({
    abi: poolAbi,
    functionName: 'borrow',
    args: [
      params.token as `0x${string}`,
      BigInt(params.amount),
      BigInt(params.rateMode || 2),  // Default to variable rate
      0,  // referralCode: 0 (no referral)
      (params.onBehalfOf || params.token) as `0x${string}`
    ]
  });

  return {
    to: RADIANT_CONFIG.addresses.lendingPool,
    data,
    value: '0'
  };
}

/**
 * Build a repay transaction to pay back borrowed assets
 * 
 * Before repaying, ensure the user has approved the LendingPool contract
 * to spend the token amount.
 * 
 * @param params.token - Address of the token to repay
 * @param params.amount - Amount to repay in smallest unit
 * @param params.rateMode - Interest rate mode: 1 = stable, 2 = variable (default: 2)
 * @param params.onBehalfOf - Optional: Address whose debt to repay
 * @returns Transaction data ready to be signed and sent
 */
export function repay(params: { token: string; amount: string; rateMode?: number; onBehalfOf?: string }): TxBuildResult {
  const data = encodeFunctionData({
    abi: poolAbi,
    functionName: 'repay',
    args: [
      params.token as `0x${string}`,
      BigInt(params.amount),
      BigInt(params.rateMode || 2),  // Default to variable rate
      (params.onBehalfOf || params.token) as `0x${string}`
    ]
  });

  return {
    to: RADIANT_CONFIG.addresses.lendingPool,
    data,
    value: '0'
  };
}

/**
 * Build a transaction to enable or disable an asset as collateral
 * 
 * When enabled, the supplied asset can be used as collateral for borrowing.
 * When disabled, the asset cannot be used as collateral (but remains supplied).
 * 
 * Important: You cannot disable collateral if it would cause your health factor
 * to drop below 1.0 (which would make your position liquidatable).
 * 
 * Typical workflow:
 * 1. supply() - Deposit assets
 * 2. setCollateral(true) - Enable as collateral
 * 3. borrow() - Take a loan
 * 
 * @param params.token - Address of the token to enable/disable as collateral
 * @param params.useAsCollateral - true to enable, false to disable
 * @returns Transaction data ready to be signed and sent
 */
export function setCollateral(params: { token: string; useAsCollateral: boolean }): TxBuildResult {
  const data = encodeFunctionData({
    abi: poolAbi,
    functionName: 'setUserUseReserveAsCollateral',
    args: [
      params.token as `0x${string}`,
      params.useAsCollateral
    ]
  });

  return {
    to: RADIANT_CONFIG.addresses.lendingPool,
    data,
    value: '0'
  };
}
