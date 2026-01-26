/**
 * Client factory for creating Ember and viem clients on-demand.
 *
 * LangGraph's checkpointer serializes state to JSON, which strips away prototype methods
 * from class instances. Instead of storing client instances in state (which breaks after
 * interrupts), we create them fresh when needed using this factory.
 */
import { type OnchainClients, createClients } from '../clients/clients.js';
import { EmberCamelotClient } from '../clients/emberApi.js';
import { EMBER_API_BASE_URL } from '../config/constants.js';

import { loadBootstrapContext } from './store.js';

let cachedCamelotClient: EmberCamelotClient | null = null;
let cachedOnchainClients: OnchainClients | null = null;

/**
 * Get or create the Ember Camelot API client.
 * Uses a module-level cache to avoid creating multiple instances.
 */
export function getCamelotClient(): EmberCamelotClient {
  if (!cachedCamelotClient) {
    cachedCamelotClient = new EmberCamelotClient(EMBER_API_BASE_URL);
  }
  return cachedCamelotClient;
}

/**
 * Get or create the viem onchain clients (public + wallet).
 * Uses a module-level cache and loads the account from the store.
 */
export async function getOnchainClients(): Promise<OnchainClients> {
  if (!cachedOnchainClients) {
    const { account } = await loadBootstrapContext();
    cachedOnchainClients = createClients(account);
  }
  return cachedOnchainClients;
}

/**
 * Clear the client cache (useful for testing).
 */
export function clearClientCache(): void {
  cachedCamelotClient = null;
  cachedOnchainClients = null;
}
