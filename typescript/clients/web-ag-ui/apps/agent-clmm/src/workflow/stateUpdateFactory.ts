import { buildStateUpdate } from 'pi-runtime-legacy-contracts';

import { logClmmStateEmission } from './context.js';

export const buildLoggedStateUpdate = <TUpdate extends Record<string, unknown>>(
  origin: string,
  update: TUpdate,
): TUpdate => {
  const nextUpdate = buildStateUpdate(update);
  logClmmStateEmission({
    source: 'state-update',
    origin,
    update: nextUpdate,
  });
  return nextUpdate;
};
