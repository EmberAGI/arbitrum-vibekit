import { getStore, type BaseStore } from '@langchain/langgraph';
import { type privateKeyToAccount } from 'viem/accounts';

const CROSS_THREAD_NAMESPACE = ['clmm', 'bootstrap'];
const BOOTSTRAP_KEY = 'agent-context';

export type BootstrapContext = {
  account: ReturnType<typeof privateKeyToAccount>;
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

export async function loadBootstrapContext(store?: BaseStore): Promise<BootstrapContext> {
  const resolvedStore = resolveStore(store);
  const stored = await resolvedStore.get(CROSS_THREAD_NAMESPACE, BOOTSTRAP_KEY);
  if (!stored?.value) {
    throw new Error('Bootstrap context not found in cross-thread store');
  }
  return stored.value as BootstrapContext;
}
