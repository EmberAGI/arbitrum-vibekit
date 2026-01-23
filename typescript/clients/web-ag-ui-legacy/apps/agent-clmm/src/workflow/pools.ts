import { DEFAULT_DEBUG_ALLOWED_TOKENS } from '../config/constants.js';
import { type CamelotPool } from '../domain/types.js';

export function isPoolAllowed(pool: CamelotPool, mode: 'debug' | 'production') {
  if (mode === 'production') {
    return true;
  }
  return (
    DEFAULT_DEBUG_ALLOWED_TOKENS.has(pool.token0.address.toLowerCase()) ||
    DEFAULT_DEBUG_ALLOWED_TOKENS.has(pool.token1.address.toLowerCase())
  );
}
