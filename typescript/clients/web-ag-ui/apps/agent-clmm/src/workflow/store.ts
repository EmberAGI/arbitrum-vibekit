import { getStore, type BaseStore } from '@langchain/langgraph';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

import { normalizeHexAddress } from './context.js';

const CROSS_THREAD_NAMESPACE = ['clmm', 'bootstrap'];
const BOOTSTRAP_KEY = 'agent-context';

export type BootstrapContext = {
  account: PrivateKeyAccount;
  agentWalletAddress: `0x${string}`;
};

/**
 * Input for saving bootstrap context - requires the private key for serialization.
 * LangGraph's store serializes to JSON, which strips prototype methods from objects.
 * We store the private key string and recreate the PrivateKeyAccount when loading.
 */
export type BootstrapContextInput = {
  privateKey: `0x${string}`;
  agentWalletAddress: `0x${string}`;
};

/**
 * Serializable version of BootstrapContext for storage.
 */
type StoredBootstrapContext = {
  privateKey: `0x${string}`;
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
  context: BootstrapContextInput,
  store?: BaseStore,
): Promise<void> {
  const resolvedStore = resolveStore(store);
  // Store only serializable data - the private key string, not the account object
  const storable: StoredBootstrapContext = {
    privateKey: context.privateKey,
    agentWalletAddress: context.agentWalletAddress,
  };
  await resolvedStore.put(CROSS_THREAD_NAMESPACE, BOOTSTRAP_KEY, storable);
}

function resolveBootstrapContextFromEnv(): {
  context: BootstrapContext;
  privateKey: `0x${string}`;
} {
  const rawAgentPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
  if (!rawAgentPrivateKey) {
    throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
  }
  const privateKey = normalizeHexAddress(rawAgentPrivateKey, 'agent private key');
  const account = privateKeyToAccount(privateKey);
  return {
    context: {
      account,
      agentWalletAddress: normalizeHexAddress(account.address, 'agent wallet address'),
    },
    privateKey,
  };
}

export async function loadBootstrapContext(store?: BaseStore): Promise<BootstrapContext> {
  const resolvedStore = resolveStore(store);
  const stored = await resolvedStore.get(CROSS_THREAD_NAMESPACE, BOOTSTRAP_KEY);
  if (stored?.value) {
    const storedContext = stored.value as StoredBootstrapContext;
    // Recreate the PrivateKeyAccount from the stored private key
    // This ensures the account has all its methods (signTransaction, etc.)
    const account = privateKeyToAccount(storedContext.privateKey);
    return {
      account,
      agentWalletAddress: storedContext.agentWalletAddress,
    };
  }

  const { context, privateKey } = resolveBootstrapContextFromEnv();
  await saveBootstrapContext(
    { privateKey, agentWalletAddress: context.agentWalletAddress },
    resolvedStore,
  );
  return context;
}
