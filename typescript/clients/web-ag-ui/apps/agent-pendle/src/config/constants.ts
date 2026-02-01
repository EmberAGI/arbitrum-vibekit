export const ARBITRUM_CHAIN_ID = 42161;

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_STREAM_LIMIT = -1;
const DEFAULT_STATE_HISTORY_LIMIT = 100;

function resolveNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolvePollIntervalMs(): number {
  return resolveNumber(process.env['PENDLE_POLL_INTERVAL_MS'], DEFAULT_POLL_INTERVAL_MS);
}

export function resolveStreamLimit(): number {
  const raw = process.env['PENDLE_STREAM_LIMIT'];
  if (!raw) {
    return DEFAULT_STREAM_LIMIT;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_STREAM_LIMIT;
  }
  return Math.trunc(parsed);
}

export function resolveStateHistoryLimit(): number {
  return resolveNumber(process.env['PENDLE_STATE_HISTORY_LIMIT'], DEFAULT_STATE_HISTORY_LIMIT);
}
