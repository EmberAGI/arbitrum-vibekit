import * as dotenv from 'dotenv';

// Load env file as early as possible so any module importing config sees vars
dotenv.config();

// This lightweight config loader keeps the tool easy to run. We avoid heavy
// validation – the tool will simply fail at runtime if a critical variable is
// missing or malformed.

export const env = {
  RPC_URL: process.env.RPC_URL ?? '',
  COMET_ADDRESS: process.env.COMET_ADDRESS ?? '',
  PRIVATE_KEY: process.env.PRIVATE_KEY ?? '',
  CHAIN_ID: process.env.CHAIN_ID,
  NETWORK_NAME: process.env.NETWORK_NAME,
};

// Convenience re-exports ----------------------------------------------------
export const chainId = env.CHAIN_ID ? Number(env.CHAIN_ID) : undefined;
export const networkName = env.NETWORK_NAME ?? 'custom'; 