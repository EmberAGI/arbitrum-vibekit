import { getStore, type BaseStore } from '@langchain/langgraph';
import { v7 as uuidv7 } from 'uuid';

import type { NavSnapshot, FlowLogEvent } from '../accounting/types.js';
import { resolveStoreHistoryLimit } from '../config/constants.js';
import type { RebalanceTelemetry } from '../domain/types.js';

import type { ClmmTransaction } from './context.js';

const STORE_HISTORY_LIMIT = resolveStoreHistoryLimit();

type StoreSearchItem = Awaited<ReturnType<BaseStore['search']>>[number];

function resolveStore(store?: BaseStore): BaseStore {
  const resolvedStore = store ?? getStore();
  if (!resolvedStore) {
    throw new Error('History store not configured for CLMM workflow');
  }
  return resolvedStore;
}

function buildNamespace(threadId: string, ...parts: string[]): string[] {
  return ['threads', threadId, ...parts];
}

async function pruneNamespace(params: {
  store: BaseStore;
  namespace: string[];
  limit?: number;
}): Promise<void> {
  const limit = params.limit ?? STORE_HISTORY_LIMIT;
  if (limit <= 0) {
    return;
  }

  const items = await params.store.search(params.namespace);
  if (items.length <= limit) {
    return;
  }

  const sorted = [...items].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  const excess = sorted.length - limit;
  const toDelete = sorted.slice(0, excess);
  await Promise.all(
    toDelete.map((item) => params.store.delete(params.namespace, item.key)),
  );
}

function sortByCreatedAt(items: StoreSearchItem[]): StoreSearchItem[] {
  return [...items].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
}

async function appendHistory<T extends Record<string, unknown>>(params: {
  threadId?: string;
  namespaceParts: string[];
  entries: T[];
  store?: BaseStore;
}): Promise<void> {
  const { threadId, namespaceParts, entries } = params;
  if (!threadId || entries.length === 0) {
    return;
  }

  const store = resolveStore(params.store);
  const namespace = buildNamespace(threadId, ...namespaceParts);
  await Promise.all(
    entries.map((entry) => store.put(namespace, uuidv7(), entry)),
  );
  await pruneNamespace({ store, namespace });
}

export async function appendTelemetryHistory(params: {
  threadId?: string;
  telemetry: RebalanceTelemetry[];
  store?: BaseStore;
}): Promise<void> {
  await appendHistory({
    threadId: params.threadId,
    namespaceParts: ['telemetry'],
    entries: params.telemetry,
    store: params.store,
  });
}

export async function appendTransactionHistory(params: {
  threadId?: string;
  transactions: ClmmTransaction[];
  store?: BaseStore;
}): Promise<void> {
  await appendHistory({
    threadId: params.threadId,
    namespaceParts: ['transactions'],
    entries: params.transactions,
    store: params.store,
  });
}

export async function appendFlowLogHistory(params: {
  threadId?: string;
  events: FlowLogEvent[];
  store?: BaseStore;
}): Promise<void> {
  await appendHistory({
    threadId: params.threadId,
    namespaceParts: ['accounting', 'flow-log'],
    entries: params.events,
    store: params.store,
  });
}

export async function appendNavSnapshotHistory(params: {
  threadId?: string;
  snapshots: NavSnapshot[];
  store?: BaseStore;
}): Promise<void> {
  await appendHistory({
    threadId: params.threadId,
    namespaceParts: ['accounting', 'nav-snapshots'],
    entries: params.snapshots,
    store: params.store,
  });
}

export async function loadFlowLogHistory(params: {
  threadId?: string;
  store?: BaseStore;
}): Promise<FlowLogEvent[]> {
  if (!params.threadId) {
    return [];
  }
  const store = resolveStore(params.store);
  const namespace = buildNamespace(params.threadId, 'accounting', 'flow-log');
  const items = sortByCreatedAt(await store.search(namespace));
  return items.map((item) => item.value as FlowLogEvent);
}
