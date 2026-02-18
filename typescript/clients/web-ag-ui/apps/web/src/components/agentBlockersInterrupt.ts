export type BlockersInterruptKind =
  | 'operator-config'
  | 'pendle-setup'
  | 'pendle-fund-wallet'
  | 'gmx-fund-wallet'
  | 'gmx-setup'
  | 'funding-token'
  | 'delegation-signing'
  | 'none';

export function resolveBlockersInterruptView(input: {
  interruptType: string | null | undefined;
  maxSetupStep: number;
}): {
  kind: BlockersInterruptKind;
  interruptStep: number | null;
} {
  switch (input.interruptType) {
    case 'operator-config-request':
      return { kind: 'operator-config', interruptStep: 1 };
    case 'pendle-setup-request':
      return { kind: 'pendle-setup', interruptStep: 1 };
    case 'gmx-setup-request':
      return { kind: 'gmx-setup', interruptStep: 1 };
    case 'pendle-fund-wallet-request':
      return { kind: 'pendle-fund-wallet', interruptStep: 2 };
    case 'gmx-fund-wallet-request':
      return { kind: 'gmx-fund-wallet', interruptStep: input.maxSetupStep };
    case 'clmm-funding-token-request':
    case 'pendle-funding-token-request':
    case 'gmx-funding-token-request':
      return { kind: 'funding-token', interruptStep: 2 };
    case 'clmm-delegation-signing-request':
    case 'pendle-delegation-signing-request':
    case 'gmx-delegation-signing-request':
      return { kind: 'delegation-signing', interruptStep: 3 };
    default:
      return { kind: 'none', interruptStep: null };
  }
}
