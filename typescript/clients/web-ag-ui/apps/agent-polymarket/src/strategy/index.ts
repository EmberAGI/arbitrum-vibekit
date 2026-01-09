/**
 * Polymarket Strategy - Module Exports
 */

export { scanForOpportunities, filterOpportunities, daysUntilResolution, calculateAnnualizedReturn } from './scanner.js';
export { calculatePositionSize, isPositionViable, optimizeShares, estimateSlippage, type PositionSize } from './evaluator.js';
export { executeArbitrage, type ExecutionResult } from './executor.js';
