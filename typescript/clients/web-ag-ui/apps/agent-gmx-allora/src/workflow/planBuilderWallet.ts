import type { ResolvedGmxConfig } from '../domain/types.js';

type WalletSelectionConfig = Pick<
  ResolvedGmxConfig,
  'delegatorWalletAddress' | 'delegateeWalletAddress'
>;

export function resolvePlanBuilderWalletAddress(params: {
  operatorConfig: WalletSelectionConfig;
  delegationsBypassActive: boolean;
}): `0x${string}` {
  return params.delegationsBypassActive
    ? params.operatorConfig.delegateeWalletAddress
    : params.operatorConfig.delegatorWalletAddress;
}
