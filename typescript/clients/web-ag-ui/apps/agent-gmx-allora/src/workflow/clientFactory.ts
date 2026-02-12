import { privateKeyToAccount } from 'viem/accounts';

import { createClients, type OnchainClients } from '../clients/clients.js';
import { OnchainActionsClient } from '../clients/onchainActions.js';
import { ONCHAIN_ACTIONS_API_URL } from '../config/constants.js';

import { normalizeHexAddress } from './context.js';

let cachedOnchainActionsClient: OnchainActionsClient | null = null;
let cachedOnchainClients: OnchainClients | null = null;

export function getOnchainActionsClient(): OnchainActionsClient {
  if (!cachedOnchainActionsClient) {
    cachedOnchainActionsClient = new OnchainActionsClient(ONCHAIN_ACTIONS_API_URL);
  }
  return cachedOnchainActionsClient;
}

export function getOnchainClients(): OnchainClients {
  if (!cachedOnchainClients) {
    const rawPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
    if (!rawPrivateKey) {
      throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
    }
    const privateKey = normalizeHexAddress(rawPrivateKey, 'embedded private key');
    const account = privateKeyToAccount(privateKey);
    cachedOnchainClients = createClients(account);
  }
  return cachedOnchainClients;
}

export function clearClientCache(): void {
  cachedOnchainActionsClient = null;
  cachedOnchainClients = null;
}
