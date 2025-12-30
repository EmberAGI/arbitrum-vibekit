import type { AccountingState, NavSnapshot } from './types.js';

const MAX_NAV_SNAPSHOTS = 240; // ~2 hours at 30s cadence

export function appendNavSnapshots(
  existing: AccountingState | undefined,
  snapshots: NavSnapshot[],
): AccountingState {
  const base: AccountingState = existing ?? { navSnapshots: [], latestNavSnapshot: undefined };
  const merged = [...base.navSnapshots, ...snapshots];
  const trimmed =
    merged.length > MAX_NAV_SNAPSHOTS ? merged.slice(merged.length - MAX_NAV_SNAPSHOTS) : merged;
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : base.latestNavSnapshot;

  return {
    navSnapshots: trimmed,
    latestNavSnapshot: latest,
    lastUpdated: latest?.timestamp ?? base.lastUpdated,
  };
}
