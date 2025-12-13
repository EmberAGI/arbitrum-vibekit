import { utils } from 'ethers';
const { getAddress, isAddress } = utils;
import { ValidationError } from '../errors/index.js';

/**
 * Validates and normalizes an Ethereum address
 */
export function validateAddress(address: string): string {
  if (!isAddress(address)) {
    throw new ValidationError(`Invalid address format: ${address}`);
  }
  return getAddress(address);
}

/**
 * Validates that an address is not the zero address
 */
export function validateNonZeroAddress(address: string): string {
  const normalized = validateAddress(address);
  if (normalized === '0x0000000000000000000000000000000000000000') {
    throw new ValidationError('Address cannot be the zero address');
  }
  return normalized;
}

/**
 * Validates that an amount is positive
 */
export function validatePositiveAmount(amount: bigint): bigint {
  if (amount <= 0n) {
    throw new ValidationError('Amount must be positive');
  }
  return amount;
}

/**
 * Validates slippage tolerance is within reasonable bounds (0-50%)
 */
export function validateSlippageTolerance(slippage: number): number {
  if (slippage < 0 || slippage > 50) {
    throw new ValidationError(
      'Slippage tolerance must be between 0 and 50 percent'
    );
  }
  return slippage;
}

/**
 * Validates chain ID is supported
 */
export function validateChainId(chainId: number): number {
  const supportedChains = [1, 42161, 11155111, 421614];
  if (!supportedChains.includes(chainId)) {
    throw new ValidationError(
      `Unsupported chain ID: ${chainId}. Supported chains: ${supportedChains.join(', ')}`
    );
  }
  return chainId;
}

/**
 * Validates token addresses are different
 */
export function validateDifferentTokens(
  tokenIn: string,
  tokenOut: string
): void {
  const normalizedIn = validateAddress(tokenIn);
  const normalizedOut = validateAddress(tokenOut);
  if (normalizedIn === normalizedOut) {
    throw new ValidationError('Token in and token out must be different');
  }
}

