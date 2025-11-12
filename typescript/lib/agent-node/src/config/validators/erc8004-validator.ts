/**
 * ERC-8004 Configuration Validator
 * Validates ERC-8004 agent registration configuration
 */

import type { ERC8004Config } from '../schemas/agent.schema.js';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Check if a URL is a local/development URL
 */
function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname.endsWith('.local')
    );
  } catch {
    return false;
  }
}

/**
 * Validate ERC-8004 configuration
 * @param config - ERC-8004 configuration object
 * @param cardUrl - Agent card URL from card.url
 * @param nodeEnv - NODE_ENV value (production, development, etc.)
 * @returns Validation result with errors and warnings
 */
export function validateERC8004Config(
  config: ERC8004Config | undefined,
  cardUrl: string,
  nodeEnv?: string,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // If ERC-8004 is not configured, no validation needed
  if (!config || !config.enabled) {
    return { errors, warnings };
  }

  // Error: ERC-8004 enabled but canonical chain not configured
  if (!config.canonical) {
    errors.push(
      'ERC-8004 enabled but canonical chain not configured. ' +
        'Add `erc8004.canonical` with chainId and optional operatorAddress.',
    );
    return { errors, warnings }; // Cannot continue validation without canonical
  }

  // Validate canonical chainId
  if (!Number.isInteger(config.canonical.chainId) || config.canonical.chainId <= 0) {
    errors.push(
      `Invalid canonical chainId: ${config.canonical.chainId}. Must be a positive integer.`,
    );
  }

  // Warning: Missing operator address (cannot form CAIP-10)
  if (!config.canonical.operatorAddress) {
    warnings.push(
      'Canonical operator address not configured. ' +
        'CAIP-10 reference cannot be formed without operatorAddress. ' +
        'Add `erc8004.canonical.operatorAddress` to enable full ERC-8004 support.',
    );
  }

  // Warning: Local URL in production
  if (nodeEnv === 'production' && isLocalUrl(cardUrl)) {
    warnings.push(
      `Agent card URL (${cardUrl}) appears to be a local/development URL, ` +
        'but NODE_ENV=production. Update `card.url` to a public URL for production deployment.',
    );
  }

  // Check for zero-address registries
  if (config.identityRegistries) {
    const zeroAddressChains: string[] = [];

    for (const [chainId, address] of Object.entries(config.identityRegistries)) {
      if (address.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
        zeroAddressChains.push(chainId);
      }
    }

    if (zeroAddressChains.length > 0) {
      warnings.push(
        `Identity registries use zero-address placeholders for chains: ${zeroAddressChains.join(', ')}. ` +
          'These indicate undeployed contracts. Update `erc8004.identityRegistries` with deployed addresses when available.',
      );
    }
  }

  // Warning: No mirrors configured (best practice)
  if (!config.mirrors || config.mirrors.length === 0) {
    warnings.push(
      'No mirror chains configured. ' +
        'Consider adding `erc8004.mirrors` to enable multi-chain discovery.',
    );
  }

  // Validate mirror chainIds
  if (config.mirrors) {
    for (let i = 0; i < config.mirrors.length; i++) {
      const mirror = config.mirrors[i];
      if (!mirror) continue;

      if (!Number.isInteger(mirror.chainId) || mirror.chainId <= 0) {
        errors.push(
          `Invalid mirror chainId at index ${i}: ${mirror.chainId}. Must be a positive integer.`,
        );
      }
    }
  }

  return { errors, warnings };
}
