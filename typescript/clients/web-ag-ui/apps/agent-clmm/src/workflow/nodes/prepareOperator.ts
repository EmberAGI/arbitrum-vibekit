import { ARBITRUM_CHAIN_ID, DEFAULT_TICK_BANDWIDTH_BPS } from '../../config/constants.js';
import { fetchPoolSnapshot } from '../../clients/emberApi.js';
import {
  type ClmmState,
  type ClmmUpdate,
  logInfo,
  normalizeHexAddress,
  type ClmmEvent,
} from '../context.js';
import { type ResolvedOperatorConfig } from '../../domain/types.js';
import { loadBootstrapContext } from '../store.js';

export const prepareOperatorNode = async (state: ClmmState): Promise<ClmmUpdate> => {
  const { operatorInput, allowedPools, camelotClient, clients } = state;
  if (!operatorInput) {
    throw new Error('Operator input missing');
  }
  if (!camelotClient) {
    throw new Error('Camelot client missing');
  }
  if (!clients) {
    throw new Error('Agent wallet context missing');
  }

  const { agentWalletAddress } = await loadBootstrapContext();

  const selectedPoolAddress = normalizeHexAddress(operatorInput.poolAddress, 'pool address');
  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

  const selectedPool =
    allowedPools?.find(
      (pool) => pool.address.toLowerCase() === selectedPoolAddress.toLowerCase(),
    ) ?? (await fetchPoolSnapshot(camelotClient, selectedPoolAddress, ARBITRUM_CHAIN_ID));

  if (!selectedPool) {
    throw new Error(`Pool ${selectedPoolAddress} not available from Ember API`);
  }

  if (agentWalletAddress !== operatorWalletAddress) {
    logInfo('Operator wallet input differs from managed account', {
      operatorWalletAddress,
      agentWalletAddress,
    });
  }

  const operatorConfig: ResolvedOperatorConfig = {
    walletAddress: agentWalletAddress,
    baseContributionUsd: operatorInput.baseContributionUsd ?? 5_000,
    manualBandwidthBps: DEFAULT_TICK_BANDWIDTH_BPS,
    autoCompoundFees: true,
  };

  logInfo('Operator configuration established', {
    poolAddress: selectedPoolAddress,
    operatorWalletAddress,
    agentWalletAddress,
    baseContributionUsd: operatorConfig.baseContributionUsd,
  });

  const events: ClmmEvent[] = [
    {
      type: 'status',
      message: `Managing pool ${selectedPool.token0.symbol}/${selectedPool.token1.symbol} from ${agentWalletAddress}`,
    },
  ];

  return {
    operatorConfig,
    selectedPool,
    lastSnapshot: selectedPool,
    cyclesSinceRebalance: 0,
    staleCycles: 0,
    iteration: 0,
    telemetry: [],
    previousPrice: undefined,
    events,
  };
};
