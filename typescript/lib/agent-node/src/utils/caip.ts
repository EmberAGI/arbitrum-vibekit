/**
 * CAIP Utilities
 * Formatting and parsing utilities for Chain Agnostic Improvement Proposals
 *
 * CAIP-2: Blockchain ID specification (chain references)
 * CAIP-10: Account ID specification (account identifiers)
 *
 * References:
 * - CAIP-2: https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md
 * - CAIP-10: https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md
 */

/**
 * CAIP-2: Blockchain ID (chain reference)
 * Format: namespace:chain_id:address
 * Example: eip155:1:0xRegistry...
 */
export interface Caip2 {
  namespace: string;
  chainId: number;
  address: string;
}

/**
 * CAIP-10: Account ID (account identifier)
 * Format: namespace:chain_id:account_address
 * Example: eip155:42161:0xAgent...
 */
export interface Caip10 {
  namespace: string;
  chainId: number;
  address: string;
}

/**
 * Formats a CAIP-2 blockchain ID
 * @param chainId - EVM chain ID (e.g., 1 for Ethereum, 42161 for Arbitrum One)
 * @param address - Contract address (e.g., registry address)
 * @returns CAIP-2 formatted string (e.g., "eip155:1:0x...")
 */
export function formatCaip2(chainId: number, address: string): string {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chain ID: ${chainId}. Must be a positive integer.`);
  }

  if (!address || typeof address !== 'string') {
    throw new Error('Invalid address. Must be a non-empty string.');
  }

  // Normalize address to lowercase (EVM addresses are case-insensitive)
  const normalizedAddress = address.toLowerCase();

  return `eip155:${chainId}:${normalizedAddress}`;
}

/**
 * Formats a CAIP-10 account ID
 * @param chainId - EVM chain ID
 * @param address - Account address (e.g., operator address, agent address)
 * @returns CAIP-10 formatted string (e.g., "eip155:42161:0x...")
 */
export function formatCaip10(chainId: number, address: string): string {
  // CAIP-10 uses the same format as CAIP-2 for EVM chains
  return formatCaip2(chainId, address);
}

/**
 * Parses a CAIP-2 blockchain ID
 * @param caip - CAIP-2 formatted string
 * @returns Parsed components
 * @throws Error if format is invalid
 */
export function parseCaip2(caip: string): Caip2 {
  if (!caip || typeof caip !== 'string') {
    throw new Error('Invalid CAIP-2 string. Must be a non-empty string.');
  }

  const parts = caip.split(':');

  if (parts.length !== 3) {
    throw new Error(`Invalid CAIP-2 format: "${caip}". Expected format: namespace:chainId:address`);
  }

  const namespace = parts[0];
  const chainIdStr = parts[1];
  const address = parts[2];

  if (!namespace) {
    throw new Error(`Missing namespace in CAIP-2: "${caip}"`);
  }

  if (namespace !== 'eip155') {
    throw new Error(
      `Unsupported namespace: "${namespace}". Only "eip155" (EVM chains) is currently supported.`,
    );
  }

  if (!chainIdStr) {
    throw new Error(`Missing chain ID in CAIP-2: "${caip}"`);
  }

  const chainId = parseInt(chainIdStr, 10);
  if (isNaN(chainId) || chainId <= 0) {
    throw new Error(`Invalid chain ID in CAIP-2: "${chainIdStr}". Must be a positive integer.`);
  }

  if (!address) {
    throw new Error(`Missing address in CAIP-2: "${caip}"`);
  }

  return {
    namespace,
    chainId,
    address: address.toLowerCase(), // Normalize to lowercase
  };
}

/**
 * Parses a CAIP-10 account ID
 * @param caip - CAIP-10 formatted string
 * @returns Parsed components
 * @throws Error if format is invalid
 */
export function parseCaip10(caip: string): Caip10 {
  // CAIP-10 uses the same format as CAIP-2 for EVM chains
  return parseCaip2(caip);
}

/**
 * Validates a CAIP-2 blockchain ID
 * @param caip - String to validate
 * @returns true if valid, false otherwise
 */
export function isValidCaip2(caip: string): boolean {
  try {
    parseCaip2(caip);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a CAIP-10 account ID
 * @param caip - String to validate
 * @returns true if valid, false otherwise
 */
export function isValidCaip10(caip: string): boolean {
  return isValidCaip2(caip);
}
