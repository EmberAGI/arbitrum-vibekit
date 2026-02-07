import { OnchainActionsClient } from '../clients/onchainActions.js';
import { ONCHAIN_ACTIONS_BASE_URL } from '../config/constants.js';

let cachedOnchainActionsClient: OnchainActionsClient | null = null;

export function getOnchainActionsClient(): OnchainActionsClient {
  if (!cachedOnchainActionsClient) {
    cachedOnchainActionsClient = new OnchainActionsClient(ONCHAIN_ACTIONS_BASE_URL);
  }
  return cachedOnchainActionsClient;
}

export function clearClientCache(): void {
  cachedOnchainActionsClient = null;
}
