import { ARBITRUM_CHAIN_ID } from '../../config/constants.js';
import { buildPoolArtifact } from '../artifacts.js';
import { logInfo, type ClmmEvent, type ClmmState, type ClmmUpdate } from '../context.js';
import { isPoolAllowed } from '../pools.js';

export const listPoolsNode = async (state: ClmmState): Promise<ClmmUpdate> => {
  if (!state.camelotClient) {
    throw new Error('Camelot client not initialized');
  }
  const pools = await state.camelotClient.listCamelotPools(ARBITRUM_CHAIN_ID);
  const allowedPools = pools.filter((pool) => isPoolAllowed(pool, state.mode ?? 'debug'));
  logInfo('Retrieved Camelot pools', {
    total: pools.length,
    allowed: allowedPools.length,
    mode: state.mode,
  });
  if (allowedPools.length === 0) {
    throw new Error(`No Camelot pools available for mode=${state.mode}`);
  }

  const poolArtifact = buildPoolArtifact(allowedPools.slice(0, 8));
  const events: ClmmEvent[] = [
    { type: 'artifact', artifact: poolArtifact },
    {
      type: 'status',
      message: `Discovered ${allowedPools.length}/${pools.length} allowed Camelot pools`,
    },
  ];

  return {
    pools,
    allowedPools,
    poolArtifact,
    events,
  };
};
