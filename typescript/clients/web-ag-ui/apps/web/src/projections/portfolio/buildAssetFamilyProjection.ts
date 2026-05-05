import type {
  ActivePositionScopeInput,
  ActivePositionScopeMemberInput,
  AssetCommitmentProjection,
  AssetFamilyProjection,
  ObservedAssetProjection,
  OwnedUnitInput,
  ReservationInput,
  WalletContentInput,
} from './types';

import {
  classifyAssetFamilySemantic,
  classifyObservedAssetSemantic,
  deriveFamilyAsset,
  formatAgentLabel,
  parseQuantity,
} from './helpers';

function buildCommitmentsByObservedAsset(params: {
  reservations: ReservationInput[];
  ownedUnits: OwnedUnitInput[];
}): Map<string, AssetCommitmentProjection[]> {
  const unitsById = new Map(params.ownedUnits.map((unit) => [unit.unitId, unit]));
  const commitmentsByObservedAsset = new Map<string, AssetCommitmentProjection[]>();

  for (const reservation of params.reservations) {
    if (reservation.status !== 'active') {
      continue;
    }

    for (const allocation of reservation.unitAllocations) {
      const unit = unitsById.get(allocation.unitId);
      if (!unit) {
        continue;
      }
      if (unit.reservationId !== reservation.reservationId) {
        continue;
      }

      const commitments = commitmentsByObservedAsset.get(unit.rootAsset) ?? [];
      commitments.push({
        reservationId: reservation.reservationId,
        agentId: reservation.agentId,
        agentLabel: formatAgentLabel(reservation.agentId),
        quantity: parseQuantity(allocation.quantity),
      });
      commitmentsByObservedAsset.set(unit.rootAsset, commitments);
    }
  }

  return commitmentsByObservedAsset;
}

function buildWalletObservedAssetProjections(params: {
  walletContents: WalletContentInput[];
  commitmentsByObservedAsset: Map<string, AssetCommitmentProjection[]>;
  cashFamilyAsset?: string;
}): ObservedAssetProjection[] {
  return params.walletContents.map((entry) => {
    const quantity = parseQuantity(entry.quantity);
    const priceUsd = quantity > 0 ? entry.valueUsd / quantity : 0;
    const commitments = params.commitmentsByObservedAsset.get(entry.asset) ?? [];
    const committedQuantity = commitments.reduce((sum, commitment) => sum + commitment.quantity, 0);
    const committedUsd = committedQuantity * priceUsd;

    const familyAsset = deriveFamilyAsset({
      asset: entry.asset,
      economicExposures: entry.economicExposures,
    });
    const semantic = classifyObservedAssetSemantic({
      observedAsset: {
        asset: entry.asset,
        familyAsset,
        sourceKind: 'wallet',
      },
      cashFamilyAsset: params.cashFamilyAsset,
    });

    return {
      asset: entry.asset,
      familyAsset,
      network: entry.network,
      quantity,
      ...(entry.displayQuantity !== undefined ? { displayQuantity: entry.displayQuantity } : {}),
      valueUsd: entry.valueUsd,
      sourceKind: 'wallet',
      semanticClass: semantic.semanticClass,
      holdingState: semantic.holdingState,
      availableQuantity: Math.max(0, quantity - committedQuantity),
      committedQuantity,
      availableUsd: Math.max(0, entry.valueUsd - committedUsd),
      committedUsd,
      economicExposures: entry.economicExposures,
      commitments,
    };
  });
}

function buildPositionObservedAssetProjection(input: {
  scope: ActivePositionScopeInput;
  member: ActivePositionScopeMemberInput;
  cashFamilyAsset?: string;
}): ObservedAssetProjection {
  const familyAsset = deriveFamilyAsset({
    asset: input.member.asset,
    economicExposures: input.member.economicExposures,
  });
  const sourceKind = input.member.role === 'debt' ? 'debt' : 'position';
  const semantic = classifyObservedAssetSemantic({
    observedAsset: {
      asset: input.member.asset,
      familyAsset,
      sourceKind,
      protocolSystem: input.scope.protocolSystem,
    },
    cashFamilyAsset: input.cashFamilyAsset,
  });

  return {
    asset: input.member.asset,
    familyAsset,
    network: input.scope.network,
    quantity: parseQuantity(input.member.quantity),
    ...(input.member.displayQuantity !== undefined ? { displayQuantity: input.member.displayQuantity } : {}),
    valueUsd: input.member.valueUsd,
    sourceKind,
    semanticClass: semantic.semanticClass,
    holdingState: semantic.holdingState,
    protocolSystem: input.scope.protocolSystem,
    protocolLabel: semantic.protocolLabel,
    statusLabel: semantic.statusLabel,
    scopeKind: input.scope.kind,
    withdrawableQuantity:
      input.member.state.withdrawableQuantity === undefined
        ? undefined
        : parseQuantity(input.member.state.withdrawableQuantity),
    supplyApr:
      input.member.state.supplyApr === undefined || input.member.state.supplyApr === null
        ? null
        : parseQuantity(input.member.state.supplyApr),
    borrowApr:
      input.member.state.borrowApr === undefined || input.member.state.borrowApr === null
        ? null
        : parseQuantity(input.member.state.borrowApr),
    economicExposures: input.member.economicExposures,
    commitments: [],
  };
}

function buildPositionObservedAssetProjections(params: {
  activePositionScopes: ActivePositionScopeInput[];
  cashFamilyAsset?: string;
}): ObservedAssetProjection[] {
  return params.activePositionScopes
    .filter((scope) => scope.status === 'active')
    .flatMap((scope) =>
      scope.members.map((member) =>
        buildPositionObservedAssetProjection({
          scope,
          member,
          cashFamilyAsset: params.cashFamilyAsset,
        }),
      ),
    );
}

function compareObservedAssets(
  left: ObservedAssetProjection,
  right: ObservedAssetProjection,
): number {
  const sourceOrder = {
    wallet: 0,
    position: 1,
    debt: 2,
  } as const;

  const sourceDelta = sourceOrder[left.sourceKind] - sourceOrder[right.sourceKind];
  if (sourceDelta !== 0) {
    return sourceDelta;
  }

  return right.valueUsd - left.valueUsd;
}

export function buildAssetFamilyProjectionFromObservedAssets(
  observedAssets: ObservedAssetProjection[],
  options?: {
    cashFamilyAsset?: string;
  },
): AssetFamilyProjection[] {
  const totalPositiveUsd = observedAssets.reduce(
    (sum, observedAsset) =>
      observedAsset.sourceKind === 'debt' ? sum : sum + observedAsset.valueUsd,
    0,
  );
  const families = new Map<string, Omit<AssetFamilyProjection, 'share'>>();

  for (const observedAsset of observedAssets) {
    const familyKey = `${observedAsset.network}:${observedAsset.familyAsset}`;
    const currentFamily = families.get(familyKey);

    if (currentFamily) {
      if (observedAsset.sourceKind === 'wallet') {
        currentFamily.positiveUsd += observedAsset.valueUsd;
        currentFamily.walletUsd += observedAsset.valueUsd;
        currentFamily.walletAvailableUsd += observedAsset.availableUsd ?? 0;
        currentFamily.walletCommittedUsd += observedAsset.committedUsd ?? 0;
      } else if (observedAsset.sourceKind === 'position') {
        currentFamily.positiveUsd += observedAsset.valueUsd;
        currentFamily.deployedUsd += observedAsset.valueUsd;
      } else {
        currentFamily.debtUsd += observedAsset.valueUsd;
      }
      currentFamily.observedAssets.push(observedAsset);
      currentFamily.commitmentCount += observedAsset.commitments.length;
      if (observedAsset.sourceKind !== 'debt') {
        currentFamily.directCount += observedAsset.asset === observedAsset.familyAsset ? 1 : 0;
        currentFamily.wrapperCount += observedAsset.asset === observedAsset.familyAsset ? 0 : 1;
      }
      continue;
    }

    families.set(familyKey, {
      asset: observedAsset.familyAsset,
      network: observedAsset.network,
      semanticClass: 'asset',
      positiveUsd: observedAsset.sourceKind === 'debt' ? 0 : observedAsset.valueUsd,
      walletUsd: observedAsset.sourceKind === 'wallet' ? observedAsset.valueUsd : 0,
      deployedUsd: observedAsset.sourceKind === 'position' ? observedAsset.valueUsd : 0,
      walletAvailableUsd:
        observedAsset.sourceKind === 'wallet' ? (observedAsset.availableUsd ?? 0) : 0,
      walletCommittedUsd:
        observedAsset.sourceKind === 'wallet' ? (observedAsset.committedUsd ?? 0) : 0,
      debtUsd: observedAsset.sourceKind === 'debt' ? observedAsset.valueUsd : 0,
      observedAssets: [observedAsset],
      commitmentCount: observedAsset.commitments.length,
      directCount:
        observedAsset.sourceKind !== 'debt' && observedAsset.asset === observedAsset.familyAsset
          ? 1
          : 0,
      wrapperCount:
        observedAsset.sourceKind !== 'debt' && observedAsset.asset !== observedAsset.familyAsset
          ? 1
          : 0,
    });
  }

  return Array.from(families.values())
    .map((family) => ({
      ...family,
      semanticClass: classifyAssetFamilySemantic({
        asset: family.asset,
        positiveUsd: family.positiveUsd,
        debtUsd: family.debtUsd,
        walletAvailableUsd: family.walletAvailableUsd,
        cashFamilyAsset: options?.cashFamilyAsset,
      }),
      share: totalPositiveUsd > 0 ? family.positiveUsd / totalPositiveUsd : 0,
      observedAssets: [...family.observedAssets].sort(compareObservedAssets),
    }))
    .sort((left, right) => right.positiveUsd + right.debtUsd - (left.positiveUsd + left.debtUsd));
}

export function buildAssetFamilyProjection(params: {
  walletContents: WalletContentInput[];
  reservations: ReservationInput[];
  ownedUnits: OwnedUnitInput[];
  activePositionScopes?: ActivePositionScopeInput[];
  cashFamilyAsset?: string;
}): AssetFamilyProjection[] {
  const commitmentsByObservedAsset = buildCommitmentsByObservedAsset({
    reservations: params.reservations,
    ownedUnits: params.ownedUnits,
  });
  const observedAssets = [
    ...buildWalletObservedAssetProjections({
      walletContents: params.walletContents,
      commitmentsByObservedAsset,
      cashFamilyAsset: params.cashFamilyAsset,
    }),
    ...buildPositionObservedAssetProjections({
      activePositionScopes: params.activePositionScopes ?? [],
      cashFamilyAsset: params.cashFamilyAsset,
    }),
  ];

  return buildAssetFamilyProjectionFromObservedAssets(observedAssets, {
    cashFamilyAsset: params.cashFamilyAsset,
  });
}

export function buildObservedAssetProjectionFromPositionMember(input: {
  scope: ActivePositionScopeInput;
  member: ActivePositionScopeMemberInput;
  cashFamilyAsset?: string;
}): ObservedAssetProjection {
  return buildPositionObservedAssetProjection(input);
}
