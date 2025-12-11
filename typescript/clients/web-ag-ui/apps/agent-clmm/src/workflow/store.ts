import { getStore, type BaseStore } from '@langchain/langgraph';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

import { normalizeHexAddress } from './context.js';

const CROSS_THREAD_NAMESPACE = ['clmm', 'bootstrap'];
const BOOTSTRAP_KEY = 'agent-context';

export type BootstrapContext = {
  account: PrivateKeyAccount;
  agentWalletAddress: `0x${string}`;
};

function resolveStore(store?: BaseStore): BaseStore {
  const resolvedStore = store ?? getStore();
  if (!resolvedStore) {
    throw new Error('Cross-thread store not configured for CLMM workflow');
  }
  return resolvedStore;
}

export async function saveBootstrapContext(
  context: BootstrapContext,
  store?: BaseStore,
): Promise<void> {
  const resolvedStore = resolveStore(store);
  await resolvedStore.put(CROSS_THREAD_NAMESPACE, BOOTSTRAP_KEY, context);
}

function resolveBootstrapContextFromEnv(): BootstrapContext {
  const rawAgentPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
  if (!rawAgentPrivateKey) {
    throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
  }
  const account = privateKeyToAccount(normalizeHexAddress(rawAgentPrivateKey, 'agent private key'));
  return {
    account,
    agentWalletAddress: normalizeHexAddress(account.address, 'agent wallet address'),
  };
}

export async function loadBootstrapContext(store?: BaseStore): Promise<BootstrapContext> {
  const resolvedStore = resolveStore(store);
  const stored = await resolvedStore.get(CROSS_THREAD_NAMESPACE, BOOTSTRAP_KEY);
  if (stored?.value) {
    return stored.value as BootstrapContext;
  }

  const context = resolveBootstrapContextFromEnv();
  await saveBootstrapContext(context, resolvedStore);
  return context;
}
