import type { ChainConfig } from '../../chainConfig.js';
import type { PublicEmberPluginRegistry } from '../../registry.js';
import type {
  ActionDefinition,
  BridgeActions,
  EmberPlugin,
  BridgeDepositRequest,
  BridgeDepositResponse,
  BridgeWithdrawRequest,
  BridgeWithdrawResponse,
} from '../../core/index.js';
import { ArbitrumBridgeAdapter } from './adapter.js';

export function registerArbitrumBridge(
  chainConfig: ChainConfig,
  registry: PublicEmberPluginRegistry
) {
  const supportedParents = [1, 11155111]; // Ethereum mainnet, Sepolia
  const supportedChildren = [42161, 421614]; // Arbitrum One, Arbitrum Sepolia

  // Register only when chain is a known Arbitrum child network
  if (!supportedChildren.includes(chainConfig.chainId)) return;

  registry.registerDeferredPlugin(getArbitrumBridgePlugin(chainConfig));
}

export async function getArbitrumBridgePlugin(
  chainConfig: ChainConfig
): Promise<EmberPlugin<'bridge'>> {
  const adapter = new ArbitrumBridgeAdapter({
    chainId: chainConfig.chainId,
    rpcUrl: chainConfig.rpcUrl,
    wrappedNativeToken: chainConfig.wrappedNativeToken,
  });

  const actions: ActionDefinition<BridgeActions>[] = [
    {
      type: 'bridge-deposit',
      name: `Arbitrum bridge deposit on ${chainConfig.chainId}`,
      inputTokens: adapter.getDepositInputTokens.bind(adapter),
      outputTokens: adapter.getDepositOutputTokens.bind(adapter),
      callback: (req: BridgeDepositRequest): Promise<BridgeDepositResponse> =>
        adapter.createDepositTransactions(req),
    },
    {
      type: 'bridge-withdraw',
      name: `Arbitrum bridge withdraw on ${chainConfig.chainId}`,
      inputTokens: adapter.getWithdrawInputTokens.bind(adapter),
      outputTokens: adapter.getWithdrawOutputTokens.bind(adapter),
      callback: (req: BridgeWithdrawRequest): Promise<BridgeWithdrawResponse> =>
        adapter.createWithdrawTransactions(req),
    },
  ];

  return {
    id: `ARBITRUM_BRIDGE_${chainConfig.chainId}`,
    type: 'bridge',
    name: `Arbitrum Bridge (${chainConfig.chainId})`,
    description: 'ETH & ERC20 bridging between parent and Arbitrum child chains',
    actions,
    queries: {
      getMessageStatus: adapter.getMessageStatus.bind(adapter),
    },
  };
}


