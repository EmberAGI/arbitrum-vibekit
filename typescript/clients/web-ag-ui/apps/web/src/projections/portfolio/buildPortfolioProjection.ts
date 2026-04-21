import {
  buildAssetFamilyProjection,
  buildAssetFamilyProjectionFromObservedAssets,
  buildObservedAssetProjectionFromPositionMember,
} from './buildAssetFamilyProjection';
import {
  deriveFamilyAsset,
  normalizeBenchmarkAssetToCashFamily,
  parseQuantity,
} from './helpers';
import type {
  ActivePositionScopeInput,
  AgentAllocationProjection,
  AgentTokenExposureProjection,
  AssetFamilyProjection,
  AssetCommitmentProjection,
  ObservedAssetProjection,
  OwnedUnitInput,
  PortfolioAccountingProjection,
  PortfolioProjectionInput,
  PortfolioProjectionPacket,
  PortfolioRiskSummaryProjection,
  PortfolioSummaryProjection,
  ReservationInput,
  WalletContentInput,
} from './types';

type AgentExposureLedger = {
  positiveLedger: Map<string, number>;
  liabilitiesLedger: Map<string, number>;
};

function buildSummaryProjection(assetFamilies: AssetFamilyProjection[]): PortfolioSummaryProjection {
  const positiveAssetsUsd = assetFamilies.reduce((sum, familyView) => sum + familyView.positiveUsd, 0);
  const liabilitiesUsd = assetFamilies.reduce((sum, familyView) => sum + familyView.debtUsd, 0);

  return {
    positiveAssetsUsd,
    liabilitiesUsd,
    grossExposureUsd: positiveAssetsUsd + liabilitiesUsd,
    netWorthUsd: positiveAssetsUsd - liabilitiesUsd,
  };
}

function buildRiskSummaryProjection(
  activePositionScopes: ActivePositionScopeInput[],
): PortfolioRiskSummaryProjection {
  const activeScopes = activePositionScopes.filter((scope) => scope.status === 'active');
  const totalHeadroomUsd = activeScopes.reduce(
    (sum, scope) => sum + parseQuantity(scope.marketState?.borrowableHeadroomUsd),
    0,
  );
  const minimumLiquidationDistance = activeScopes.reduce<number | null>((currentMinimum, scope) => {
    const currentLtvBps = scope.marketState?.currentLtvBps;
    const liquidationThresholdBps = scope.marketState?.liquidationThresholdBps;

    if (
      currentLtvBps === undefined ||
      currentLtvBps === null ||
      liquidationThresholdBps === undefined ||
      liquidationThresholdBps === null ||
      liquidationThresholdBps <= 0
    ) {
      return currentMinimum;
    }

    const distance = Math.max(0, (liquidationThresholdBps - currentLtvBps) / liquidationThresholdBps);

    return currentMinimum === null ? distance : Math.min(currentMinimum, distance);
  }, null);

  return {
    totalHeadroomUsd,
    minimumLiquidationDistance,
  };
}

function buildAccountingProjection(params: {
  benchmarkAsset: string;
  assetFamilies: AssetFamilyProjection[];
  risk: PortfolioRiskSummaryProjection;
}): PortfolioAccountingProjection {
  const familyViewByAsset = new Map(params.assetFamilies.map((familyView) => [familyView.asset, familyView]));
  const cashFamilyAsset = normalizeBenchmarkAssetToCashFamily(params.benchmarkAsset);
  const cashFamilyView = familyViewByAsset.get(cashFamilyAsset);
  const cashUsd = cashFamilyView?.walletUsd ?? 0;
  const availableCashUsd = cashFamilyView?.walletAvailableUsd ?? 0;
  const committedCashUsd = cashFamilyView?.walletCommittedUsd ?? 0;
  const totalWalletUsd = params.assetFamilies.reduce((sum, familyView) => sum + familyView.walletUsd, 0);
  const totalDeployedUsd = params.assetFamilies.reduce((sum, familyView) => sum + familyView.deployedUsd, 0);
  const inWalletUsd = Math.max(0, totalWalletUsd - cashUsd);
  const assetsUsd = inWalletUsd + totalDeployedUsd;
  const liabilitiesUsd = params.assetFamilies.reduce((sum, familyView) => sum + familyView.debtUsd, 0);

  return {
    benchmarkAsset: params.benchmarkAsset,
    cashFamilyAsset,
    cashUsd,
    availableCashUsd,
    committedCashUsd,
    assetsUsd,
    inWalletUsd,
    deployedUsd: totalDeployedUsd,
    liabilitiesUsd,
    coverageRatio: liabilitiesUsd > 0 ? availableCashUsd / liabilitiesUsd : null,
    marginBufferRatio: assetsUsd + cashUsd > 0 ? params.risk.totalHeadroomUsd / (assetsUsd + cashUsd) : null,
    distanceToLiquidationRatio: params.risk.minimumLiquidationDistance,
  };
}

function buildOwnedUnitFamilyAsset(params: {
  ownedUnit: OwnedUnitInput;
  activePositionScopes: ActivePositionScopeInput[];
}): string {
  if (!params.ownedUnit.positionScopeId) {
    return params.ownedUnit.rootAsset;
  }

  const scope = params.activePositionScopes.find((candidate) => candidate.scopeId === params.ownedUnit.positionScopeId);
  const member = scope?.members.find((candidate) => candidate.asset === params.ownedUnit.rootAsset);

  return deriveFamilyAsset({
    asset: params.ownedUnit.rootAsset,
    economicExposures: member?.economicExposures,
  });
}

function buildControllingAgentIdsByScopeId(params: {
  ownedUnits: OwnedUnitInput[];
  reservations: ReservationInput[];
}): Map<string, Set<string>> {
  const reservationsById = new Map(params.reservations.map((reservation) => [reservation.reservationId, reservation]));
  const controllingAgentIdsByScopeId = new Map<string, Set<string>>();

  for (const unit of params.ownedUnits) {
    if (!unit.positionScopeId || !unit.reservationId) {
      continue;
    }

    const reservation = reservationsById.get(unit.reservationId);
    if (!reservation || reservation.status !== 'active') {
      continue;
    }

    const agentIds = controllingAgentIdsByScopeId.get(unit.positionScopeId) ?? new Set<string>();
    agentIds.add(reservation.agentId);
    controllingAgentIdsByScopeId.set(unit.positionScopeId, agentIds);
  }

  return controllingAgentIdsByScopeId;
}

function buildAgentLedgers(params: {
  ownedUnits: OwnedUnitInput[];
  reservations: ReservationInput[];
  activePositionScopes: ActivePositionScopeInput[];
}): Map<string, AgentExposureLedger> {
  const reservationsById = new Map(params.reservations.map((reservation) => [reservation.reservationId, reservation]));
  const ledgers = new Map<string, AgentExposureLedger>();
  const controllingAgentIdsByScopeId = buildControllingAgentIdsByScopeId({
    ownedUnits: params.ownedUnits,
    reservations: params.reservations,
  });

  for (const unit of params.ownedUnits) {
    if (!unit.reservationId) {
      continue;
    }

    const reservation = reservationsById.get(unit.reservationId);
    if (!reservation || reservation.status !== 'active') {
      continue;
    }

    const ledger = ledgers.get(reservation.agentId) ?? {
      positiveLedger: new Map<string, number>(),
      liabilitiesLedger: new Map<string, number>(),
    };
    const familyAsset = buildOwnedUnitFamilyAsset({
      ownedUnit: unit,
      activePositionScopes: params.activePositionScopes,
    });
    ledger.positiveLedger.set(familyAsset, (ledger.positiveLedger.get(familyAsset) ?? 0) + unit.benchmarkValue);
    ledgers.set(reservation.agentId, ledger);
  }

  for (const scope of params.activePositionScopes) {
    if (scope.status !== 'active') {
      continue;
    }

    const controllingAgentIds = controllingAgentIdsByScopeId.get(scope.scopeId);
    if (!controllingAgentIds || controllingAgentIds.size !== 1) {
      continue;
    }

    const agentId = Array.from(controllingAgentIds)[0];
    if (!agentId) {
      continue;
    }

    const ledger = ledgers.get(agentId) ?? {
      positiveLedger: new Map<string, number>(),
      liabilitiesLedger: new Map<string, number>(),
    };

    for (const member of scope.members) {
      if (member.role !== 'debt' || member.valueUsd <= 0) {
        continue;
      }

      const familyAsset = deriveFamilyAsset({
        asset: member.asset,
        economicExposures: member.economicExposures,
      });
      ledger.liabilitiesLedger.set(familyAsset, (ledger.liabilitiesLedger.get(familyAsset) ?? 0) + member.valueUsd);
    }

    ledgers.set(agentId, ledger);
  }

  return ledgers;
}

function buildDirectControlledObservedAsset(input: {
  ownedUnit: OwnedUnitInput;
  agentId: string;
  cashFamilyAsset: string;
}): ObservedAssetProjection {
  const quantity = parseQuantity(input.ownedUnit.quantity);
  const commitment: AssetCommitmentProjection = {
    reservationId: input.ownedUnit.reservationId ?? '',
    agentId: input.agentId,
    agentLabel: input.agentId.replace(/^agent-/, ''),
    quantity,
  };

  return {
    asset: input.ownedUnit.rootAsset,
    familyAsset: input.ownedUnit.rootAsset,
    network: input.ownedUnit.network,
    quantity,
    valueUsd: input.ownedUnit.benchmarkValue,
    sourceKind: 'wallet',
    semanticClass: input.ownedUnit.rootAsset === input.cashFamilyAsset ? 'cash' : 'asset',
    holdingState: 'in_wallet',
    availableQuantity: 0,
    committedQuantity: quantity,
    availableUsd: 0,
    committedUsd: input.ownedUnit.benchmarkValue,
    commitments: [commitment],
  };
}

function buildAgentAssetFamilies(params: {
  agentId: string;
  ownedUnits: OwnedUnitInput[];
  reservations: ReservationInput[];
  activePositionScopes: ActivePositionScopeInput[];
  cashFamilyAsset: string;
}): AssetFamilyProjection[] {
  const reservationsById = new Map(params.reservations.map((reservation) => [reservation.reservationId, reservation]));
  const controllingAgentIdsByScopeId = buildControllingAgentIdsByScopeId({
    ownedUnits: params.ownedUnits,
    reservations: params.reservations,
  });
  const observedAssets: ObservedAssetProjection[] = [];
  const includedScopeIds = new Set<string>();

  for (const unit of params.ownedUnits) {
    if (!unit.reservationId) {
      continue;
    }

    const reservation = reservationsById.get(unit.reservationId);
    if (!reservation || reservation.status !== 'active' || reservation.agentId !== params.agentId) {
      continue;
    }

    if (!unit.positionScopeId) {
      observedAssets.push(
        buildDirectControlledObservedAsset({
          ownedUnit: unit,
          agentId: params.agentId,
          cashFamilyAsset: params.cashFamilyAsset,
        }),
      );
      continue;
    }

    if (includedScopeIds.has(unit.positionScopeId)) {
      continue;
    }

    const controllingAgentIds = controllingAgentIdsByScopeId.get(unit.positionScopeId);
    if (!controllingAgentIds || controllingAgentIds.size !== 1 || !controllingAgentIds.has(params.agentId)) {
      continue;
    }

    const scope = params.activePositionScopes.find(
      (candidate) => candidate.scopeId === unit.positionScopeId && candidate.status === 'active',
    );
    if (!scope) {
      continue;
    }

    observedAssets.push(
      ...scope.members.map((member) =>
        buildObservedAssetProjectionFromPositionMember({
          scope,
          member,
          cashFamilyAsset: params.cashFamilyAsset,
        }),
      ),
    );
    includedScopeIds.add(unit.positionScopeId);
  }

  return buildAssetFamilyProjectionFromObservedAssets(observedAssets, {
    cashFamilyAsset: params.cashFamilyAsset,
  });
}

function buildTokenExposures(ledger: AgentExposureLedger): AgentTokenExposureProjection[] {
  const combinedLedger = new Map<string, number>();

  for (const [asset, valueUsd] of ledger.positiveLedger.entries()) {
    combinedLedger.set(asset, (combinedLedger.get(asset) ?? 0) + valueUsd);
  }

  for (const [asset, valueUsd] of ledger.liabilitiesLedger.entries()) {
    combinedLedger.set(asset, (combinedLedger.get(asset) ?? 0) + valueUsd);
  }

  const totalUsd = Array.from(combinedLedger.values()).reduce((sum, valueUsd) => sum + valueUsd, 0);

  return Array.from(combinedLedger.entries())
    .map(([asset, valueUsd]) => ({
      asset,
      valueUsd,
      share: totalUsd > 0 ? valueUsd / totalUsd : 0,
    }))
    .sort((left, right) => right.valueUsd - left.valueUsd);
}

function buildAgentAllocations(params: {
  assetFamilies: AssetFamilyProjection[];
  reservations: ReservationInput[];
  ownedUnits: OwnedUnitInput[];
  activePositionScopes: ActivePositionScopeInput[];
  summary: PortfolioSummaryProjection;
  cashFamilyAsset: string;
}): {
  portfolio: AgentAllocationProjection;
  specialists: AgentAllocationProjection[];
} {
  const portfolio = {
    agentId: 'portfolio-agent',
    positiveAssetsUsd: params.summary.positiveAssetsUsd,
    liabilitiesUsd: params.summary.liabilitiesUsd,
    grossExposureUsd: params.summary.grossExposureUsd,
    allocationShare: 1,
    assetFamilies: params.assetFamilies,
    tokenExposures: params.assetFamilies
      .filter((familyView) => familyView.positiveUsd + familyView.debtUsd > 0)
      .map((familyView) => ({
        asset: familyView.asset,
        valueUsd: familyView.positiveUsd + familyView.debtUsd,
        share:
          params.summary.grossExposureUsd > 0
            ? (familyView.positiveUsd + familyView.debtUsd) / params.summary.grossExposureUsd
            : 0,
      }))
      .sort((left, right) => right.valueUsd - left.valueUsd),
  };

  const specialists = Array.from(
    buildAgentLedgers({
      ownedUnits: params.ownedUnits,
      reservations: params.reservations,
      activePositionScopes: params.activePositionScopes,
    }).entries(),
  )
    .map(([agentId, ledger]) => {
      const assetFamilies = buildAgentAssetFamilies({
        agentId,
        ownedUnits: params.ownedUnits,
        reservations: params.reservations,
        activePositionScopes: params.activePositionScopes,
        cashFamilyAsset: params.cashFamilyAsset,
      });
      const tokenExposures = buildTokenExposures(ledger);
      const positiveAssetsUsd = Array.from(ledger.positiveLedger.values()).reduce((sum, valueUsd) => sum + valueUsd, 0);
      const liabilitiesUsd = Array.from(ledger.liabilitiesLedger.values()).reduce((sum, valueUsd) => sum + valueUsd, 0);
      const grossExposureUsd = positiveAssetsUsd + liabilitiesUsd;

      return {
        agentId,
        positiveAssetsUsd,
        liabilitiesUsd,
        grossExposureUsd,
        allocationShare:
          params.summary.grossExposureUsd > 0 ? grossExposureUsd / params.summary.grossExposureUsd : 0,
        assetFamilies,
        tokenExposures,
      };
    })
    .sort((left, right) => right.grossExposureUsd - left.grossExposureUsd);

  return {
    portfolio,
    specialists,
  };
}

export function buildPortfolioProjection(params: PortfolioProjectionInput): PortfolioProjectionPacket {
  const cashFamilyAsset = normalizeBenchmarkAssetToCashFamily(params.benchmarkAsset);
  const assetFamilies = buildAssetFamilyProjection({
    walletContents: params.walletContents,
    reservations: params.reservations,
    ownedUnits: params.ownedUnits,
    activePositionScopes: params.activePositionScopes,
    cashFamilyAsset,
  });
  const summary = buildSummaryProjection(assetFamilies);
  const risk = buildRiskSummaryProjection(params.activePositionScopes);
  const accounting = buildAccountingProjection({
    benchmarkAsset: params.benchmarkAsset,
    assetFamilies,
    risk,
  });
  const agents = buildAgentAllocations({
    assetFamilies,
    reservations: params.reservations,
    ownedUnits: params.ownedUnits,
    activePositionScopes: params.activePositionScopes,
    summary,
    cashFamilyAsset,
  });

  return {
    benchmarkAsset: params.benchmarkAsset,
    availableData: {
      agentPnl: false,
      agentTimeWindowPnl: false,
      portfolioTimeWindowPnl: false,
    },
    assetFamilies,
    summary,
    accounting,
    risk,
    agents,
  };
}
