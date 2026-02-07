import { privateKeyToAccount } from 'viem/accounts';

import { createClients, type OnchainClients } from '../clients/clients.js';
import { OnchainActionsClient } from '../clients/onchainActions.js';
import { ONCHAIN_ACTIONS_BASE_URL } from '../config/constants.js';

let cachedOnchainActionsClient: OnchainActionsClient | null = null;
let cachedEmbeddedClients: OnchainClients | null = null;

export function getOnchainActionsClient(): OnchainActionsClient {
  if (!cachedOnchainActionsClient) {
    cachedOnchainActionsClient = new OnchainActionsClient(ONCHAIN_ACTIONS_BASE_URL);
  }
  return cachedOnchainActionsClient;
}

export function getEmbeddedOnchainClients(): OnchainClients {
  if (!cachedEmbeddedClients) {
    const rawKey = process.env['GMX_ALLORA_EMBEDDED_PRIVATE_KEY']?.trim();
    if (!rawKey || !/^0x[0-9a-fA-F]{64}$/u.test(rawKey)) {
      throw new Error(
        'GMX_ALLORA_EMBEDDED_PRIVATE_KEY is required (0x + 64 hex chars) to submit transactions.',
      );
    }
    const account = privateKeyToAccount(rawKey as `0x${string}`);
    cachedEmbeddedClients = createClients(account);
  }
  return cachedEmbeddedClients;
}

export function clearClientCache(): void {
  cachedOnchainActionsClient = null;
  cachedEmbeddedClients = null;
}
