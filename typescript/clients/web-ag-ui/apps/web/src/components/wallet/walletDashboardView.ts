import { formatUnits } from 'viem';

import type {
  DashboardAccountingView,
  DashboardTopbarView,
  DashboardTreemapItem,
} from '@/components/dashboard/dashboardTypes';
import type {
  AssetFamilyProjection,
  ObservedAssetProjection,
  PortfolioProjectionInput,
  PortfolioProjectionPacket,
} from '@/projections/portfolio/types';

import type { WalletPortfolioView } from './WalletManagementView';

export type WalletDashboardView = {
  summary: {
    cashUsd: number;
    deployedUsd: number;
    liabilitiesUsd: number;
    positiveAssetsUsd: number;
    grossExposureUsd: number;
    netWorthUsd: number;
    activeLaneCount: number;
  };
  topbar: DashboardTopbarView;
  accounting: DashboardAccountingView;
  contents: WalletContentsView;
  treemapItems: DashboardTreemapItem[];
};

export type WalletContentsView = {
  summary: {
    grossExposureUsd: number;
    walletUsd: number;
    deployedUsd: number;
    owedUsd: number;
    unpricedLaneCount: number;
  };
  compositionSegments: {
    label: string;
    valueUsd: number;
    share: number;
    colorHex: string;
  }[];
  families: WalletContentsFamilyView[];
  featuredFamilies: WalletContentsFamilyView[];
  tailFamilies: WalletContentsFamilyView[];
};

export type WalletContentsFamilyView = {
  id: string;
  label: string;
  walletUsd: number;
  deployedUsd: number;
  owedUsd: number;
  positiveUsd: number;
  grossExposureUsd: number;
  share: number;
  lines: {
    id: string;
    label: string;
    tone: 'wallet' | 'deployed' | 'owed';
    valueUsd: number;
  }[];
};

const STABLECOIN_SYMBOLS = new Set(['USDC', 'USDT', 'DAI', 'USDE', 'USDAI', 'SUSDAI', 'USD3', 'RUSD', 'NUSD']);
const TREEMAP_BASE_TONE = {
  cash: {
    toneStyle: { background: 'linear-gradient(135deg,#166534 0%,#22c55e 100%)', color: '#F7FFF9' },
    hoverToneStyle: { background: 'linear-gradient(135deg,#15803d 0%,#4ade80 100%)', color: '#F7FFF9' },
  },
  asset: {
    toneStyle: { background: 'linear-gradient(135deg,#1f2937 0%,#475569 100%)', color: '#F8FAFC' },
    hoverToneStyle: { background: 'linear-gradient(135deg,#111827 0%,#334155 100%)', color: '#F8FAFC' },
  },
  liability: {
    toneStyle: { background: 'linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)', color: '#FFF7F7' },
    hoverToneStyle: { background: 'linear-gradient(135deg,#991b1b 0%,#ef4444 100%)', color: '#FFF7F7' },
  },
} as const;

export function parseUsdNotional(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  if (/^-?\d+\.\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (/^-?\d+$/.test(trimmed) && trimmed.replace('-', '').length >= 16) {
    try {
      return Number(formatUnits(BigInt(trimmed), 18));
    } catch {
      return 0;
    }
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildWalletDashboardView(
  input:
    | {
        portfolioProjection: PortfolioProjectionPacket;
        portfolioProjectionInput?: PortfolioProjectionInput;
      }
    | {
        portfolio: WalletPortfolioView;
      },
): WalletDashboardView {
  if ('portfolioProjection' in input) {
    return buildWalletDashboardViewFromProjection(input.portfolioProjection, input.portfolioProjectionInput);
  }

  return buildLegacyWalletDashboardView(input.portfolio);
}

function buildWalletDashboardViewFromProjection(
  portfolio: PortfolioProjectionPacket,
  projectionInput?: PortfolioProjectionInput,
): WalletDashboardView {
  const cashUsd = portfolio.accounting.cashUsd;
  const deployedUsd = portfolio.accounting.deployedUsd;
  const liabilitiesUsd = portfolio.accounting.liabilitiesUsd;
  const positiveAssetsUsd = portfolio.summary.positiveAssetsUsd;
  const grossExposureUsd = portfolio.summary.grossExposureUsd;
  const netWorthUsd = portfolio.summary.netWorthUsd;
  const activeLaneCount =
    projectionInput?.activePositionScopes.length ??
    portfolio.assetFamilies.reduce(
      (count, family) => count + family.observedAssets.filter((asset) => asset.sourceKind !== 'wallet').length,
      0,
    );
  const topbar = buildProjectionTopbarView(portfolio);
  const accounting = buildProjectionAccountingView(portfolio);
  const contents = buildProjectionContentsView(portfolio);

  return {
    summary: {
      cashUsd,
      deployedUsd,
      liabilitiesUsd,
      positiveAssetsUsd,
      grossExposureUsd,
      netWorthUsd,
      activeLaneCount,
    },
    topbar,
    accounting,
    contents,
    treemapItems: buildProjectionTreemapItems(portfolio),
  };
}

function buildProjectionTopbarView(
  portfolio: PortfolioProjectionPacket,
): DashboardTopbarView {
  return {
    benchmarkAssetLabel: portfolio.accounting.cashFamilyAsset,
    metrics: [
      {
        label: 'Gross exposure',
        value: formatUsdCompact(portfolio.summary.grossExposureUsd),
        positiveAssetsValue: formatUsdCompact(portfolio.summary.positiveAssetsUsd),
        liabilitiesValue: formatUsdCompact(portfolio.summary.liabilitiesUsd),
      },
      {
        label: 'Net worth',
        value: formatUsdCompact(portfolio.summary.netWorthUsd),
      },
      {
        label: 'Unallocated',
        value: formatUsdCompact(portfolio.accounting.availableCashUsd),
        valueClassName: 'text-[#0F5A38]',
      },
    ],
  };
}

function buildProjectionAccountingView(portfolio: PortfolioProjectionPacket): DashboardAccountingView {
  const {
    cashUsd,
    availableCashUsd,
    committedCashUsd,
    assetsUsd,
    inWalletUsd,
    deployedUsd,
    liabilitiesUsd,
    coverageRatio,
    marginBufferRatio,
    distanceToLiquidationRatio,
  } = portfolio.accounting;
  const totalBookUsd = cashUsd + assetsUsd + liabilitiesUsd;

  return {
    segments: [
      {
        label: 'Cash',
        valueUsd: cashUsd,
        meter: `${totalBookUsd > 0 ? (cashUsd / totalBookUsd) * 100 : 0}%`,
        fillClassName: 'bg-[#4DD999]',
        valueClassName: 'text-[#4DD999]',
        detail: `${formatUsdCompact(availableCashUsd)} unmanaged · ${formatUsdCompact(committedCashUsd)} managed`,
      },
      {
        label: 'Assets',
        valueUsd: assetsUsd,
        meter: `${totalBookUsd > 0 ? (assetsUsd / totalBookUsd) * 100 : 0}%`,
        fillClassName: 'bg-[#178B5D]',
        valueClassName: 'text-[#178B5D]',
        detail: `${formatUsdCompact(inWalletUsd)} in wallet · ${formatUsdCompact(deployedUsd)} deployed`,
      },
      {
        label: 'Liabilities',
        valueUsd: liabilitiesUsd,
        meter: `${totalBookUsd > 0 ? (liabilitiesUsd / totalBookUsd) * 100 : 0}%`,
        fillClassName: 'bg-[#B23A32]',
        valueClassName: 'text-[#B23A32]',
      },
    ],
    stats: [
      {
        label: 'Coverage',
        value: coverageRatio === null ? 'No debt' : formatPercent(coverageRatio),
      },
      {
        label: 'Margin buffer',
        value: marginBufferRatio === null ? '0%' : formatPercent(marginBufferRatio),
      },
      {
        label: 'Distance to liquidation',
        value: distanceToLiquidationRatio === null ? 'N/A' : formatPercent(distanceToLiquidationRatio),
        valueClassName:
          distanceToLiquidationRatio !== null && distanceToLiquidationRatio < 0.2 ? 'text-[#B23A32]' : undefined,
      },
    ],
  };
}

function buildProjectionContentsView(portfolio: PortfolioProjectionPacket): WalletContentsView {
  const grossExposureUsd = portfolio.summary.grossExposureUsd;
  const totalWalletUsd = portfolio.accounting.cashUsd + portfolio.accounting.inWalletUsd;
  const families = portfolio.assetFamilies.map((family) => buildProjectionFamilyView(family, grossExposureUsd));

  return {
    summary: {
      grossExposureUsd,
      walletUsd: totalWalletUsd,
      deployedUsd: portfolio.accounting.deployedUsd,
      owedUsd: portfolio.accounting.liabilitiesUsd,
      unpricedLaneCount: 0,
    },
    compositionSegments: [
      {
        label: 'Cash',
        valueUsd: portfolio.accounting.cashUsd,
        share: grossExposureUsd > 0 ? portfolio.accounting.cashUsd / grossExposureUsd : 0,
        colorHex: '#4DD999',
      },
      {
        label: 'In wallet',
        valueUsd: portfolio.accounting.inWalletUsd,
        share: grossExposureUsd > 0 ? portfolio.accounting.inWalletUsd / grossExposureUsd : 0,
        colorHex: '#A7F3D0',
      },
      {
        label: 'Deployed',
        valueUsd: portfolio.accounting.deployedUsd,
        share: grossExposureUsd > 0 ? portfolio.accounting.deployedUsd / grossExposureUsd : 0,
        colorHex: '#178B5D',
      },
      {
        label: 'Owed',
        valueUsd: portfolio.accounting.liabilitiesUsd,
        share: grossExposureUsd > 0 ? portfolio.accounting.liabilitiesUsd / grossExposureUsd : 0,
        colorHex: '#B23A32',
      },
    ],
    families,
    featuredFamilies: families.slice(0, 3),
    tailFamilies: families.slice(3),
  };
}

function buildProjectionFamilyView(
  family: AssetFamilyProjection,
  grossExposureUsd: number,
): WalletContentsFamilyView {
  const familyGrossExposureUsd = family.positiveUsd + family.debtUsd;

  return {
    id: `family:${family.network}:${family.asset}`,
    label: family.asset,
    walletUsd: family.walletUsd,
    deployedUsd: family.deployedUsd,
    owedUsd: family.debtUsd,
    positiveUsd: family.positiveUsd,
    grossExposureUsd: familyGrossExposureUsd,
    share: grossExposureUsd > 0 ? familyGrossExposureUsd / grossExposureUsd : 0,
    lines: family.observedAssets.flatMap((observedAsset, index) =>
      buildObservedAssetLines({
        family,
        observedAsset,
        index,
      }),
    ),
  };
}

function buildObservedAssetLines(input: {
  family: AssetFamilyProjection;
  observedAsset: ObservedAssetProjection;
  index: number;
}): Array<{
  id: string;
  label: string;
  tone: 'wallet' | 'deployed' | 'owed';
  valueUsd: number;
}> {
  const lineIdBase = `${input.family.network}:${input.family.asset}:${input.index}`;

  if (input.observedAsset.sourceKind === 'wallet') {
    const lines: Array<{
      id: string;
      label: string;
      tone: 'wallet';
      valueUsd: number;
    }> = [];

    if ((input.observedAsset.availableUsd ?? 0) > 0) {
      lines.push({
        id: `${lineIdBase}:available`,
        label:
          (input.observedAsset.committedUsd ?? 0) > 0
            ? `Unallocated ${input.observedAsset.asset}`
            : `Wallet ${input.observedAsset.asset}`,
        tone: 'wallet',
        valueUsd: input.observedAsset.availableUsd ?? 0,
      });
    }

    if ((input.observedAsset.committedUsd ?? 0) > 0) {
      lines.push({
        id: `${lineIdBase}:committed`,
        label: `Managed ${input.observedAsset.asset}`,
        tone: 'wallet',
        valueUsd: input.observedAsset.committedUsd ?? 0,
      });
    }

    if (lines.length > 0) {
      return lines;
    }
  }

  if (input.observedAsset.sourceKind === 'debt') {
    return [
      {
        id: `${lineIdBase}:debt`,
        label: input.observedAsset.protocolLabel
          ? `Debt on ${input.observedAsset.protocolLabel}`
          : `Debt ${input.observedAsset.asset}`,
        tone: 'owed',
        valueUsd: input.observedAsset.valueUsd,
      },
    ];
  }

  return [
    {
      id: `${lineIdBase}:position`,
      label: input.observedAsset.protocolLabel
        ? `Deployed to ${input.observedAsset.protocolLabel}`
        : `Deployed ${input.observedAsset.asset}`,
      tone: 'deployed',
      valueUsd: input.observedAsset.valueUsd,
    },
  ];
}

function buildProjectionTreemapItems(portfolio: PortfolioProjectionPacket): DashboardTreemapItem[] {
  return portfolio.assetFamilies
    .map((family) => buildFamilyTreemapItem(family, portfolio.summary.grossExposureUsd))
    .filter((item): item is DashboardTreemapItem => item !== null);
}

function buildFamilyTreemapItem(
  family: AssetFamilyProjection,
  totalGrossExposureUsd: number,
): DashboardTreemapItem | null {
  if (family.semanticClass === 'liability') {
    return null;
  }

  const treemapValueUsd = family.positiveUsd;
  if (treemapValueUsd <= 0) {
    return null;
  }

  const tones = TREEMAP_BASE_TONE[family.semanticClass];

  return {
    id: `treemap:${family.network}:${family.asset}`,
    value: treemapValueUsd,
    label: family.asset,
    subtitle: buildFamilyTreemapSubtitle(family),
    iconSymbol: family.asset,
    fallbackIconSymbol: family.asset,
    valueLabel: formatUsdCompact(treemapValueUsd),
    shareLabel: totalGrossExposureUsd > 0 ? formatPercent(treemapValueUsd / totalGrossExposureUsd) : '0%',
    assetClass: family.semanticClass === 'cash' ? 'cash' : 'asset',
    positionAccent: family.semanticClass === 'cash' ? 'mint' : 'dark',
    toneStyle: tones.toneStyle,
    hoverToneStyle: tones.hoverToneStyle,
    hoverChildren: family.observedAssets
      .flatMap((observedAsset, index) =>
        buildObservedAssetLines({
          family,
          observedAsset,
          index,
        }),
      )
      .filter((line) => line.valueUsd > 0 && line.tone !== 'owed')
      .map((line) => ({
        id: `child:${line.id}`,
        value: line.valueUsd,
        label: line.label,
        iconSymbol: family.asset,
        fallbackIconSymbol: family.asset,
        valueLabel: formatUsdCompact(line.valueUsd),
        shareLabel: treemapValueUsd > 0 ? formatPercent(line.valueUsd / treemapValueUsd) : '0%',
        assetClass: family.semanticClass === 'cash' ? 'cash' : 'asset',
        positionAccent: line.tone === 'owed' ? 'liability' : line.tone === 'wallet' ? 'mint' : 'dark',
        toneStyle:
          line.tone === 'owed'
            ? TREEMAP_BASE_TONE.liability.toneStyle
            : line.tone === 'wallet'
              ? TREEMAP_BASE_TONE.cash.toneStyle
              : TREEMAP_BASE_TONE.asset.toneStyle,
      })),
  };
}

function buildFamilyTreemapSubtitle(family: AssetFamilyProjection): string | undefined {
  if (family.semanticClass === 'liability') {
    return 'Debt exposure';
  }

  if (family.walletCommittedUsd > 0) {
    return `${formatUsdCompact(family.walletCommittedUsd)} managed`;
  }

  if (family.deployedUsd > 0) {
    return `${formatUsdCompact(family.deployedUsd)} deployed`;
  }

  if (family.walletUsd > 0) {
    return `${formatUsdCompact(family.walletUsd)} in wallet`;
  }

  return undefined;
}

function buildLegacyWalletDashboardView(portfolio: WalletPortfolioView): WalletDashboardView {
  const cashUsd = portfolio.balances.reduce((total, balance) => {
    if (typeof balance.valueUsd !== 'number' || !Number.isFinite(balance.valueUsd)) {
      return total;
    }
    return total + balance.valueUsd;
  }, 0);
  const longPerpUsd = portfolio.positions.perpetuals.reduce((total, position) => {
    if (position.positionSide !== 'long') {
      return total;
    }
    return total + parseUsdNotional(position.sizeInUsd);
  }, 0);
  const shortPerpUsd = portfolio.positions.perpetuals.reduce((total, position) => {
    if (position.positionSide !== 'short') {
      return total;
    }
    return total + parseUsdNotional(position.sizeInUsd);
  }, 0);
  const liquidityUsd = portfolio.positions.liquidity.reduce((total, position) => {
    return total + parseUsdNotional(position.positionValueUsd);
  }, 0);
  const deployedUsd = longPerpUsd + liquidityUsd;
  const liabilitiesUsd = shortPerpUsd;
  const positiveAssetsUsd = cashUsd + deployedUsd;
  const grossExposureUsd = positiveAssetsUsd + liabilitiesUsd;
  const netWorthUsd = positiveAssetsUsd - liabilitiesUsd;
  const activeLaneCount =
    portfolio.positions.perpetuals.length + portfolio.positions.pendle.length + portfolio.positions.liquidity.length;
  const benchmarkAssetLabel = selectBenchmarkAssetLabel(portfolio);
  const accounting = buildLegacyAccountingView({
    cashUsd,
    deployedUsd,
    liabilitiesUsd,
    positiveAssetsUsd,
    activeLaneCount,
  });
  const contents = buildLegacyWalletContentsView({
    portfolio,
    walletUsd: cashUsd,
    deployedUsd,
    owedUsd: liabilitiesUsd,
    grossExposureUsd,
  });

  return {
    summary: {
      cashUsd,
      deployedUsd,
      liabilitiesUsd,
      positiveAssetsUsd,
      grossExposureUsd,
      netWorthUsd,
      activeLaneCount,
    },
    topbar: {
      benchmarkAssetLabel,
      metrics: [
        {
          label: 'Gross exposure',
          value: formatUsdCompact(grossExposureUsd),
          positiveAssetsValue: formatUsdCompact(positiveAssetsUsd),
          liabilitiesValue: formatUsdCompact(liabilitiesUsd),
        },
        {
          label: 'Net worth',
          value: formatUsdCompact(netWorthUsd),
        },
        {
          label: 'Unallocated',
          value: formatUsdCompact(cashUsd),
          valueClassName: 'text-[#0F5A38]',
        },
      ],
    },
    accounting,
    contents,
    treemapItems: buildLegacyTreemapItems({
      portfolio,
      positiveAssetsUsd,
    }),
  };
}

function buildLegacyWalletContentsView(input: {
  portfolio: WalletPortfolioView;
  walletUsd: number;
  deployedUsd: number;
  owedUsd: number;
  grossExposureUsd: number;
}): WalletContentsView {
  const familyById = new Map<string, WalletContentsFamilyView>();
  let unpricedLaneCount = 0;

  const getFamily = (id: string, label: string): WalletContentsFamilyView => {
    const existing = familyById.get(id);
    if (existing) {
      return existing;
    }

    const family: WalletContentsFamilyView = {
      id,
      label,
      walletUsd: 0,
      deployedUsd: 0,
      owedUsd: 0,
      positiveUsd: 0,
      grossExposureUsd: 0,
      share: 0,
      lines: [],
    };
    familyById.set(id, family);
    return family;
  };

  input.portfolio.balances.forEach((balance) => {
    if (typeof balance.valueUsd !== 'number' || !Number.isFinite(balance.valueUsd) || balance.valueUsd <= 0) {
      return;
    }

    const label = balance.symbol ?? formatCompactReference(balance.tokenUid.address);
    const family = getFamily(`balance:${balance.tokenUid.chainId}:${balance.tokenUid.address}`, label);
    family.walletUsd += balance.valueUsd;
    family.lines.push({
      id: `wallet:${family.id}`,
      label: `Wallet ${label}`,
      tone: 'wallet',
      valueUsd: balance.valueUsd,
    });
  });

  input.portfolio.positions.perpetuals.forEach((position) => {
    const valueUsd = parseUsdNotional(position.sizeInUsd);
    if (valueUsd <= 0) {
      return;
    }

    const reference = formatCompactReference(position.marketAddress);
    const isShort = position.positionSide === 'short';
    const label = `${isShort ? 'Short' : 'Long'} ${reference}`;
    const family = getFamily(`perp:${position.key}`, label);

    if (isShort) {
      family.owedUsd += valueUsd;
    } else {
      family.deployedUsd += valueUsd;
    }

    family.lines.push({
      id: `perp:${position.key}`,
      label: `${isShort ? 'Owed' : 'Deployed'} perp`,
      tone: isShort ? 'owed' : 'deployed',
      valueUsd,
    });
  });

  input.portfolio.positions.liquidity.forEach((position, index) => {
    const valueUsd = parseUsdNotional(position.positionValueUsd);
    if (valueUsd <= 0) {
      return;
    }

    const label = position.poolName || `Liquidity ${index + 1}`;
    const family = getFamily(`liquidity:${position.positionId}`, label);
    family.deployedUsd += valueUsd;
    family.lines.push({
      id: `liquidity:${position.positionId}`,
      label,
      tone: 'deployed',
      valueUsd,
    });
  });

  input.portfolio.positions.pendle.forEach((position) => {
    const ptAmount = Number(position.pt.exactAmount);
    const ytAmount = Number(position.yt.exactAmount);
    if ((Number.isFinite(ptAmount) && ptAmount > 0) || (Number.isFinite(ytAmount) && ytAmount > 0)) {
      unpricedLaneCount += 1;
    }
  });

  const families = Array.from(familyById.values())
    .map((family) => {
      const positiveUsd = family.walletUsd + family.deployedUsd;
      const gross = positiveUsd + family.owedUsd;
      return {
        ...family,
        positiveUsd,
        grossExposureUsd: gross,
        share: input.grossExposureUsd > 0 ? gross / input.grossExposureUsd : 0,
      };
    })
    .sort((left, right) => right.grossExposureUsd - left.grossExposureUsd);

  return {
    summary: {
      grossExposureUsd: input.grossExposureUsd,
      walletUsd: input.walletUsd,
      deployedUsd: input.deployedUsd,
      owedUsd: input.owedUsd,
      unpricedLaneCount,
    },
    compositionSegments: [
      {
        label: 'Wallet',
        valueUsd: input.walletUsd,
        share: input.grossExposureUsd > 0 ? input.walletUsd / input.grossExposureUsd : 0,
        colorHex: '#4DD999',
      },
      {
        label: 'Deployed',
        valueUsd: input.deployedUsd,
        share: input.grossExposureUsd > 0 ? input.deployedUsd / input.grossExposureUsd : 0,
        colorHex: '#178B5D',
      },
      {
        label: 'Owed',
        valueUsd: input.owedUsd,
        share: input.grossExposureUsd > 0 ? input.owedUsd / input.grossExposureUsd : 0,
        colorHex: '#B23A32',
      },
    ],
    families,
    featuredFamilies: families.slice(0, 3),
    tailFamilies: families.slice(3),
  };
}

function buildLegacyAccountingView(input: {
  cashUsd: number;
  deployedUsd: number;
  liabilitiesUsd: number;
  positiveAssetsUsd: number;
  activeLaneCount: number;
}): DashboardAccountingView {
  const totalBookUsd = input.positiveAssetsUsd + input.liabilitiesUsd;
  const segments = [
    {
      label: 'Cash',
      valueUsd: input.cashUsd,
      meter: `${totalBookUsd > 0 ? (input.cashUsd / totalBookUsd) * 100 : 0}%`,
      fillClassName: 'bg-[#4DD999]',
      valueClassName: 'text-[#4DD999]',
      detail: `${formatUsdCompact(input.cashUsd)} ready`,
    },
    {
      label: 'Assets',
      valueUsd: input.deployedUsd,
      meter: `${totalBookUsd > 0 ? (input.deployedUsd / totalBookUsd) * 100 : 0}%`,
      fillClassName: 'bg-[#178B5D]',
      valueClassName: 'text-[#178B5D]',
      detail: `${input.activeLaneCount} active lanes`,
    },
    {
      label: 'Liabilities',
      valueUsd: input.liabilitiesUsd,
      meter: `${totalBookUsd > 0 ? (input.liabilitiesUsd / totalBookUsd) * 100 : 0}%`,
      fillClassName: 'bg-[#B23A32]',
      valueClassName: 'text-[#B23A32]',
    },
  ];

  return {
    segments,
    stats: [
      {
        label: 'Coverage',
        value: input.liabilitiesUsd > 0 ? formatPercent(input.cashUsd / input.liabilitiesUsd) : 'No debt',
      },
      {
        label: 'Liquid cash',
        value: formatUsdCompact(input.cashUsd),
      },
      {
        label: 'Deployed lanes',
        value: String(input.activeLaneCount),
      },
    ],
  };
}

function buildLegacyTreemapItems(input: {
  portfolio: WalletPortfolioView;
  positiveAssetsUsd: number;
}): DashboardTreemapItem[] {
  const items: DashboardTreemapItem[] = [];

  input.portfolio.balances.forEach((balance) => {
    const valueUsd = balance.valueUsd;
    if (typeof valueUsd !== 'number' || !Number.isFinite(valueUsd) || valueUsd <= 0) {
      return;
    }

    const label = balance.symbol ?? formatCompactReference(balance.tokenUid.address);
    items.push({
      id: `balance:${balance.tokenUid.chainId}:${balance.tokenUid.address}`,
      value: valueUsd,
      label,
      iconSymbol: balance.symbol ?? label,
      fallbackIconSymbol: label,
      valueLabel: formatUsdCompact(valueUsd),
      shareLabel: input.positiveAssetsUsd > 0 ? formatPercent(valueUsd / input.positiveAssetsUsd) : '0%',
      assetClass: STABLECOIN_SYMBOLS.has(label.toUpperCase()) ? 'cash' : 'asset',
      positionAccent: STABLECOIN_SYMBOLS.has(label.toUpperCase()) ? 'mint' : 'dark',
      toneStyle:
        STABLECOIN_SYMBOLS.has(label.toUpperCase())
          ? TREEMAP_BASE_TONE.cash.toneStyle
          : TREEMAP_BASE_TONE.asset.toneStyle,
      hoverToneStyle:
        STABLECOIN_SYMBOLS.has(label.toUpperCase())
          ? TREEMAP_BASE_TONE.cash.hoverToneStyle
          : TREEMAP_BASE_TONE.asset.hoverToneStyle,
    });
  });

  input.portfolio.positions.perpetuals.forEach((position) => {
    const valueUsd = parseUsdNotional(position.sizeInUsd);
    if (valueUsd <= 0) {
      return;
    }

    const isShort = position.positionSide === 'short';
    if (isShort) {
      return;
    }

    items.push({
      id: `perp:${position.key}`,
      value: valueUsd,
      label: 'Long perp',
      subtitle: formatCompactReference(position.marketAddress),
      valueLabel: formatUsdCompact(valueUsd),
      shareLabel: input.positiveAssetsUsd > 0 ? formatPercent(valueUsd / input.positiveAssetsUsd) : '0%',
      assetClass: 'asset',
      positionAccent: 'dark',
      toneStyle: TREEMAP_BASE_TONE.asset.toneStyle,
      hoverToneStyle: TREEMAP_BASE_TONE.asset.hoverToneStyle,
    });
  });

  input.portfolio.positions.liquidity.forEach((position, index) => {
    const valueUsd = parseUsdNotional(position.positionValueUsd);
    if (valueUsd <= 0) {
      return;
    }

    items.push({
      id: `liquidity:${position.positionId}`,
      value: valueUsd,
      label: position.poolName || `Liquidity ${index + 1}`,
      valueLabel: formatUsdCompact(valueUsd),
      shareLabel: input.positiveAssetsUsd > 0 ? formatPercent(valueUsd / input.positiveAssetsUsd) : '0%',
      assetClass: 'position',
      positionAccent: 'dark',
      toneStyle: TREEMAP_BASE_TONE.asset.toneStyle,
      hoverToneStyle: TREEMAP_BASE_TONE.asset.hoverToneStyle,
    });
  });

  return items.sort((left, right) => right.value - left.value);
}

function selectBenchmarkAssetLabel(portfolio: WalletPortfolioView): string | undefined {
  const stablecoinBalance = portfolio.balances.find((balance) =>
    balance.symbol ? STABLECOIN_SYMBOLS.has(balance.symbol.toUpperCase()) : false,
  );

  return stablecoinBalance?.symbol ?? portfolio.balances[0]?.symbol;
}

function formatUsdCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${formatCompactNumber(value / 1_000_000)}M`;
  }

  if (Math.abs(value) >= 1_000) {
    return `$${formatCompactNumber(value / 1_000)}k`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactNumber(value: number): string {
  return value
    .toFixed(1)
    .replace(/\.0$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatCompactReference(value: string): string {
  if (value.length < 12) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}
