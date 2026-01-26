import { randomUUID } from 'node:crypto';

import type { AccountingState, FlowLogEvent, FlowLogEventInput, NavSnapshot } from './types.js';

const defaultAccountingState = (): AccountingState => ({
  navSnapshots: [],
  flowLog: [],
});

export function appendNavSnapshots(
  existing: AccountingState | undefined,
  snapshots: NavSnapshot[],
): AccountingState {
  const base = existing ?? defaultAccountingState();
  const merged = [...base.navSnapshots, ...snapshots];
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : base.latestNavSnapshot;

  return {
    ...base,
    navSnapshots: merged,
    latestNavSnapshot: latest,
    lastUpdated: latest?.timestamp ?? base.lastUpdated,
  };
}

export function createFlowEvent(params: FlowLogEventInput): FlowLogEvent {
  if (!params.contextId) {
    throw new Error('Flow log event missing contextId');
  }
  return {
    ...params,
    contextId: params.contextId,
    id: params.id ?? randomUUID(),
    timestamp: params.timestamp ?? new Date().toISOString(),
  };
}

export function appendFlowEvents(
  existing: AccountingState | undefined,
  events: FlowLogEvent[],
): AccountingState {
  const base = existing ?? defaultAccountingState();
  return {
    ...base,
    flowLog: [...base.flowLog, ...events],
  };
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function computeApy(params: {
  initialAllocationUsd: number;
  aumUsd: number;
  lifecycleStart?: string;
  now?: string;
}): number | undefined {
  if (params.initialAllocationUsd <= 0) {
    return undefined;
  }
  const start = parseTimestamp(params.lifecycleStart);
  if (!start) {
    return undefined;
  }
  const end = parseTimestamp(params.now ?? new Date().toISOString());
  if (!end || end <= start) {
    return undefined;
  }
  const days = (end - start) / (1000 * 60 * 60 * 24);
  if (days <= 0) {
    return undefined;
  }
  const ratio = params.aumUsd / params.initialAllocationUsd;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return undefined;
  }
  return Math.pow(ratio, 365 / days) - 1;
}

export function recomputeAccountingMetrics(params: {
  existing: AccountingState;
  now?: string;
}): AccountingState {
  const { existing } = params;
  const flowLog = existing.flowLog;
  const latestNavSnapshot = existing.latestNavSnapshot;

  const hireEvents = flowLog.filter((event) => event.type === 'hire');
  const latestHire = hireEvents.reduce<FlowLogEvent | null>((latest, event) => {
    if (!latest) {
      return event;
    }
    const latestTs = parseTimestamp(latest.timestamp) ?? 0;
    const eventTs = parseTimestamp(event.timestamp) ?? 0;
    return eventTs >= latestTs ? event : latest;
  }, null);
  const lifecycleStart = latestHire?.timestamp ?? existing.lifecycleStart;

  const lifecycleStartMs = parseTimestamp(lifecycleStart);
  const fireEvents = flowLog.filter((event) => event.type === 'fire');
  const latestFire = fireEvents.reduce<FlowLogEvent | null>((latest, event) => {
    if (!latest) {
      return event;
    }
    const latestTs = parseTimestamp(latest.timestamp) ?? 0;
    const eventTs = parseTimestamp(event.timestamp) ?? 0;
    return eventTs >= latestTs ? event : latest;
  }, null);
  const lifecycleEnd =
    lifecycleStartMs !== null &&
    latestFire?.timestamp &&
    (parseTimestamp(latestFire.timestamp) ?? 0) >= lifecycleStartMs
      ? latestFire.timestamp
      : existing.lifecycleEnd;

  const initialAllocationUsd =
    latestHire?.usdValue ?? existing.initialAllocationUsd ?? undefined;
  const fireUsd = lifecycleEnd ? latestFire?.usdValue ?? 0 : 0;
  const positionsUsd = latestNavSnapshot?.totalUsd ?? 0;
  const externalUsd = initialAllocationUsd !== undefined ? initialAllocationUsd - fireUsd : 0;
  const cashUsd =
    initialAllocationUsd !== undefined
      ? Math.max(0, Number((externalUsd - positionsUsd).toFixed(6)))
      : undefined;
  const aumUsd = Number((positionsUsd + (cashUsd ?? 0)).toFixed(6));
  const lifetimePnlUsd =
    initialAllocationUsd !== undefined
      ? Number((aumUsd - initialAllocationUsd).toFixed(6))
      : undefined;
  const lifetimeReturnPct =
    initialAllocationUsd && initialAllocationUsd > 0
      ? Number(((aumUsd / initialAllocationUsd) - 1).toFixed(6))
      : undefined;

  const lifecycleChanged =
    lifecycleStart !== undefined && lifecycleStart !== existing.lifecycleStart;
  const highWaterBase = lifecycleChanged ? 0 : existing.highWaterMarkUsd ?? 0;
  const highWaterMarkUsd = Number(Math.max(highWaterBase, aumUsd).toFixed(6));

  const apy = computeApy({
    initialAllocationUsd: initialAllocationUsd ?? 0,
    aumUsd,
    lifecycleStart,
    now: params.now ?? existing.lastUpdated,
  });

  return {
    ...existing,
    lastUpdated: latestNavSnapshot?.timestamp ?? existing.lastUpdated ?? params.now,
    lifecycleStart,
    lifecycleEnd,
    initialAllocationUsd,
    cashUsd,
    positionsUsd,
    aumUsd,
    lifetimePnlUsd,
    lifetimeReturnPct,
    highWaterMarkUsd,
    apy: apy !== undefined ? Number(apy.toFixed(6)) : undefined,
  };
}

export function applyAccountingUpdate(params: {
  existing: AccountingState | undefined;
  snapshots?: NavSnapshot[];
  flowEvents?: FlowLogEvent[];
  now?: string;
}): AccountingState {
  let state = params.existing ?? defaultAccountingState();
  if (params.flowEvents && params.flowEvents.length > 0) {
    state = appendFlowEvents(state, params.flowEvents);
  }
  if (params.snapshots && params.snapshots.length > 0) {
    state = appendNavSnapshots(state, params.snapshots);
  }
  return recomputeAccountingMetrics({ existing: state, now: params.now });
}
