import { borrowBase } from './borrow.js';
import { repayBase } from './repay.js';
import { supplyBase } from './supply.js';
import { withdrawBase } from './withdraw.js';
import { getUserPositionsBase } from './getUserPositions.js';
import { askEncyclopediaBase } from './askEncyclopedia.js';

// Export all base tools as an array for easy use
export const lendingTools = [
  borrowBase,
  repayBase,
  supplyBase,
  withdrawBase,
  getUserPositionsBase,
  askEncyclopediaBase,
];
