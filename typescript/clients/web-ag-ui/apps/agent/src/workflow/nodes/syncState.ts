import type { ClmmState, ClmmUpdate } from '../context.js';

export function syncStateNode(state: ClmmState): ClmmState | ClmmUpdate {
  return state;
}
