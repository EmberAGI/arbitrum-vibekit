export type EconomicExposureInput = {
  asset: string;
  quantity: string;
};

export type AssetSemanticClass = 'cash' | 'asset' | 'liability';
export type ObservedAssetHoldingState = 'in_wallet' | 'deployed' | 'liability';

export type WalletContentInput = {
  asset: string;
  network: string;
  quantity: string;
  valueUsd: number;
  economicExposures?: EconomicExposureInput[];
};

export type OwnedUnitInput = {
  unitId: string;
  rootAsset: string;
  network: string;
  quantity: string;
  benchmarkAsset: string;
  benchmarkValue: number;
  reservationId: string | null;
  positionScopeId?: string | null;
};

export type ReservationAllocationInput = {
  unitId: string;
  quantity: string;
};

export type ReservationInput = {
  reservationId: string;
  agentId: string;
  purpose: string;
  controlPath: string;
  createdAt: string;
  status: 'active' | 'consumed' | 'released' | 'superseded';
  unitAllocations: ReservationAllocationInput[];
};

export type ActivePositionScopeMemberStateInput = {
  withdrawableQuantity?: string | null;
  supplyApr?: string | null;
  borrowApr?: string | null;
};

export type ActivePositionScopeMemberInput = {
  memberId: string;
  role: 'collateral' | 'debt';
  asset: string;
  quantity: string;
  valueUsd: number;
  economicExposures: EconomicExposureInput[];
  state: ActivePositionScopeMemberStateInput;
};

export type ActivePositionScopeInput = {
  scopeId: string;
  kind: string;
  network: string;
  protocolSystem: string;
  containerRef: string;
  status: 'active' | 'closed';
  marketState?: {
    availableBorrowsUsd?: string | null;
    borrowableHeadroomUsd: string;
    currentLtvBps?: number | null;
    liquidationThresholdBps?: number | null;
    healthFactor?: string | null;
  };
  members: ActivePositionScopeMemberInput[];
};

export type AssetCommitmentProjection = {
  reservationId: string;
  agentId: string;
  agentLabel: string;
  quantity: number;
};

export type ObservedAssetProjection = {
  asset: string;
  familyAsset: string;
  network: string;
  quantity: number;
  valueUsd: number;
  sourceKind: 'wallet' | 'position' | 'debt';
  semanticClass: AssetSemanticClass;
  holdingState: ObservedAssetHoldingState;
  protocolSystem?: string;
  protocolLabel?: string;
  statusLabel?: string;
  scopeKind?: string;
  availableQuantity?: number;
  committedQuantity?: number;
  availableUsd?: number;
  committedUsd?: number;
  withdrawableQuantity?: number | null;
  supplyApr?: number | null;
  borrowApr?: number | null;
  economicExposures?: EconomicExposureInput[];
  commitments: AssetCommitmentProjection[];
};

export type AssetFamilyProjection = {
  asset: string;
  network: string;
  semanticClass: AssetSemanticClass;
  positiveUsd: number;
  share: number;
  walletUsd: number;
  deployedUsd: number;
  walletAvailableUsd: number;
  walletCommittedUsd: number;
  debtUsd: number;
  observedAssets: ObservedAssetProjection[];
  commitmentCount: number;
  directCount: number;
  wrapperCount: number;
};

export type AgentTokenExposureProjection = {
  asset: string;
  valueUsd: number;
  share: number;
};

export type AgentAllocationProjection = {
  agentId: string;
  positiveAssetsUsd: number;
  liabilitiesUsd: number;
  grossExposureUsd: number;
  allocationShare: number;
  tokenExposures: AgentTokenExposureProjection[];
  assetFamilies: AssetFamilyProjection[];
};

export type PortfolioSummaryProjection = {
  positiveAssetsUsd: number;
  liabilitiesUsd: number;
  grossExposureUsd: number;
  netWorthUsd: number;
};

export type PortfolioRiskSummaryProjection = {
  totalHeadroomUsd: number;
  minimumLiquidationDistance: number | null;
};

export type PortfolioAccountingProjection = {
  benchmarkAsset: string;
  cashFamilyAsset: string;
  cashUsd: number;
  availableCashUsd: number;
  committedCashUsd: number;
  assetsUsd: number;
  inWalletUsd: number;
  deployedUsd: number;
  liabilitiesUsd: number;
  coverageRatio: number | null;
  marginBufferRatio: number | null;
  distanceToLiquidationRatio: number | null;
};

export type PortfolioProjectionAvailableData = {
  agentPnl: boolean;
  agentTimeWindowPnl: boolean;
  portfolioTimeWindowPnl: boolean;
};

export type PortfolioProjectionPreviewExtensions = {
  topbarPerformance?: {
    dayChangePct: number;
    monthChangePct: number;
  };
  agentPerformanceById?: Record<
    string,
    {
      thirtyDayPnlPct: number;
    }
  >;
};

export type PortfolioProjectionInput = {
  benchmarkAsset: string;
  walletContents: WalletContentInput[];
  reservations: ReservationInput[];
  ownedUnits: OwnedUnitInput[];
  activePositionScopes: ActivePositionScopeInput[];
};

export type PortfolioProjectionPacket = {
  benchmarkAsset: string;
  availableData: PortfolioProjectionAvailableData;
  assetFamilies: AssetFamilyProjection[];
  summary: PortfolioSummaryProjection;
  accounting: PortfolioAccountingProjection;
  risk: PortfolioRiskSummaryProjection;
  agents: {
    portfolio: AgentAllocationProjection;
    specialists: AgentAllocationProjection[];
  };
  previewExtensions?: PortfolioProjectionPreviewExtensions;
};
