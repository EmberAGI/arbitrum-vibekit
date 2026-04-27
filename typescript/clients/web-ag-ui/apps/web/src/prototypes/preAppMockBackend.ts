export const PRE_APP_PROTOTYPE_BACKEND_RULE =
  'Pre-app prototype screens must use mocked backend adapters only. Do not call live wallet, profiler, orchestration, agent-runtime, or Shared Ember services from this flow.';

export type RiskAppetite = 'resting' | 'balanced' | 'bullish';

export type WalletAnalysis = {
  walletAddress: string;
  stableShare: number;
  volatileShare: number;
  activityLevel: 'quiet' | 'active' | 'very-active';
  detectedProtocols: string[];
  notes: string[];
};

export type PortfolioShape = {
  id: string;
  title: string;
  posture: string;
  allocation: Array<{ label: string; percent: number }>;
  defaultMandate: string;
};

const DEFAULT_WALLET = '0x8f12...49b1';

export function normalizePrototypeWallet(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_WALLET;
}

export function analyzeMockWallet(walletAddress: string): WalletAnalysis {
  const normalizedWallet = normalizePrototypeWallet(walletAddress);
  const seed = Array.from(normalizedWallet).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const stableShare = 34 + (seed % 27);
  const volatileShare = 100 - stableShare;
  const activityLevel = seed % 5 === 0 ? 'very-active' : seed % 2 === 0 ? 'active' : 'quiet';
  const detectedProtocols =
    seed % 3 === 0 ? ['Aave', 'Camelot', 'GMX'] : ['Aave', 'Pendle', 'Spot wallet'];

  return {
    walletAddress: normalizedWallet,
    stableShare,
    volatileShare,
    activityLevel,
    detectedProtocols,
    notes: [
      `${stableShare}% of the visible balance can be screened for lending yield.`,
      `${volatileShare}% can stay exposed while lending helps reduce forced selling.`,
      activityLevel === 'quiet'
        ? 'Quiet history suggests a conservative yield-first default can still improve cash drag.'
        : 'Active history suggests Ember can save execution cost by staging actions instead of reacting trade by trade.',
    ],
  };
}

export function recommendMockPortfolioShapes(
  analysis: WalletAnalysis,
  riskAppetite: RiskAppetite,
): PortfolioShape[] {
  const reserve = riskAppetite === 'resting' ? 35 : riskAppetite === 'balanced' ? 22 : 14;
  const lending = Math.max(18, Math.round(analysis.stableShare * 0.58));
  const growth = riskAppetite === 'bullish' ? 42 : riskAppetite === 'balanced' ? 30 : 18;
  const opportunistic = 100 - reserve - lending - growth;

  return [
    {
      id: 'steady-carry',
      title: 'Yield and preserve',
      posture: 'Put idle capital to work and keep long-term winners off the sell list.',
      allocation: [
        { label: 'Reserve', percent: reserve },
        { label: 'Aave lending', percent: lending },
        { label: 'Blue-chip exposure', percent: growth },
        { label: 'Opportunistic lanes', percent: opportunistic },
      ],
      defaultMandate:
        'Default to lending-first automation: earn on stables, borrow cautiously, and avoid selling unless the plan says to.',
    },
    {
      id: 'barbell-growth',
      title: 'Borrow and compound',
      posture: 'Keep conviction exposure while using lending liquidity to fund the next move.',
      allocation: [
        { label: 'Reserve', percent: Math.max(10, reserve - 6) },
        { label: 'Aave lending', percent: Math.max(20, lending - 4) },
        { label: 'Directional ETH/BTC', percent: growth + 10 },
        { label: 'Tactical swaps', percent: Math.max(4, opportunistic) },
      ],
      defaultMandate:
        'Default to Portfolio Agent supervision: use lending to unlock liquidity, then stage swaps only when they improve the net outcome.',
    },
  ];
}
