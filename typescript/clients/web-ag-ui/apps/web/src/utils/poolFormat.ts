import type { Pool } from '../types/agent';

export function formatPoolPair(pool?: Pool): string {
  const token0 = pool?.token0?.symbol;
  const token1 = pool?.token1?.symbol;

  if (typeof token0 !== 'string' || token0.length === 0) return '—';
  if (typeof token1 !== 'string' || token1.length === 0) return '—';

  return `${token0}/${token1}`;
}

