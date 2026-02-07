/**
 * Client factory for creating onchain actions + viem clients on-demand.
 */
import { privateKeyToAccount } from 'viem/accounts';

import { type OnchainClients, createClients } from '../clients/clients.js';
import { OnchainActionsClient } from '../clients/onchainActions.js';
import { ONCHAIN_ACTIONS_API_URL } from '../config/constants.js';

import { normalizeHexAddress } from './context.js';

let cachedOnchainActionsClient: OnchainActionsClient | null = null;
let cachedOnchainClients: OnchainClients | null = null;
let cachedAgentWalletAddress: `0x${string}` | null = null;

export function getOnchainActionsClient(): OnchainActionsClient {
  if (!cachedOnchainActionsClient) {
    cachedOnchainActionsClient = new OnchainActionsClient(ONCHAIN_ACTIONS_API_URL);
  }
  return cachedOnchainActionsClient;
}

export function getOnchainClients(): OnchainClients {
  if (!cachedOnchainClients) {
    const rawAgentPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
    if (!rawAgentPrivateKey) {
      throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
    }
    const privateKey = normalizeHexAddress(rawAgentPrivateKey, 'agent private key');
    const account = privateKeyToAccount(privateKey);
    cachedOnchainClients = createClients(account);
    cachedAgentWalletAddress = account.address;
  }
  return cachedOnchainClients;
}

export function getAgentWalletAddress(): `0x${string}` {
  if (cachedAgentWalletAddress) {
    return cachedAgentWalletAddress;
  }

  // Prefer returning the wallet address derived from the same key used for tx signing,
  // so onchain-actions plans always route outputs to a real controlled wallet.
  const rawAgentPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
  if (!rawAgentPrivateKey) {
    throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
  }
  const privateKey = normalizeHexAddress(rawAgentPrivateKey, 'agent private key');
  const account = privateKeyToAccount(privateKey);
  cachedAgentWalletAddress = account.address;
  return cachedAgentWalletAddress;
}

export function clearClientCache(): void {
  cachedOnchainActionsClient = null;
  cachedOnchainClients = null;
  cachedAgentWalletAddress = null;
}
