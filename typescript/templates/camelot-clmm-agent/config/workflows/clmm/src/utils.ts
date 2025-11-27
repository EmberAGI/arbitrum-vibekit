export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatPercent(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  return `${value.toFixed(digits)}%`;
}

export function clamp<T extends number>(value: T, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
