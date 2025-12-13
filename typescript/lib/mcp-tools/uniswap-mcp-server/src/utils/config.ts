import dotenv from 'dotenv';
import { ConfigurationError } from '../errors/index.js';

dotenv.config();

/**
 * Server configuration loaded from environment variables
 */
export interface ServerConfig {
  ethereumRpcUrl: string;
  arbitrumRpcUrl: string;
  privateKey?: string;
  defaultSlippage: number;
  gasMultiplier: number;
  port: number;
}

/**
 * Load and validate server configuration from environment variables
 */
export function loadConfig(): ServerConfig {
  const ethereumRpcUrl = process.env.ETHEREUM_RPC_URL;
  const arbitrumRpcUrl = process.env.ARBITRUM_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const defaultSlippage = parseFloat(process.env.DEFAULT_SLIPPAGE || '0.5');
  const gasMultiplier = parseFloat(process.env.GAS_MULTIPLIER || '1.2');
  const port = parseInt(process.env.PORT || '3012', 10);

  if (!ethereumRpcUrl) {
    throw new ConfigurationError(
      'ETHEREUM_RPC_URL environment variable is required'
    );
  }

  if (!arbitrumRpcUrl) {
    throw new ConfigurationError(
      'ARBITRUM_RPC_URL environment variable is required'
    );
  }

  if (defaultSlippage < 0 || defaultSlippage > 50) {
    throw new ConfigurationError(
      'DEFAULT_SLIPPAGE must be between 0 and 50'
    );
  }

  if (gasMultiplier <= 0) {
    throw new ConfigurationError('GAS_MULTIPLIER must be positive');
  }

  if (port < 1 || port > 65535) {
    throw new ConfigurationError('PORT must be between 1 and 65535');
  }

  return {
    ethereumRpcUrl,
    arbitrumRpcUrl,
    privateKey,
    defaultSlippage,
    gasMultiplier,
    port,
  };
}

