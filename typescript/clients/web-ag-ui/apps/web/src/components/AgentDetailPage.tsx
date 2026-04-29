'use client';

/* eslint-disable @next/next/no-img-element */

import {
  ChevronDown,
  Star,
  Globe,
  Github,
  TrendingUp,
  Minus,
  Check,
  RefreshCw,
  Search,
  ExternalLink,
} from 'lucide-react';
import type { Message } from '@ag-ui/core';
import Link from 'next/link';
import { formatUnits } from 'viem';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type {
  AgentProfile,
  AgentMetrics,
  AgentInterrupt,
  AgentSettings,
  ThreadMetrics,
  FundingTokenOption,
  OnboardingFlow,
  Pool,
  PendleMarket,
  OperatorConfigInput,
  PendleSetupInput,
  PortfolioManagerSetupInput,
  PortfolioManagerMandateInput,
  FundWalletAcknowledgement,
  GmxSetupInput,
  PiOperatorNoteInput,
  FundingTokenInput,
  DelegationSigningResponse,
  UnsignedDelegation,
  Transaction,
  TelemetryItem,
  ClmmEvent,
  ThreadLifecycle,
  ManagedMandateInput,
} from '../types/agent';
import { getAgentConfig } from '../config/agents';
import { usePrivyWalletClient } from '../hooks/usePrivyWalletClient';
import { PROTOCOL_TOKEN_FALLBACK } from '../constants/protocolTokenFallback';
import { useOnchainActionsIconMaps } from '../hooks/useOnchainActionsIconMaps';
import {
  normalizeNameKey,
  normalizeSymbolKey,
  proxyIconUri,
  resolveAgentAvatarUri,
  resolveTokenIconUri,
  iconMonogram,
} from '../utils/iconResolution';
import { getVisibleSurfaceProtocols } from '../utils/agentSurfaceMetadata';
import { formatPoolPair } from '../utils/poolFormat';
import { Skeleton } from './ui/Skeleton';
import { LoadingValue } from './ui/LoadingValue';
import { AgentSurfaceTag } from './ui/AgentSurfaceTag';
import { CreatorIdentity } from './ui/CreatorIdentity';
import { CursorListTooltip } from './ui/CursorListTooltip';
import { CTA_SIZE_MD, CTA_SIZE_MD_FULL } from './ui/cta';
import { SimpleMarkdownText } from './ui/SimpleMarkdownText';
import {
  formatDelegationSigningError,
  signDelegationWithFallback,
} from '../utils/delegationSigning';
import { GmxAlloraMetricsTab, MetricsTab, PendleMetricsTab } from './AgentMetricsTabs';
import {
  resolveDelegationContextLabel,
  resolveOnboardingActive,
} from './agentBlockersBehavior';
import { resolveBlockersInterruptView } from './agentBlockersInterrupt';
import { resolveCurrentSetupStep } from './agentCurrentSetupStep';
import { resolveSetupSteps } from './agentSetupSteps';
import { emitAgentConnectDebug } from '../utils/agentConnectDebug';
import {
  buildManagedLendingPolicy,
  DEFAULT_MANAGED_LENDING_COLLATERAL_ASSET,
  DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
  DEFAULT_MANAGED_MANDATE_TOKEN_CHOICES,
  normalizeManagedMandateAssetSymbol,
  readManagedLendingBorrowAssets,
  readManagedLendingCollateralPolicies,
} from '../utils/managedMandate';
import { ManagedMandateWorkbenchCard } from './ManagedMandateWorkbenchCard';

export type { AgentProfile, AgentMetrics, Transaction, TelemetryItem, ClmmEvent };

const MIN_BASE_CONTRIBUTION_USD = 10;
const AGENT_WEBSITE_URL = 'https://emberai.xyz';
const AGENT_GITHUB_URL = 'https://github.com/EmberAGI/arbitrum-vibekit';
const AGENT_X_URL = 'https://x.com/emberagi';
const MANAGED_LENDING_NETWORK = 'arbitrum';
const MANAGED_LENDING_PROTOCOL = 'aave';
const MANAGED_LENDING_CONTROL_PATH = 'lending.supply';
const DEFAULT_PORTFOLIO_MANAGER_MANDATE_INPUT = {} satisfies PortfolioManagerMandateInput;
type PortfolioManagerMandateNumericKey =
  | 'betaExposureCapPct'
  | 'riskBudgetBps'
  | 'minimumCashUsd'
  | 'maxDrawdownPct'
  | 'targetVolatilityPct'
  | 'maxSingleAssetAllocationPct'
  | 'rebalanceThresholdPct'
  | 'maxLeverageRatio'
  | 'liquidityBufferPct'
  | 'maxPerpsAllocationPct'
  | 'maxPredictionMarketsAllocationPct'
  | 'maxNftAllocationPct'
  | 'maxMemecoinAllocationPct'
  | 'maxRwaAllocationPct'
  | 'maxIlliquidAllocationPct';
type PortfolioManagerMandatePillOption = {
  key: PortfolioManagerMandateNumericKey;
  label: string;
  shortLabel: string;
  helper: string;
  unit: string;
  placeholder: string;
  inputName: string;
  ariaLabel: string;
};
const PORTFOLIO_MANAGER_MANDATE_PILL_OPTIONS: PortfolioManagerMandatePillOption[] = [
  {
    key: 'betaExposureCapPct',
    label: 'Beta exposure cap',
    shortLabel: 'Beta cap',
    helper: 'Maximum portfolio beta exposure allowed before the PM should de-risk.',
    unit: '%',
    placeholder: '65',
    inputName: 'portfolio-manager-mandate-beta-exposure-cap-pct',
    ariaLabel: 'Portfolio manager beta exposure cap',
  },
  {
    key: 'riskBudgetBps',
    label: 'Risk budget',
    shortLabel: 'Risk budget',
    helper: 'Portfolio-wide risk budget expressed in basis points.',
    unit: 'bps',
    placeholder: '500',
    inputName: 'portfolio-manager-mandate-risk-budget-bps',
    ariaLabel: 'Portfolio manager risk budget',
  },
  {
    key: 'minimumCashUsd',
    label: 'Minimum cash reserve',
    shortLabel: 'Cash reserve',
    helper: 'Minimum unallocated cash the PM should keep available.',
    unit: 'USD',
    placeholder: '10',
    inputName: 'portfolio-manager-mandate-minimum-cash-usd',
    ariaLabel: 'Portfolio manager minimum cash reserve',
  },
  {
    key: 'maxDrawdownPct',
    label: 'Maximum drawdown',
    shortLabel: 'Drawdown',
    helper: 'Loss threshold where the PM should stop adding risk and preserve capital.',
    unit: '%',
    placeholder: '12',
    inputName: 'portfolio-manager-mandate-max-drawdown-pct',
    ariaLabel: 'Portfolio manager maximum drawdown',
  },
  {
    key: 'targetVolatilityPct',
    label: 'Target volatility',
    shortLabel: 'Volatility',
    helper: 'Annualized volatility target used to size portfolio risk.',
    unit: '%',
    placeholder: '18',
    inputName: 'portfolio-manager-mandate-target-volatility-pct',
    ariaLabel: 'Portfolio manager target volatility',
  },
  {
    key: 'maxSingleAssetAllocationPct',
    label: 'Max single-asset allocation',
    shortLabel: 'Single asset',
    helper: 'Concentration cap for any one asset across the managed portfolio.',
    unit: '%',
    placeholder: '35',
    inputName: 'portfolio-manager-mandate-max-single-asset-allocation-pct',
    ariaLabel: 'Portfolio manager maximum single asset allocation',
  },
  {
    key: 'rebalanceThresholdPct',
    label: 'Rebalance threshold',
    shortLabel: 'Rebalance',
    helper: 'Drift from target allocation that should trigger rebalancing.',
    unit: '%',
    placeholder: '7.5',
    inputName: 'portfolio-manager-mandate-rebalance-threshold-pct',
    ariaLabel: 'Portfolio manager rebalance threshold',
  },
  {
    key: 'maxLeverageRatio',
    label: 'Maximum leverage ratio',
    shortLabel: 'Leverage',
    helper: 'Portfolio leverage ceiling before the PM must reduce borrowed exposure.',
    unit: 'x',
    placeholder: '1.2',
    inputName: 'portfolio-manager-mandate-max-leverage-ratio',
    ariaLabel: 'Portfolio manager maximum leverage ratio',
  },
  {
    key: 'liquidityBufferPct',
    label: 'Liquidity buffer',
    shortLabel: 'Liquidity',
    helper: 'Portfolio percentage reserved for withdrawals, redeployments, and execution costs.',
    unit: '%',
    placeholder: '8',
    inputName: 'portfolio-manager-mandate-liquidity-buffer-pct',
    ariaLabel: 'Portfolio manager liquidity buffer',
  },
  {
    key: 'maxPerpsAllocationPct',
    label: 'Max portfolio in perps',
    shortLabel: 'Perps cap',
    helper: 'Maximum portfolio percentage the PM may allocate to perpetual futures exposure.',
    unit: '%',
    placeholder: '15',
    inputName: 'portfolio-manager-mandate-max-perps-allocation-pct',
    ariaLabel: 'Portfolio manager maximum allocation to perps',
  },
  {
    key: 'maxPredictionMarketsAllocationPct',
    label: 'Max portfolio in prediction markets',
    shortLabel: 'Prediction cap',
    helper: 'Maximum portfolio percentage the PM may allocate to prediction-market positions.',
    unit: '%',
    placeholder: '10',
    inputName: 'portfolio-manager-mandate-max-prediction-markets-allocation-pct',
    ariaLabel: 'Portfolio manager maximum allocation to prediction markets',
  },
  {
    key: 'maxNftAllocationPct',
    label: 'Max portfolio in NFTs',
    shortLabel: 'NFT cap',
    helper: 'Maximum portfolio percentage the PM may allocate to NFT or NFT-backed exposure.',
    unit: '%',
    placeholder: '5',
    inputName: 'portfolio-manager-mandate-max-nft-allocation-pct',
    ariaLabel: 'Portfolio manager maximum allocation to NFTs',
  },
  {
    key: 'maxMemecoinAllocationPct',
    label: 'Max portfolio in memecoins',
    shortLabel: 'Memecoin cap',
    helper: 'Maximum portfolio percentage the PM may allocate to memecoin exposure.',
    unit: '%',
    placeholder: '3',
    inputName: 'portfolio-manager-mandate-max-memecoin-allocation-pct',
    ariaLabel: 'Portfolio manager maximum allocation to memecoins',
  },
  {
    key: 'maxRwaAllocationPct',
    label: 'Max portfolio in RWAs',
    shortLabel: 'RWA cap',
    helper: 'Maximum portfolio percentage the PM may allocate to tokenized real-world assets.',
    unit: '%',
    placeholder: '20',
    inputName: 'portfolio-manager-mandate-max-rwa-allocation-pct',
    ariaLabel: 'Portfolio manager maximum allocation to RWAs',
  },
  {
    key: 'maxIlliquidAllocationPct',
    label: 'Max portfolio in illiquid assets',
    shortLabel: 'Illiquid cap',
    helper: 'Maximum portfolio percentage the PM may allocate to illiquid or thinly traded positions.',
    unit: '%',
    placeholder: '12',
    inputName: 'portfolio-manager-mandate-max-illiquid-allocation-pct',
    ariaLabel: 'Portfolio manager maximum allocation to illiquid assets',
  },
];
const PORTFOLIO_MANAGER_MANDATE_KEYS_TO_STRIP = [
  ...PORTFOLIO_MANAGER_MANDATE_PILL_OPTIONS.map((option) => option.key),
  'betaExposureTarget',
  'riskToleranceScore',
  'minUndeployedCashBps',
] as const;
const DETAIL_PAGE_SHELL_CLASS =
  'flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),rgba(248,241,232,0.96)_38%,#efe3d2_100%)] p-8 text-[#261a12]';
const DETAIL_CARD_CLASS =
  'rounded-2xl border border-[#eadac7] bg-[linear-gradient(180deg,#fffdf9_0%,#f7efe4_100%)] shadow-[0_18px_45px_rgba(115,78,48,0.08)]';
const DETAIL_PANEL_CLASS =
  'rounded-2xl border border-[#eadac7] bg-white/80 shadow-[0_16px_32px_rgba(148,111,79,0.10)]';
const DETAIL_INSET_CLASS =
  'rounded-xl border border-[#eadac7] bg-[#fffaf2] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]';
const DETAIL_INPUT_CLASS =
  'w-full rounded-lg border border-[#d8c3ad] bg-[#fffdf8] px-4 py-3 text-[#261a12] outline-none transition-colors placeholder:text-[#9b826f] focus:border-[#fd6731]';
const DETAIL_ACTION_BUTTON_CLASS =
  'flex items-center gap-2 rounded-lg border border-[#eadac7] bg-white/80 px-3 py-1.5 text-sm text-[#503826] shadow-[0_10px_28px_rgba(115,78,48,0.08)] transition-colors hover:bg-[#fff7ed] disabled:opacity-60';
const DETAIL_NEUTRAL_BUTTON_CLASS =
  'rounded-lg border border-[#eadac7] bg-white/80 text-[#503826] font-medium transition-colors hover:bg-[#fff7ed] disabled:opacity-60';
const DETAIL_ICON_BUTTON_CLASS =
  'rounded-lg p-2 text-[#6f5a4c] transition-colors hover:bg-[#fff3e7] hover:text-[#2f2118]';
const DETAIL_LABEL_CLASS = 'text-[11px] uppercase tracking-[0.18em] text-[#907764]';
const DETAIL_STATS_LABEL_CLASS = 'text-[10px] uppercase tracking-[0.2em] text-[#907764]';

interface AgentDetailPageProps {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  creatorName?: string;
  creatorVerified?: boolean;
  ownerAddress?: string;
  rank?: number;
  rating?: number;
  profile: AgentProfile;
  metrics: AgentMetrics;
  fullMetrics?: ThreadMetrics;
  initialTab?: TabType;
  isHired: boolean;
  isRestoringState?: boolean;
  isHiring: boolean;
  hasLoadedView: boolean;
  isFiring?: boolean;
  isSyncing?: boolean;
  uiError?: string | null;
  onClearUiError?: () => void;
  onHire: () => void;
  onFire: () => void;
  onSync: () => void;
  onBack: () => void;
  // Interrupt handling
  activeInterrupt?: AgentInterrupt | null;
  allowedPools: Array<Pool | PendleMarket>;
  onInterruptSubmit?: (
    input:
      | OperatorConfigInput
      | PendleSetupInput
      | PortfolioManagerSetupInput
      | FundWalletAcknowledgement
      | GmxSetupInput
      | PiOperatorNoteInput
      | FundingTokenInput
      | DelegationSigningResponse,
  ) => void;
  // Task state
  taskId?: string;
  taskStatus?: string;
  haltReason?: string;
  executionError?: string;
  delegationsBypassActive?: boolean;
  onboardingFlow?: OnboardingFlow;
  // Activity data
  transactions?: Transaction[];
  telemetry?: TelemetryItem[];
  events?: ClmmEvent[];
  messages?: Message[];
  lifecycleState?: ThreadLifecycle;
  domainProjection?: Record<string, unknown>;
  // Settings
  settings?: AgentSettings;
  onSendChatMessage?: (content: string) => void;
  onSettingsChange?: (updates: Partial<AgentSettings>) => void;
  onSettingsSave?: (updates: Partial<AgentSettings>) => void;
  onManagedMandateSave?: (input: ManagedMandateEditorSubmitInput) => Promise<void> | void;
}

type TabType = 'blockers' | 'metrics' | 'transactions' | 'chat';

function hashStringToSeed(value: string): number {
  // Cheap stable hash for deterministic mock series.
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makeMockSeries(params: {
  seedKey: string;
  points: number;
  start: number;
  drift: number;
  noise: number;
  min?: number;
  max?: number;
}): number[] {
  const { seedKey, points, start, drift, noise, min, max } = params;
  const rand = mulberry32(hashStringToSeed(seedKey));
  const out: number[] = [];
  let current = start;

  for (let i = 0; i < points; i++) {
    const n = (rand() - 0.5) * 2; // [-1, 1]
    current += drift + n * noise;
    if (min !== undefined) current = Math.max(min, current);
    if (max !== undefined) current = Math.min(max, current);
    out.push(current);
  }

  return out;
}

function Sparkline(props: {
  values: number[];
  height?: number;
  strokeClassName?: string;
  fillClassName?: string;
}) {
  const { values, height = 160, strokeClassName = 'stroke-purple-400', fillClassName = 'fill-purple-500/10' } =
    props;
  if (values.length < 2) return null;

  const width = 300;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-9, max - min);

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const area = `0,${height} ${points} ${width},${height}`;

  return (
    <div className="mt-5 h-[160px] overflow-hidden rounded-xl border border-[#eadac7] bg-[#fffaf2]">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline points={area} className={fillClassName} />
        <polyline
          points={points}
          className={`${strokeClassName} stroke-[2]`}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getMessageText(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => {
        if (item.type === 'text') {
          return item.text;
        }
        return item.filename ?? item.url ?? item.mimeType;
      })
      .join('\n')
      .trim();
  }

  if (message.role === 'activity') {
    const content = asRecord(message.content);
    if (!content) {
      return '';
    }

    return [
      readString(content.title),
      readString(content.text) ?? readString(content.detail) ?? readString(content.summary),
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n')
      .trim();
  }

  return '';
}

function getMessageRoleLabel(message: Message): string {
  if (message.role === 'assistant') return 'Agent';
  if (message.role === 'reasoning') return 'Reasoning';
  if (message.role === 'tool') return 'Tool';
  if (message.role === 'activity' && message.activityType === 'artifact') return 'Artifact';
  if (message.role === 'activity') return 'Activity';
  return 'You';
}

type VisibleChatMessage = {
  id: string;
  label: string;
  text: string;
  role: Message['role'];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function formatManagedLanePart(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatManagedLaneLabel(network: string | null, protocol: string | null): string | null {
  if (!network && !protocol) {
    return null;
  }

  return [formatManagedLanePart(network), formatManagedLanePart(protocol)]
    .filter((value): value is string => value !== null)
    .join(' / ');
}

function formatReservationIdForDisplay(value: string): string {
  const reservationId = value.trim();
  if (reservationId.length <= 40) {
    return reservationId;
  }

  const parts = reservationId.split(/[-_]+/).filter((part) => part.length > 0);
  const prefixSource = parts[0] ?? reservationId;
  const prefix = prefixSource.slice(0, Math.min(3, prefixSource.length));
  const context =
    parts.find((part) => part.toLowerCase().includes('lending')) ??
    parts[Math.floor(parts.length / 2)] ??
    reservationId.slice(0, 7);
  const tail = reservationId.slice(-7);

  return `${prefix}...${context}...${tail}`;
}

function normalizeReservationSummaryForDisplay(summary: string | null): string | null {
  if (!summary) {
    return null;
  }

  return summary.replace(
    /^(Reservation\s+)(\S+)(\s.*)$/u,
    (_match, prefix: string, reservationId: string, suffix: string) =>
      `${prefix}${formatReservationIdForDisplay(reservationId)}${suffix}`,
  );
}

function readFirstRecordFromArray(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const entry of value) {
    const record = asRecord(entry);
    if (record) {
      return record;
    }
  }

  return null;
}

function readLaneProtocolFromControlPath(controlPath: string | null): string | null {
  if (!controlPath) {
    return null;
  }

  const [laneFamily] = controlPath.split('.', 1);
  return laneFamily?.trim().length ? laneFamily : null;
}

function readArtifactEventType(event: ClmmEvent): string {
  if (event.type !== 'artifact') {
    return 'unknown';
  }

  return (
    readString(event.artifact?.type) ??
    readString(asRecord(event.artifact?.data)?.['type']) ??
    'unknown'
  );
}

type ActivityInspectionAction = {
  kind: 'run' | 'artifact';
  id: string;
  label: string;
  href: string;
  detailLines: string[];
};

type ActivityDescription = {
  body: string;
  details: string[];
  inspections: ActivityInspectionAction[];
};

function buildActivityElementId(kind: ActivityInspectionAction['kind'], id: string): string {
  return `automation-${kind}-${encodeURIComponent(id)}`;
}

function buildActivityAnchor(kind: ActivityInspectionAction['kind'], id: string): string {
  return `#${buildActivityElementId(kind, id)}`;
}

function buildActivityInspectionHref(params: {
  agentId: string;
  threadId: string;
  kind: ActivityInspectionAction['kind'];
  id: string;
}): string {
  const searchParams = new URLSearchParams({
    agentId: params.agentId,
    threadId: params.threadId,
    ...(params.kind === 'run' ? { runId: params.id } : { artifactId: params.id }),
  });
  const resource = params.kind === 'run' ? 'automation-runs' : 'artifacts';
  return `/api/copilotkit/control/${resource}?${searchParams.toString()}`;
}

function buildActivityInspectionActions(params: {
  agentId: string;
  threadId: string | null;
  runId: string | null;
  artifactId: string | null;
  summary?: string | null;
  runThreadKey?: string | null;
}): ActivityInspectionAction[] {
  const actions: ActivityInspectionAction[] = [];

  if (params.runId && params.threadId) {
    actions.push({
      kind: 'run',
      id: params.runId,
      label: `Inspect run ${params.runId}`,
      href: buildActivityInspectionHref({
        agentId: params.agentId,
        threadId: params.threadId,
        kind: 'run',
        id: params.runId,
      }),
      detailLines: [
        `Run ${params.runId}`,
        params.summary ? `Summary ${params.summary}` : null,
        params.runThreadKey ? `Run thread ${params.runThreadKey}` : null,
      ].filter((line): line is string => line !== null),
    });
  }

  if (params.artifactId && params.threadId) {
    actions.push({
      kind: 'artifact',
      id: params.artifactId,
      label: `Open artifact ${params.artifactId}`,
      href: buildActivityInspectionHref({
        agentId: params.agentId,
        threadId: params.threadId,
        kind: 'artifact',
        id: params.artifactId,
      }),
      detailLines: [`Artifact ${params.artifactId}`],
    });
  }

  return actions;
}

function describeActivityEvent(event: ClmmEvent, agentId: string): ActivityDescription {
  if (event.type === 'status') {
    return { body: event.message, details: [], inspections: [] };
  }

  if (event.type === 'dispatch-response') {
    return { body: `Response with ${event.parts?.length ?? 0} parts`, details: [], inspections: [] };
  }

  const artifactData = asRecord(event.artifact?.data);
  const artifactId = readString(event.artifact?.artifactId) ?? readString(event.artifact?.id);

  if (artifactData?.type === 'automation-status') {
    const status = readString(artifactData.status) ?? 'unknown';
    const command = readString(artifactData.command) ?? 'automation';
    const detail = readString(artifactData.detail) ?? 'Automation status updated.';
    const runId = readString(artifactData.runId);
    const rootThreadId = readString(artifactData.rootThreadId);
    const details = [
      runId ? `Run ${runId}` : null,
      artifactId ? `Artifact ${artifactId}` : null,
    ].filter((value): value is string => value !== null);

    return {
      body: `Automation ${status}\n${command}: ${detail}`,
      details,
      inspections: buildActivityInspectionActions({ agentId, threadId: rootThreadId, runId, artifactId }),
    };
  }

  if (readArtifactEventType(event) === 'automation-run-snapshot') {
    const snapshot = asRecord(artifactData?.snapshot);
    const runId = readString(artifactData?.automationRunId) ?? readString(artifactData?.runId);
    const runThreadKey = readString(artifactData?.runThreadKey);
    const rootThreadId = readString(artifactData?.rootThreadId);
    const summary = readString(snapshot?.summary) ?? readString(artifactData?.summary);
    const details = [
      runId ? `Run ${runId}` : null,
      artifactId ? `Artifact ${artifactId}` : null,
      runThreadKey ? `Run thread ${runThreadKey}` : null,
    ].filter((value): value is string => value !== null);

    return {
      body: summary ? `Automation run snapshot\n${summary}` : 'Automation run snapshot',
      details,
      inspections: buildActivityInspectionActions({
        agentId,
        threadId: rootThreadId,
        runId,
        artifactId,
        summary,
        runThreadKey,
      }),
    };
  }

  return {
    body: `Artifact: ${readArtifactEventType(event)}`,
    details: artifactId ? [`Artifact ${artifactId}`] : [],
    inspections: buildActivityInspectionActions({ agentId, threadId: null, runId: null, artifactId }),
  };
}

type ManagedMandateEditorView = {
  ownerAgentId: string;
  targetAgentId: string;
  targetAgentRouteId: string;
  targetAgentKey: string;
  title: string;
  laneLabel: string | null;
  mandateRef: string | null;
  managedMandate: Record<string, unknown> | null;
  walletAddress: string | null;
  rootUserWallet: string | null;
  rootedWalletContextId: string | null;
  reservationSummary: string | null;
};

type PortfolioManagerMandateEditorView = {
  ownerAgentId: string;
  targetAgentId: string;
  targetAgentRouteId: string;
  targetAgentKey: string;
  title: string;
  mandateRef: string | null;
  managedMandate: PortfolioManagerMandateInput;
};

type ManagedMandateEditorSubmitInput = {
  ownerAgentId: string;
  targetAgentId: string;
  targetAgentRouteId: string;
  managedMandate: Record<string, unknown>;
};

type PortfolioManagerMandateEditorSubmitInput = ManagedMandateEditorSubmitInput;

function buildReservationSummaryFromProjection(
  reservation: Record<string, unknown> | null,
): string | null {
  if (!reservation) {
    return null;
  }

  const reservationId = readString(reservation['reservationId']);
  if (!reservationId) {
    return null;
  }

  const purpose = readString(reservation['purpose']);
  const controlPath = readString(reservation['controlPath']);
  const rootAsset = readString(reservation['rootAsset']);
  const quantity = readString(reservation['quantity']);
  const reservationAction =
    purpose === 'position.enter' ? 'supplies' : purpose ? `${purpose}s` : 'moves';
  const quantitySummary = quantity && rootAsset ? ` ${quantity} ${rootAsset}` : ' capital';
  const controlPathSummary = controlPath ? ` via ${controlPath}` : '';

  return normalizeReservationSummaryForDisplay(
    `Reservation ${reservationId} ${reservationAction}${quantitySummary}${controlPathSummary}.`,
  );
}

function readPortfolioManagerNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readManagedMandateEditorView(
  domainProjection: Record<string, unknown> | undefined,
): ManagedMandateEditorView | null {
  const editor = asRecord(domainProjection?.['managedMandateEditor']);
  if (!editor) {
    return null;
  }

  const targetAgentRouteId = readString(editor['targetAgentRouteId']);
  if (!targetAgentRouteId) {
    return null;
  }
  const ownerAgentId = readString(editor['ownerAgentId']);
  const targetAgentId = readString(editor['targetAgentId']);
  const targetAgentKey = readString(editor['targetAgentKey']);
  if (!ownerAgentId || !targetAgentId || !targetAgentKey) {
    return null;
  }

  const managedMandate = asRecord(editor['managedMandate']);
  const reservation = asRecord(editor['reservation']);
  const controlPath = readString(reservation?.['controlPath']) ?? MANAGED_LENDING_CONTROL_PATH;

  return {
    ownerAgentId,
    targetAgentId,
    targetAgentRouteId,
    targetAgentKey,
    title: readString(editor['targetAgentTitle']) ?? 'Managed lending lane',
    laneLabel: formatManagedLaneLabel(
      MANAGED_LENDING_NETWORK,
      readLaneProtocolFromControlPath(controlPath) ?? MANAGED_LENDING_PROTOCOL,
    ),
    mandateRef: readString(editor['mandateRef']),
    managedMandate,
    walletAddress: readString(editor['agentWallet']),
    rootUserWallet: readString(editor['rootUserWallet']),
    rootedWalletContextId: readString(editor['rootedWalletContextId']),
    reservationSummary: buildReservationSummaryFromProjection(asRecord(editor['reservation'])),
  };
}

function readPortfolioManagerMandateEditorView(
  domainProjection: Record<string, unknown> | undefined,
): PortfolioManagerMandateEditorView | null {
  const editor = asRecord(domainProjection?.['portfolioManagerMandateEditor']);
  if (!editor) {
    return null;
  }

  const targetAgentRouteId = readString(editor['targetAgentRouteId']);
  if (!targetAgentRouteId) {
    return null;
  }
  const ownerAgentId = readString(editor['ownerAgentId']);
  const targetAgentId = readString(editor['targetAgentId']);
  const targetAgentKey = readString(editor['targetAgentKey']);
  if (!ownerAgentId || !targetAgentId || !targetAgentKey) {
    return null;
  }

  const managedMandateRecord = asRecord(editor['managedMandate']) ?? null;
  const managedMandate: PortfolioManagerMandateInput = managedMandateRecord ?? {};

  return {
    ownerAgentId,
    targetAgentId,
    targetAgentRouteId,
    targetAgentKey,
    title: readString(editor['targetAgentTitle']) ?? 'Portfolio manager mandate',
    mandateRef: readString(editor['mandateRef']),
    managedMandate,
  };
}

type EmberLendingRuntimeView = {
  phase: string | null;
  laneLabel: string | null;
  walletAddress: string | null;
  managedMandate: Record<string, unknown> | null;
  reservationSummary: string | null;
};

function buildEmberLendingRuntimeView(
  params: {
    lifecycleState: ThreadLifecycle | undefined;
    domainProjection: Record<string, unknown> | undefined;
  },
): EmberLendingRuntimeView | null {
  const lifecycleRecord = asRecord(params.lifecycleState);
  const managedMandateEditorView = readManagedMandateEditorView(params.domainProjection);
  const runtimeView: EmberLendingRuntimeView = {
    phase: readString(lifecycleRecord?.['phase']),
    laneLabel: managedMandateEditorView?.laneLabel ?? null,
    walletAddress: managedMandateEditorView?.walletAddress ?? null,
    managedMandate: managedMandateEditorView?.managedMandate ?? null,
    reservationSummary: managedMandateEditorView?.reservationSummary ?? null,
  };

  return runtimeView.phase ||
    runtimeView.laneLabel ||
    runtimeView.walletAddress ||
    runtimeView.managedMandate ||
    runtimeView.reservationSummary
    ? runtimeView
    : null;
}

function ManagedMandateEditorCard(props: {
  view: ManagedMandateEditorView;
  availableTokenSymbols?: string[];
  tokenIconBySymbol: Record<string, string>;
  onSave?: (input: ManagedMandateEditorSubmitInput) => Promise<void> | void;
  submitLabel?: string;
  chrome?: 'card' | 'plain';
}) {
  return (
    <ManagedMandateWorkbenchCard
      view={{
        ownerAgentId: props.view.ownerAgentId,
        targetAgentId: props.view.targetAgentId,
        targetAgentRouteId: props.view.targetAgentRouteId,
        mandateRef: props.view.mandateRef,
        managedMandate: props.view.managedMandate,
      }}
      availableTokenSymbols={props.availableTokenSymbols}
      tokenIconBySymbolOverride={props.tokenIconBySymbol}
      chrome={props.chrome}
      submitLabel={props.submitLabel}
      onSave={(input) =>
        props.onSave?.({
          ownerAgentId: input.ownerAgentId,
          targetAgentId: input.targetAgentId,
          targetAgentRouteId: input.targetAgentRouteId,
          managedMandate: input.managedMandate,
        })
      }
    />
  );
}

function readPortfolioManagerMandatePillOption(
  key: PortfolioManagerMandateNumericKey,
): PortfolioManagerMandatePillOption {
  const option = PORTFOLIO_MANAGER_MANDATE_PILL_OPTIONS.find((candidate) => candidate.key === key);
  if (!option) {
    throw new Error(`Unsupported portfolio manager mandate key: ${key}`);
  }
  return option;
}

function readSelectedPortfolioManagerMandateKeys(
  mandate: PortfolioManagerMandateInput,
): PortfolioManagerMandateNumericKey[] {
  return PORTFOLIO_MANAGER_MANDATE_PILL_OPTIONS
    .filter((option) => readPortfolioManagerNumber(mandate[option.key]) !== undefined)
    .map((option) => option.key);
}

function buildPortfolioManagerMandateInputValues(
  mandate: PortfolioManagerMandateInput,
): Record<PortfolioManagerMandateNumericKey, string> {
  const betaExposureCapPct = readPortfolioManagerNumber(mandate.betaExposureCapPct);
  const riskBudgetBps = readPortfolioManagerNumber(mandate.riskBudgetBps);
  const minimumCashUsd = readPortfolioManagerNumber(mandate.minimumCashUsd);
  const maxDrawdownPct = readPortfolioManagerNumber(mandate.maxDrawdownPct);
  const targetVolatilityPct = readPortfolioManagerNumber(mandate.targetVolatilityPct);
  const maxSingleAssetAllocationPct = readPortfolioManagerNumber(
    mandate.maxSingleAssetAllocationPct,
  );
  const rebalanceThresholdPct = readPortfolioManagerNumber(mandate.rebalanceThresholdPct);
  const maxLeverageRatio = readPortfolioManagerNumber(mandate.maxLeverageRatio);
  const liquidityBufferPct = readPortfolioManagerNumber(mandate.liquidityBufferPct);
  const maxPerpsAllocationPct = readPortfolioManagerNumber(mandate.maxPerpsAllocationPct);
  const maxPredictionMarketsAllocationPct = readPortfolioManagerNumber(
    mandate.maxPredictionMarketsAllocationPct,
  );
  const maxNftAllocationPct = readPortfolioManagerNumber(mandate.maxNftAllocationPct);
  const maxMemecoinAllocationPct = readPortfolioManagerNumber(mandate.maxMemecoinAllocationPct);
  const maxRwaAllocationPct = readPortfolioManagerNumber(mandate.maxRwaAllocationPct);
  const maxIlliquidAllocationPct = readPortfolioManagerNumber(mandate.maxIlliquidAllocationPct);

  return {
    betaExposureCapPct: betaExposureCapPct === undefined ? '' : String(betaExposureCapPct),
    riskBudgetBps: riskBudgetBps === undefined ? '' : String(riskBudgetBps),
    minimumCashUsd: minimumCashUsd === undefined ? '' : String(minimumCashUsd),
    maxDrawdownPct: maxDrawdownPct === undefined ? '' : String(maxDrawdownPct),
    targetVolatilityPct: targetVolatilityPct === undefined ? '' : String(targetVolatilityPct),
    maxSingleAssetAllocationPct:
      maxSingleAssetAllocationPct === undefined ? '' : String(maxSingleAssetAllocationPct),
    rebalanceThresholdPct:
      rebalanceThresholdPct === undefined ? '' : String(rebalanceThresholdPct),
    maxLeverageRatio: maxLeverageRatio === undefined ? '' : String(maxLeverageRatio),
    liquidityBufferPct: liquidityBufferPct === undefined ? '' : String(liquidityBufferPct),
    maxPerpsAllocationPct:
      maxPerpsAllocationPct === undefined ? '' : String(maxPerpsAllocationPct),
    maxPredictionMarketsAllocationPct:
      maxPredictionMarketsAllocationPct === undefined
        ? ''
        : String(maxPredictionMarketsAllocationPct),
    maxNftAllocationPct:
      maxNftAllocationPct === undefined ? '' : String(maxNftAllocationPct),
    maxMemecoinAllocationPct:
      maxMemecoinAllocationPct === undefined ? '' : String(maxMemecoinAllocationPct),
    maxRwaAllocationPct:
      maxRwaAllocationPct === undefined ? '' : String(maxRwaAllocationPct),
    maxIlliquidAllocationPct:
      maxIlliquidAllocationPct === undefined ? '' : String(maxIlliquidAllocationPct),
  };
}

function buildPortfolioManagerMandateFromDraft(params: {
  baseMandate: PortfolioManagerMandateInput;
  selectedKeys: PortfolioManagerMandateNumericKey[];
  numberInputs: Record<PortfolioManagerMandateNumericKey, string>;
  requireCompleteValues: boolean;
}): PortfolioManagerMandateInput {
  const nextMandate: Record<string, unknown> = { ...params.baseMandate };
  for (const key of PORTFOLIO_MANAGER_MANDATE_KEYS_TO_STRIP) {
    delete nextMandate[key];
  }

  for (const key of params.selectedKeys) {
    const option = readPortfolioManagerMandatePillOption(key);
    const rawValue = params.numberInputs[key].trim();
    const numericValue = Number(rawValue);
    if (rawValue.length === 0 || !Number.isFinite(numericValue)) {
      if (params.requireCompleteValues) {
        throw new Error(`${option.label} must be a valid number.`);
      }
      continue;
    }
    nextMandate[key] = numericValue;
  }

  return nextMandate as PortfolioManagerMandateInput;
}

function PortfolioManagerMandateWorkbenchCard(props: {
  view: PortfolioManagerMandateEditorView;
  onSave?: (input: PortfolioManagerMandateEditorSubmitInput) => Promise<void> | void;
  onDraftChange?: (managedMandate: PortfolioManagerMandateInput) => void;
  submitLabel?: string;
  chrome?: 'card' | 'plain';
}) {
  const [selectedKeys, setSelectedKeys] = useState<PortfolioManagerMandateNumericKey[]>(() =>
    readSelectedPortfolioManagerMandateKeys(props.view.managedMandate),
  );
  const [numberInputs, setNumberInputs] = useState<
    Record<PortfolioManagerMandateNumericKey, string>
  >(() => buildPortfolioManagerMandateInputValues(props.view.managedMandate));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedKeys(readSelectedPortfolioManagerMandateKeys(props.view.managedMandate));
    setNumberInputs(buildPortfolioManagerMandateInputValues(props.view.managedMandate));
    setSubmitError(null);
  }, [
    props.view.mandateRef,
    props.view.ownerAgentId,
    props.view.targetAgentId,
    props.view.targetAgentKey,
    props.view.targetAgentRouteId,
  ]);

  const emitDraftChange = (
    nextSelectedKeys: PortfolioManagerMandateNumericKey[],
    nextNumberInputs: Record<PortfolioManagerMandateNumericKey, string>,
  ) => {
    props.onDraftChange?.(
      buildPortfolioManagerMandateFromDraft({
        baseMandate: props.view.managedMandate,
        selectedKeys: nextSelectedKeys,
        numberInputs: nextNumberInputs,
        requireCompleteValues: false,
      }),
    );
  };

  const handleTogglePill = (key: PortfolioManagerMandateNumericKey) => {
    const isSelected = selectedKeys.includes(key);
    const nextSelectedKeys = isSelected
      ? selectedKeys.filter((selectedKey) => selectedKey !== key)
      : PORTFOLIO_MANAGER_MANDATE_PILL_OPTIONS
          .map((option) => option.key)
          .filter((optionKey) => optionKey === key || selectedKeys.includes(optionKey));
    setSelectedKeys(nextSelectedKeys);
    setSubmitError(null);
    if (isSelected) {
      emitDraftChange(nextSelectedKeys, numberInputs);
    }
  };

  const handleInputChange = (key: PortfolioManagerMandateNumericKey, value: string) => {
    const nextNumberInputs = {
      ...numberInputs,
      [key]: value,
    };
    setNumberInputs(nextNumberInputs);
    setSubmitError(null);
    emitDraftChange(selectedKeys, nextNumberInputs);
  };

  const handleSave = async () => {
    if (!props.onSave) {
      return;
    }

    for (const key of selectedKeys) {
      const option = readPortfolioManagerMandatePillOption(key);
      const rawValue = numberInputs[key].trim();
      const value = Number(rawValue);
      if (rawValue.length === 0 || !Number.isFinite(value)) {
        setSubmitError(`${option.label} must be a valid number.`);
        return;
      }
    }

    setIsSaving(true);
    setSubmitError(null);
    try {
      await props.onSave({
        ownerAgentId: props.view.ownerAgentId,
        targetAgentId: props.view.targetAgentId,
        targetAgentRouteId: props.view.targetAgentRouteId,
        managedMandate: buildPortfolioManagerMandateFromDraft({
          baseMandate: props.view.managedMandate,
          selectedKeys,
          numberInputs,
          requireCompleteValues: true,
        }),
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Portfolio mandate update failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const rootClassName =
    props.chrome === 'plain'
      ? 'py-1'
      : 'rounded-[22px] border border-[#eadac7] bg-white/80 px-3.5 py-3 shadow-[0_14px_28px_rgba(148,111,79,0.09)]';

  return (
    <div className={rootClassName}>
      <div className="space-y-3">
        <div>
          <div className="text-[0.88rem] font-semibold text-[#503826]">Portfolio manager mandate</div>
          <div className="mt-1 text-xs text-[#7c6757]">
            Select the portfolio-wide constraints you want the PM to enforce.
          </div>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Portfolio manager mandate options">
          {PORTFOLIO_MANAGER_MANDATE_PILL_OPTIONS.map((option) => {
            const selected = selectedKeys.includes(option.key);
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                onClick={() => handleTogglePill(option.key)}
                disabled={isSaving}
                className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-60 ${
                  selected
                    ? 'border-[#fd6731] bg-[#fff1e7] text-[#6a3216] shadow-[inset_0_1px_0_rgba(255,255,255,0.76),0_10px_24px_rgba(253,103,49,0.13)]'
                    : 'border-[#eadac7] bg-white/70 text-[#7c6757] hover:border-[#d8bda3] hover:bg-[#fffaf2]'
                }`}
              >
                {option.shortLabel}
              </button>
            );
          })}
        </div>

        {selectedKeys.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-[#dfcab4] bg-[#fffaf2]/70 px-4 py-5 text-sm text-[#7c6757]">
            No PM constraints selected yet. Pick one or more policy pills above to add numeric
            mandate inputs.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedKeys.map((key) => {
              const option = readPortfolioManagerMandatePillOption(key);
              return (
                <label
                  key={key}
                  className="grid gap-2 rounded-[18px] border border-[#eadac7] bg-[#fffdf8] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-[#9b826f]">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-xs text-[#7c6757]">{option.helper}</span>
                    </span>
                    <span className="rounded-full border border-[#eadac7] bg-[#fff7ef] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#7c6757]">
                      {option.unit}
                    </span>
                  </span>
                  <input
                    name={option.inputName}
                    aria-label={option.ariaLabel}
                    type="number"
                    className={`${DETAIL_INPUT_CLASS} font-mono`}
                    value={numberInputs[key]}
                    placeholder={option.placeholder}
                    onChange={(event) => handleInputChange(key, event.target.value)}
                    disabled={isSaving}
                  />
                </label>
              );
            })}
          </div>
        )}

        {submitError ? <p className="text-xs text-[#8a2f2f]">{submitError}</p> : null}

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={`${DETAIL_NEUTRAL_BUTTON_CLASS} px-5 py-2`}
        >
          {isSaving ? 'Saving...' : props.submitLabel ?? 'Save portfolio mandate'}
        </button>
      </div>
    </div>
  );
}

function PortfolioManagerMandateWorkbenchShell(props: {
  variant: 'portfolio-manager' | 'managed-lending';
  children: ReactNode;
}) {
  const shellAgentConfig = getAgentConfig(
    props.variant === 'portfolio-manager' ? 'agent-portfolio-manager' : 'agent-ember-lending',
  );
  const shellAgentHref = `/hire-agents/${shellAgentConfig.id}`;
  const shellLabel =
    props.variant === 'portfolio-manager'
      ? {
          aria: 'Open Portfolio Manager',
          eyebrow: 'PM',
          title: 'Portfolio',
          iconFallback: 'PM',
        }
      : {
          aria: 'Open Ember Lending',
          eyebrow: 'Aave',
          title: 'Lending',
          iconFallback: 'EL',
        };
  const railClassName =
    props.variant === 'portfolio-manager'
      ? 'from-[#fff4e9] to-[#f3dfca] text-[#6a3d20]'
      : 'from-[#eef8f1] to-[#dceee2] text-[#315f3d]';

  return (
    <div className="flex items-stretch gap-4">
      <Link
        href={shellAgentHref}
        aria-label={shellLabel.aria}
        className="flex w-[92px] shrink-0 flex-col items-center justify-center gap-2 self-stretch border-r border-[#eadac7] pr-4 text-center transition-colors hover:text-[#2f2118] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fd6731]/30"
      >
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-[18px] bg-gradient-to-br shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_10px_24px_rgba(99,70,43,0.10)] ${railClassName}`}
          style={shellAgentConfig.imageUrl && shellAgentConfig.avatarBg
            ? { background: shellAgentConfig.avatarBg }
            : undefined}
        >
          {shellAgentConfig.imageUrl ? (
            <img
              src={shellAgentConfig.imageUrl}
              alt={shellLabel.aria.replace('Open ', '')}
              className="h-8 w-8 object-contain"
            />
          ) : (
            <span className="text-xs font-semibold" aria-hidden="true">
              {shellAgentConfig.avatar ?? shellLabel.iconFallback}
            </span>
          )}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9b826f]">
          {shellLabel.eyebrow}
        </div>
        <div className="text-[11px] font-medium leading-[1.1] text-[#503826]">
          {shellLabel.title}
        </div>
      </Link>
      <div className="min-w-0 flex-1 self-stretch">{props.children}</div>
    </div>
  );
}

function FloatingErrorToast(props: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed top-5 right-5 z-[60] w-[360px] max-w-[calc(100vw-2.5rem)]">
      <div className="rounded-2xl border border-red-500/20 bg-[#fff3ee]/95 px-4 py-3 shadow-[0_18px_48px_rgba(115,78,48,0.12)] backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#b84f2c]">{props.title}</div>
            <div className="mt-1 break-words text-xs leading-relaxed text-[#9c5b3f]">
              {props.message}
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="shrink-0 rounded-lg p-2 text-[#9c5b3f] transition-colors hover:bg-white/70 hover:text-[#7b3d20]"
            aria-label="Dismiss"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentDetailPage({
  agentId,
  agentName,
  agentDescription,
  creatorName,
  creatorVerified,
  ownerAddress,
  rank,
  rating,
  profile,
  metrics,
  fullMetrics,
  initialTab,
  isHired,
  isRestoringState = false,
  isHiring,
  hasLoadedView,
  isFiring,
  isSyncing,
  uiError,
  onClearUiError,
  onHire,
  onFire,
  onSync,
  onBack,
  activeInterrupt,
  allowedPools,
  onInterruptSubmit,
  taskId,
  taskStatus,
  haltReason,
  executionError,
  delegationsBypassActive,
  onboardingFlow,
  transactions = [],
  telemetry = [],
  events = [],
  messages = [],
  lifecycleState,
  domainProjection,
  settings,
  onSendChatMessage,
  onSettingsChange,
  onSettingsSave,
  onManagedMandateSave,
}: AgentDetailPageProps) {
  const showPostHireLayout = isHired || Boolean(isFiring);
  const agentConfig = useMemo(() => getAgentConfig(agentId), [agentId]);
  const managedOnboardingOwner = useMemo(
    () =>
      agentConfig.onboardingOwnerAgentId
        ? getAgentConfig(agentConfig.onboardingOwnerAgentId)
        : null,
    [agentConfig.onboardingOwnerAgentId],
  );
  const managedMandateEditorView = useMemo(
    () => readManagedMandateEditorView(domainProjection),
    [domainProjection],
  );
  const portfolioManagerMandateEditorView = useMemo(
    () => readPortfolioManagerMandateEditorView(domainProjection),
    [domainProjection],
  );
  const emberLendingRuntimeView = useMemo(
    () =>
      agentId === 'agent-ember-lending'
        ? buildEmberLendingRuntimeView({ lifecycleState, domainProjection })
        : null,
    [agentId, domainProjection, lifecycleState],
  );
  const isPortfolioAgent = agentId === 'agent-portfolio-manager';
  const isOnboardingActive = resolveOnboardingActive({
    activeInterruptPresent: Boolean(activeInterrupt),
    taskStatus,
    onboardingStatus: onboardingFlow?.status,
  });
  const managedRuntimePhaseIsActive = lifecycleState?.phase === 'active';
  const managedOnboardingRuntimeActive = lifecycleState?.phase === 'onboarding';
  const portfolioManagedContextVisible = isPortfolioAgent
    ? managedRuntimePhaseIsActive
    : managedRuntimePhaseIsActive && !isOnboardingActive;
  const visiblePortfolioManagerMandateEditorView =
    portfolioManagedContextVisible && isPortfolioAgent
      ? portfolioManagerMandateEditorView
      : null;
  const visibleManagedMandateEditorView = portfolioManagedContextVisible
    ? managedMandateEditorView
    : null;
  const emberLendingChatEnabled =
    agentId === 'agent-ember-lending' &&
    emberLendingRuntimeView?.phase === 'active';
  const chatEnabled = isPortfolioAgent || emberLendingChatEnabled;
  const isEmberLendingAgent = agentId === 'agent-ember-lending';
  const inlineOnboardingChatEnabled = isEmberLendingAgent;
  const [activeTab, setActiveTab] = useState<TabType>(
    initialTab ?? (showPostHireLayout ? 'blockers' : 'metrics'),
  );
  const [hasUserSelectedTab, setHasUserSelectedTab] = useState(Boolean(initialTab));
  const [dismissedBlockingError, setDismissedBlockingError] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [isSubagentWalletPopoverOpen, setIsSubagentWalletPopoverOpen] = useState(false);
  const [subagentWalletCopyStatus, setSubagentWalletCopyStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const subagentWalletPopoverRef = useRef<HTMLDivElement | null>(null);
  const subagentWalletCopyResetTimeoutRef = useRef<number | null>(null);
  const forceBlockersTab = isOnboardingActive && !inlineOnboardingChatEnabled;
  const defaultPostHireTab: TabType = isFiring
    ? 'transactions'
    : isEmberLendingAgent
      ? 'chat'
      : 'metrics';
  const selectTab = useCallback((tab: TabType) => {
    setHasUserSelectedTab(true);
    setActiveTab(tab);
  }, []);
  const handleHire = useCallback(() => {
    if (inlineOnboardingChatEnabled) {
      selectTab('chat');
    }
    onHire();
  }, [inlineOnboardingChatEnabled, onHire, selectTab]);
  const submitChatDraft = useCallback(() => {
    const trimmed = chatDraft.trim();
    if (trimmed.length === 0) {
      return;
    }
    onSendChatMessage?.(trimmed);
    setChatDraft('');
  }, [chatDraft, onSendChatMessage]);
  const handleChatSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitChatDraft();
    },
    [submitChatDraft],
  );
  const handleChatKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) {
        return;
      }
      event.preventDefault();
      submitChatDraft();
    },
    [submitChatDraft],
  );

  const resolvedTab: TabType = forceBlockersTab
    ? 'blockers'
    : !hasUserSelectedTab && showPostHireLayout
      ? defaultPostHireTab
      : activeTab;
  const useEmbeddedPortfolioChat = isPortfolioAgent && !forceBlockersTab && !isFiring;
  const showLeftRailStats = !isPortfolioAgent && !isEmberLendingAgent;
  const showAgentMetadataGrid = !isPortfolioAgent;
  const subagentWalletPopoverId = useId();

  const blockingErrorMessage = (haltReason || executionError || null) as string | null;
  const showBlockingErrorPopup =
    Boolean(blockingErrorMessage) && dismissedBlockingError !== blockingErrorMessage;

  const popups = (
    <>
      {uiError ? (
        <FloatingErrorToast
          title="Action failed"
          message={uiError}
          onClose={() => onClearUiError?.()}
        />
      ) : null}
      {!uiError && showBlockingErrorPopup && blockingErrorMessage ? (
        <FloatingErrorToast
          title="Agent error"
          message={blockingErrorMessage}
          onClose={() => setDismissedBlockingError(blockingErrorMessage)}
        />
      ) : null}
    </>
  );

  const displayChains = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    for (const chain of profile.chains ?? []) {
      const trimmed = chain.trim();
      if (trimmed.length === 0) continue;

      // Figma expects the canonical label "Arbitrum" even if upstream sources report
      // "Arbitrum One" or other variants. Keep this narrowly-scoped to avoid unintended
      // renames for other chains.
      const normalized = normalizeNameKey(trimmed);
      const label = normalized.startsWith('arbitrum') ? 'Arbitrum' : trimmed;
      const dedupeKey = normalizeNameKey(label);

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push(label);
    }

    return out;
  }, [profile.chains]);

  const displayProtocols = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    const push = (value: string) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(trimmed);
    };

    for (const protocol of getVisibleSurfaceProtocols(profile.protocols ?? [])) push(protocol);
    for (const protocol of getVisibleSurfaceProtocols(agentConfig.protocols ?? [])) push(protocol);
    return out;
  }, [agentConfig.protocols, profile.protocols]);
  const primaryProtocol = displayProtocols.length > 0 ? displayProtocols[0] : null;

  const displayTokens = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    const push = (value: string) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) return;
      const key = trimmed.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(trimmed);
    };

    for (const token of profile.tokens ?? []) push(token);
    for (const token of agentConfig.tokens ?? []) push(token);
    return out;
  }, [agentConfig.tokens, profile.tokens]);

  const desiredTokenSymbols = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    const addSymbol = (symbol: string | undefined) => {
      if (!symbol) return;
      const trimmed = symbol.trim();
      if (trimmed.length === 0) return;
      if (seen.has(trimmed)) return;
      seen.add(trimmed);
      out.push(trimmed);
    };

    for (const symbol of displayTokens) addSymbol(symbol);
    for (const protocol of displayProtocols) addSymbol(PROTOCOL_TOKEN_FALLBACK[protocol]);
    for (const symbol of DEFAULT_MANAGED_MANDATE_TOKEN_CHOICES) addSymbol(symbol);
    for (const policy of readManagedLendingCollateralPolicies(managedMandateEditorView?.managedMandate ?? null)) {
      addSymbol(policy.asset);
    }
    for (const symbol of readManagedLendingBorrowAssets(managedMandateEditorView?.managedMandate ?? null)) {
      addSymbol(symbol);
    }

    return out;
  }, [displayProtocols, displayTokens, managedMandateEditorView?.managedMandate]);

  const { chainIconByName, tokenIconBySymbol } = useOnchainActionsIconMaps({
    chainNames: profile.chains ?? [],
    tokenSymbols: desiredTokenSymbols,
  });
  const managedMandateAvailableTokenSymbols = useMemo(
    () => Array.from(new Set([...desiredTokenSymbols, ...Object.keys(tokenIconBySymbol)])),
    [desiredTokenSymbols, tokenIconBySymbol],
  );

  const agentAvatarUri = useMemo(
    () =>
      resolveAgentAvatarUri({
        imageUrl: agentConfig.imageUrl,
        protocols: profile.protocols ?? [],
        tokenIconBySymbol,
      }) ??
      (profile.chains && profile.chains.length > 0
        ? chainIconByName[normalizeNameKey(profile.chains[0])] ?? null
        : null),
    [agentConfig.imageUrl, chainIconByName, profile.chains, profile.protocols, tokenIconBySymbol],
  );

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 5)}...${address.slice(-3)}`;
  };
  const formatWalletRowAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const clearSubagentWalletCopyResetTimeout = () => {
    if (subagentWalletCopyResetTimeoutRef.current !== null) {
      window.clearTimeout(subagentWalletCopyResetTimeoutRef.current);
      subagentWalletCopyResetTimeoutRef.current = null;
    }
  };

  const closeSubagentWalletPopover = () => {
    setIsSubagentWalletPopoverOpen(false);
    setSubagentWalletCopyStatus('idle');
  };

  const handleCopySubagentWalletAddress = async () => {
    const walletAddress = emberLendingRuntimeView?.walletAddress;
    if (!walletAddress) return;

    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(walletAddress);
      setSubagentWalletCopyStatus('success');
    } catch {
      setSubagentWalletCopyStatus('error');
    }

    clearSubagentWalletCopyResetTimeout();
    subagentWalletCopyResetTimeoutRef.current = window.setTimeout(() => {
      setSubagentWalletCopyStatus('idle');
    }, 2000);
  };

  const handleWalletFieldFocus: React.FocusEventHandler<HTMLInputElement> = (event) => {
    event.currentTarget.select();
  };

  const handleWalletFieldClick: React.MouseEventHandler<HTMLInputElement> = (event) => {
    event.currentTarget.select();
  };

  useEffect(() => {
    if (!isSubagentWalletPopoverOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (subagentWalletPopoverRef.current?.contains(target)) return;
      closeSubagentWalletPopover();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSubagentWalletPopover();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSubagentWalletPopoverOpen]);

  useEffect(() => {
    return () => {
      clearSubagentWalletCopyResetTimeout();
    };
  }, []);

  useEffect(() => {
    setSubagentWalletCopyStatus('idle');
  }, [emberLendingRuntimeView?.walletAddress]);

  const formatCurrency = (value: number | undefined) => {
    const resolved = asFiniteNumber(value);
    if (resolved === undefined) return null;
    if (resolved >= 1000000) {
      return `$${(resolved / 1000000).toFixed(2)}M`;
    }
    if (resolved >= 1000) {
      return `$${resolved.toLocaleString()}`;
    }
    return `$${resolved.toFixed(2)}`;
  };

  const formatSignedCurrency = (value: number | undefined) => {
    const resolved = asFiniteNumber(value);
    if (resolved === undefined) return null;
    const sign = resolved > 0 ? '+' : '';
    return `${sign}${formatCurrency(resolved)}`;
  };

  const formatNumber = (value: number | undefined) => {
    const resolved = asFiniteNumber(value);
    if (resolved === undefined) return null;
    return resolved.toLocaleString();
  };

  const formatPercent = (value: number | undefined, digits = 0) => {
    const resolved = asFiniteNumber(value);
    if (resolved === undefined) return null;
    return `${resolved.toFixed(digits)}%`;
  };
  const currentApy = asFiniteNumber(metrics.apy);
  const previousApy = asFiniteNumber(fullMetrics?.previousApy);

  const renderStars = (ratingValue: number) => {
    const stars = [];
    const fullStars = Math.floor(ratingValue);
    const hasHalfStar = ratingValue % 1 >= 0.5;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />);
      } else if (i === fullStars && hasHalfStar) {
        stars.push(<Star key={i} className="w-4 h-4 fill-yellow-400/50 text-yellow-400" />);
      } else {
        stars.push(<Star key={i} className="w-4 h-4 text-[#937c69]" />);
      }
    }
    return stars;
  };

  const chatTab = chatEnabled ? (
    <AgentChatTab
      agentName={agentName}
      isHired={isHired}
      isHiring={isHiring}
      messages={messages}
      chatDraft={chatDraft}
      onChatDraftChange={setChatDraft}
      onSubmit={handleChatSubmit}
      onChatKeyDown={handleChatKeyDown}
      isComposerEnabled={chatEnabled && typeof onSendChatMessage === 'function'}
      onSendChatMessage={onSendChatMessage}
    />
  ) : null;
  const managedAgentContextCards = visiblePortfolioManagerMandateEditorView || visibleManagedMandateEditorView ? (
    <div className={isPortfolioAgent ? 'mt-6 border-t border-[#eadac7] pt-5' : 'mt-6'}>
      {visiblePortfolioManagerMandateEditorView ? (
        <div className={`${DETAIL_INSET_CLASS} p-4`}>
          <PortfolioManagerMandateWorkbenchShell variant="portfolio-manager">
            <PortfolioManagerMandateWorkbenchCard
              view={visiblePortfolioManagerMandateEditorView}
              onSave={onManagedMandateSave}
              submitLabel="Save PM mandate"
              chrome="plain"
            />
          </PortfolioManagerMandateWorkbenchShell>
        </div>
      ) : null}
      {visibleManagedMandateEditorView ? (
        <div className={`${DETAIL_INSET_CLASS} p-4 ${visiblePortfolioManagerMandateEditorView ? 'mt-4' : ''}`}>
          <PortfolioManagerMandateWorkbenchShell variant="managed-lending">
            <ManagedMandateEditorCard
              view={visibleManagedMandateEditorView}
              availableTokenSymbols={managedMandateAvailableTokenSymbols}
              tokenIconBySymbol={tokenIconBySymbol}
              onSave={onManagedMandateSave}
              submitLabel="Save lending mandate"
              chrome="plain"
            />
          </PortfolioManagerMandateWorkbenchShell>
        </div>
      ) : null}
    </div>
  ) : null;
  const subagentWalletBar = emberLendingRuntimeView?.walletAddress ? (
    <div className="mt-6">
      <div className="relative border-t border-[#eadac7] pt-4" ref={subagentWalletPopoverRef}>
        <div className={DETAIL_LABEL_CLASS}>Subagent wallet</div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <button
            type="button"
            onClick={() => setIsSubagentWalletPopoverOpen((current) => !current)}
            className="min-w-0 flex-1 truncate text-left text-sm font-mono text-[#503826] transition-colors hover:text-[#2f2118]"
            aria-haspopup="dialog"
            aria-expanded={isSubagentWalletPopoverOpen}
            aria-controls={subagentWalletPopoverId}
          >
            {formatWalletRowAddress(emberLendingRuntimeView.walletAddress)}
          </button>
          <button
            type="button"
            onClick={() => setIsSubagentWalletPopoverOpen((current) => !current)}
            className="text-xs text-[#6f5a4c] transition-colors hover:text-[#2f2118]"
            aria-label={
              isSubagentWalletPopoverOpen
                ? 'Hide full subagent wallet address'
                : 'Show full subagent wallet address'
            }
          >
            {isSubagentWalletPopoverOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4 rotate-180" />
            )}
          </button>
        </div>
        {isSubagentWalletPopoverOpen ? (
          <div
            id={subagentWalletPopoverId}
            role="dialog"
            aria-label="Subagent wallet address"
            className="absolute left-0 top-full z-30 mt-2 w-max rounded-lg border border-[#eadac7] bg-[#fffdf8] p-3 shadow-[0_18px_38px_rgba(115,78,48,0.14)]"
          >
            <div className="text-xs text-[#7c6757]">Subagent wallet address</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={emberLendingRuntimeView.walletAddress}
                onFocus={handleWalletFieldFocus}
                onClick={handleWalletFieldClick}
                className="shrink-0 w-auto rounded-md border border-[#eadac7] bg-[#fff7ef] px-2 py-1 text-xs font-mono text-[#503826]"
                style={{
                  width: `calc(${Math.max(emberLendingRuntimeView.walletAddress.length, 20)}ch + 1rem)`,
                }}
                aria-label="Full subagent wallet address"
              />
              <button
                type="button"
                onClick={() => void handleCopySubagentWalletAddress()}
                className={`${DETAIL_NEUTRAL_BUTTON_CLASS} shrink-0 px-2 py-1 text-xs`}
              >
                {subagentWalletCopyStatus === 'success' ? 'Copied' : 'Copy'}
              </button>
            </div>
            {subagentWalletCopyStatus === 'error' ? (
              <div className="mt-2 text-xs text-[#c85b3c]" role="status" aria-live="polite">
                Clipboard unavailable. Select and copy manually.
              </div>
            ) : null}
            {subagentWalletCopyStatus === 'success' ? (
              <div className="mt-2 text-xs text-[#2f7a57]" role="status" aria-live="polite">
                Copied to clipboard.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  // Use the upgraded layout only for hired agents. Pre-hire must remain stable even
  // while detail refresh is still loading, otherwise the Hire CTA can disappear.
  if (showPostHireLayout) {
    const tabs = (
      <div className="mb-6 flex items-center gap-1 border-b border-[#eadac7]">
        {isEmberLendingAgent ? (
          <>
            <TabButton
              active={resolvedTab === 'chat'}
              onClick={() => selectTab('chat')}
              disabled={!chatEnabled}
            >
              Chat
            </TabButton>
            <TabButton
              active={resolvedTab === 'blockers'}
              onClick={() => selectTab('blockers')}
              highlight
            >
              Settings and policies
            </TabButton>
            <TabButton
              active={resolvedTab === 'metrics'}
              onClick={() => selectTab('metrics')}
              disabled={isOnboardingActive}
            >
              Metrics
            </TabButton>
            <TabButton
              active={resolvedTab === 'transactions'}
              onClick={() => selectTab('transactions')}
              disabled={isOnboardingActive}
            >
              Activity
            </TabButton>
          </>
        ) : (
          <>
            <TabButton
              active={resolvedTab === 'blockers'}
              onClick={() => selectTab('blockers')}
              highlight
            >
              Settings and policies
            </TabButton>
            <TabButton
              active={resolvedTab === 'metrics'}
              onClick={() => selectTab('metrics')}
              disabled={isOnboardingActive}
            >
              Metrics
            </TabButton>
            <TabButton
              active={resolvedTab === 'transactions'}
              onClick={() => selectTab('transactions')}
              disabled={isOnboardingActive}
            >
              Activity
            </TabButton>
            <TabButton
              active={resolvedTab === 'chat'}
              onClick={() => selectTab('chat')}
              disabled={!chatEnabled}
            >
              Chat
            </TabButton>
          </>
        )}
      </div>
    );

    const tabContent = (
      <>
        {resolvedTab === 'blockers' && (
          <>
            {isOnboardingActive ? (
              <AgentBlockersTab
                agentId={agentId}
                activeInterrupt={activeInterrupt}
                allowedPools={allowedPools}
                availableTokenSymbols={managedMandateAvailableTokenSymbols}
                onInterruptSubmit={onInterruptSubmit}
                taskId={taskId}
                taskStatus={taskStatus}
                haltReason={haltReason}
                executionError={executionError}
                delegationsBypassActive={delegationsBypassActive}
                onboardingFlow={onboardingFlow}
                settings={settings}
                tokenIconBySymbol={tokenIconBySymbol}
                onSettingsChange={onSettingsChange}
              />
            ) : (
              <SettingsTab
                settings={settings}
                onSettingsChange={onSettingsChange}
                onSettingsSave={onSettingsSave}
                isSyncing={isSyncing === true}
              />
            )}
          </>
        )}

        {resolvedTab === 'metrics' && (
          <MetricsTab
            agentId={agentId}
            profile={profile}
            metrics={metrics}
            fullMetrics={fullMetrics}
            events={events}
            transactions={transactions}
            hasLoadedView={hasLoadedView}
          />
        )}

        {resolvedTab === 'transactions' && (
          <TransactionHistoryTab
            agentId={agentId}
            transactions={transactions}
            taskId={taskId}
            taskStatus={taskStatus}
            telemetry={telemetry}
            events={events}
            chainIconUri={displayChains.length > 0 ? chainIconByName[normalizeNameKey(displayChains[0])] ?? null : null}
            protocolLabel={primaryProtocol}
            protocolIconUri={
              primaryProtocol
                ? (() => {
                    const protocol = primaryProtocol;
                    const fallback = PROTOCOL_TOKEN_FALLBACK[protocol];
                    return fallback ? tokenIconBySymbol[normalizeSymbolKey(fallback)] ?? null : null;
                  })()
                : null
            }
          />
        )}

        {resolvedTab === 'chat' && chatTab}
      </>
    );
    const postHireContent = useEmbeddedPortfolioChat ? chatTab : tabContent;

    return (
      <div className={DETAIL_PAGE_SHELL_CLASS}>
        <div className="max-w-[1200px] mx-auto">
          {popups}
          <div className="mb-6 flex justify-end">
            <button
              onClick={onSync}
              disabled={isSyncing}
              className={DETAIL_ACTION_BUTTON_CLASS}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Refresh'}
            </button>
          </div>

          <>
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 items-start">
                {/* Left summary card (Figma onboarding) */}
                <div className={`${DETAIL_CARD_CLASS} p-6`}>
                  <div
                    className="mx-auto mb-6 flex h-[220px] w-[220px] items-center justify-center overflow-hidden rounded-full bg-[#f1e4d3] ring-1 ring-[#eadac7]"
                    style={
                      agentConfig.imageUrl && agentConfig.avatarBg
                        ? { background: agentConfig.avatarBg }
                        : undefined
                    }
                  >
                    {agentAvatarUri ? (
                      <img
                        src={proxyIconUri(agentAvatarUri)}
                        alt=""
                        decoding="async"
                        className={`h-full w-full ${
                          agentConfig.imageUrl ? 'object-contain p-8' : 'object-cover'
                        }`}
                      />
                    ) : (
                      <span className="text-4xl font-semibold text-[#6f5a4c]" aria-hidden="true">
                        {iconMonogram(agentName)}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-center">
                    {isHired ? (
                      <div
                        className={`group relative inline-flex h-10 w-full items-stretch overflow-hidden rounded-[999px] bg-[#f4eadb] ring-1 ring-[#eadac7] transition-[background-color,box-shadow,border-color] duration-300 ease-out hover:ring-[#fd6731]/30 hover:shadow-[0_12px_30px_rgba(115,78,48,0.12)] group-hover:bg-gradient-to-r group-hover:from-[#ffeddc] group-hover:to-[#ffe2cf] ${
                          isFiring ? 'opacity-90' : ''
                        }`}
                      >
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_circle_at_50%_0%,rgba(255,255,255,0.55),transparent_40%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                        <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-3 text-[13px] font-medium text-[#5f4939] transition-[opacity,flex-basis,padding] duration-200 ease-out group-hover:flex-[0_0_0%] group-hover:px-0 group-hover:opacity-0">
                          <span
                            className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.12)] transition-transform duration-200 group-hover:scale-110"
                            aria-hidden="true"
                          />
                          <span>
                            {managedOnboardingOwner
                              ? `Managed by ${managedOnboardingOwner.name}`
                              : 'Agent is hired'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={onFire}
                          disabled={managedOnboardingOwner ? false : isFiring}
                          className={`relative z-10 flex h-full flex-[0_0_92px] items-center justify-center border-l border-[#eadac7] px-3 text-[13px] font-medium text-white transition-[flex-basis,background-color,border-color,color,box-shadow] duration-300 ease-out group-hover:flex-1 group-hover:border-transparent group-hover:bg-transparent ${
                            !managedOnboardingOwner && isFiring
                              ? 'bg-[#d3c4b4] text-[#6f5a4c] cursor-wait'
                              : 'bg-gradient-to-b from-[#ff4d1a] to-[#fd6731] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                          }`}
                        >
                          {managedOnboardingOwner ? 'Manage' : isFiring ? 'Firing...' : 'Fire'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleHire}
                        disabled={isHiring}
                        className={[
                          CTA_SIZE_MD_FULL,
                          isHiring
                            ? 'bg-[#fd6731]/60 text-white cursor-wait'
                            : 'bg-[#fd6731] hover:bg-[#e55a28] text-white shadow-[0_14px_30px_rgba(253,103,49,0.24)]',
                          'transition-[background-color,box-shadow] duration-200',
                        ].join(' ')}
                      >
                        {isHiring ? 'Hiring...' : 'Hire'}
                      </button>
                    )}
                  </div>

                  {showLeftRailStats ? (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-6">
                      <div>
                        <div className={DETAIL_STATS_LABEL_CLASS}>Agent Income</div>
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-6 w-24"
                          loadedClassName="text-lg font-semibold text-[#261a12]"
                          value={formatCurrency(profile.agentIncome)}
                        />
                      </div>
                      <div>
                        <div className={DETAIL_STATS_LABEL_CLASS}>AUM</div>
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-6 w-24"
                          loadedClassName="text-lg font-semibold text-[#261a12]"
                          value={formatCurrency(profile.aum)}
                        />
                      </div>
                      <div>
                        <div className={DETAIL_STATS_LABEL_CLASS}>Total Users</div>
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-6 w-20"
                          loadedClassName="text-lg font-semibold text-[#261a12]"
                          value={formatNumber(profile.totalUsers)}
                        />
                      </div>
                      <div>
                        <div className={DETAIL_STATS_LABEL_CLASS}>APY</div>
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-6 w-16"
                          loadedClassName="text-lg font-semibold text-teal-400"
                          value={formatPercent(profile.apy)}
                        />
                      </div>
                      <div>
                        <div className={DETAIL_STATS_LABEL_CLASS}>Your Assets</div>
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-6 w-24"
                          loadedClassName="text-lg font-semibold text-[#261a12]"
                          value={formatCurrency(fullMetrics?.latestSnapshot?.totalUsd)}
                        />
                      </div>
                      <div>
                        <div className={DETAIL_STATS_LABEL_CLASS}>Your PnL</div>
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-6 w-24"
                          loadedClassName={`text-lg font-semibold ${
                            (metrics.lifetimePnlUsd ?? 0) >= 0 ? 'text-teal-400' : 'text-red-400'
                          }`}
                          value={formatSignedCurrency(metrics.lifetimePnlUsd)}
                        />
                      </div>
                    </div>
                  ) : null}
                  {subagentWalletBar}

                </div>

                {/* Right header (no surrounding card) */}
                <div className="pt-2 flex flex-col">
                  <div className="flex items-start justify-between gap-6 mb-6">
                    <div className="min-w-0">
                      <h1 className="mb-2 text-2xl font-bold text-[#261a12]">{agentName}</h1>
                      <div className="mt-4 flex items-center gap-3">
                        {rank !== undefined && <span className="text-sm text-[#7c6757]">#{rank}</span>}
                        {rating !== undefined && (
                          <div className="flex items-center gap-1">{renderStars(rating)}</div>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                        {creatorName && (
                          <CreatorIdentity
                            name={creatorName}
                            verified={creatorVerified}
                            size="md"
                            nameClassName="text-sm text-[#2f2118]"
                          />
                        )}
                        {ownerAddress && (
                          <div className="text-sm text-[#7c6757]">
                            Owned by <span className="text-[#2f2118]">{formatAddress(ownerAddress)}</span>
                          </div>
                        )}
                      </div>
                      {agentConfig.surfaceTag ? (
                        <AgentSurfaceTag tag={agentConfig.surfaceTag} className="mt-3" />
                      ) : null}
                      {agentDescription ? (
                        <p className="mt-4 text-sm leading-relaxed text-[#7c6757]">
                          {agentDescription}
                        </p>
                      ) : (
                        <p className="mt-4 text-sm italic text-[#937c69]">No description available</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={AGENT_X_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="X"
                        className={DETAIL_ICON_BUTTON_CLASS}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      </a>
                      <a
                        href={AGENT_WEBSITE_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Website"
                        className={DETAIL_ICON_BUTTON_CLASS}
                      >
                        <Globe className="w-4 h-4" />
                      </a>
                      <a
                        href={AGENT_GITHUB_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="GitHub"
                        className={DETAIL_ICON_BUTTON_CLASS}
                      >
                        <Github className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                  {managedAgentContextCards}

                  {showAgentMetadataGrid ? (
                    <div className="mt-8 grid grid-cols-4 gap-4 border-t border-[#eadac7] pt-6">
                      <TagColumn
                        title="Chains"
                        items={displayChains}
                        getIconUri={(chain) => chainIconByName[normalizeNameKey(chain)] ?? null}
                      />
                      <TagColumn
                        title="Protocols"
                        items={displayProtocols}
                        getIconUri={(protocol) => {
                          const fallback = PROTOCOL_TOKEN_FALLBACK[protocol];
                          if (!fallback) return null;
                          return tokenIconBySymbol[normalizeSymbolKey(fallback)] ?? null;
                        }}
                      />
                      <TagColumn
                        title="Tokens"
                        items={displayTokens}
                        getIconUri={(symbol) =>
                          resolveTokenIconUri({ symbol, tokenIconBySymbol })
                        }
                      />
                      <PointsColumn metrics={metrics} />
                    </div>
                  ) : null}
              </div>
            </div>

            {/* Tabs + content span full available width (no empty left column) */}
            {useEmbeddedPortfolioChat ? null : <div className="mt-8">{tabs}</div>}
            <div className={useEmbeddedPortfolioChat ? 'mt-8' : undefined}>{postHireContent}</div>
          </>
        </div>
      </div>
    );
  }

  // Render pre-hire state layout (original)
  return (
    <div className={DETAIL_PAGE_SHELL_CLASS}>
      <div className="max-w-[1200px] mx-auto">
        {popups}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 items-start">
          {/* Left Column - Agent Card */}
          <div>
            <div className={`${DETAIL_CARD_CLASS} p-6`}>
              <div
                className="mx-auto mb-6 flex h-[220px] w-[220px] items-center justify-center overflow-hidden rounded-full bg-[#f1e4d3] ring-1 ring-[#eadac7]"
                style={
                  agentConfig.imageUrl && agentConfig.avatarBg
                    ? { background: agentConfig.avatarBg }
                    : undefined
                }
              >
                {agentAvatarUri ? (
                  <img
                    src={proxyIconUri(agentAvatarUri)}
                    alt=""
                    decoding="async"
                    className={`h-full w-full ${
                      agentConfig.imageUrl ? 'object-contain p-8' : 'object-cover'
                    }`}
                  />
                ) : (
                  <span className="text-4xl font-semibold text-[#6f5a4c]" aria-hidden="true">
                    {iconMonogram(agentName)}
                  </span>
                )}
              </div>

              <button
                onClick={handleHire}
                disabled={isHiring || isRestoringState}
                className={[
                  CTA_SIZE_MD_FULL,
                  isHiring || isRestoringState
                    ? 'bg-[#fd6731]/60 text-white cursor-wait'
                    : 'bg-[#fd6731] hover:bg-[#e55a28] text-white shadow-[0_14px_30px_rgba(253,103,49,0.24)]',
                  'transition-[background-color,box-shadow] duration-200',
                ].join(' ')}
              >
                {managedOnboardingOwner
                  ? `Open ${managedOnboardingOwner.name}`
                  : isRestoringState
                    ? 'Reconnecting...'
                    : isHiring
                    ? 'Hiring...'
                    : 'Hire'}
              </button>

              {isRestoringState ? (
                <div className={`${DETAIL_INSET_CLASS} mt-4 p-4`}>
                  <div className="mb-2 text-sm font-medium text-[#503826]">Restoring state</div>
                  <p className="text-xs leading-relaxed text-[#7c6757]">
                    Waiting for the latest runtime snapshot before rendering agent controls.
                  </p>
                </div>
              ) : null}

              {managedOnboardingOwner && !isRestoringState ? (
                <div className={`${DETAIL_INSET_CLASS} mt-4 p-4`}>
                  <div className="mb-2 text-sm font-medium text-[#503826]">Managed onboarding</div>
                  <p className="text-xs leading-relaxed text-[#7c6757]">
                    Managed onboarding happens through {managedOnboardingOwner.name}.
                  </p>
                </div>
              ) : null}

              {showLeftRailStats ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-6">
                  <div>
                    <div className={DETAIL_STATS_LABEL_CLASS}>Agent Income</div>
                    {!hasLoadedView ? (
                      <Skeleton className="h-6 w-24" />
                    ) : (
                      <div className="text-lg font-semibold text-[#261a12]">
                        {formatCurrency(profile.agentIncome) ?? '-'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className={DETAIL_STATS_LABEL_CLASS}>AUM</div>
                    {!hasLoadedView ? (
                      <Skeleton className="h-6 w-24" />
                    ) : (
                      <div className="text-lg font-semibold text-[#261a12]">
                        {formatCurrency(profile.aum) ?? '-'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className={DETAIL_STATS_LABEL_CLASS}>Total Users</div>
                    {!hasLoadedView ? (
                      <Skeleton className="h-6 w-20" />
                    ) : (
                      <div className="text-lg font-semibold text-[#261a12]">
                        {formatNumber(profile.totalUsers) ?? '-'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className={DETAIL_STATS_LABEL_CLASS}>APY</div>
                    {!hasLoadedView ? (
                      <Skeleton className="h-6 w-16" />
                    ) : (
                      <div className="text-lg font-semibold text-teal-400">
                        {formatPercent(profile.apy) ?? '-'}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
              {subagentWalletBar}
            </div>
          </div>

          {/* Right Column - Details */}
          <div>
            <div className="pt-2 flex flex-col">
              <div className="flex items-start justify-between gap-6 mb-6">
                <div className="min-w-0">
                  <h1 className="mb-2 text-2xl font-bold text-[#261a12]">{agentName}</h1>
                  <div className="mt-4 flex items-center gap-3">
                    {rank !== undefined && <span className="text-sm text-[#7c6757]">#{rank}</span>}
                    {rating !== undefined && (
                      <div className="flex items-center gap-1">{renderStars(rating)}</div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {creatorName && (
                      <CreatorIdentity
                        name={creatorName}
                        verified={creatorVerified}
                        size="md"
                        nameClassName="text-sm text-[#2f2118]"
                      />
                    )}
                    {ownerAddress && (
                      <div className="text-sm text-[#7c6757]">
                        Owned by <span className="text-[#2f2118]">{formatAddress(ownerAddress)}</span>
                      </div>
                    )}
                  </div>
                  {agentConfig.surfaceTag ? (
                    <AgentSurfaceTag tag={agentConfig.surfaceTag} className="mt-3" />
                  ) : null}
                  {agentDescription ? (
                    <p className="mt-4 text-sm leading-relaxed text-[#7c6757]">{agentDescription}</p>
                  ) : (
                    <p className="mt-4 text-sm italic text-[#937c69]">No description available</p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={AGENT_X_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="X"
                    className={DETAIL_ICON_BUTTON_CLASS}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                  <a
                    href={AGENT_WEBSITE_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Website"
                    className={DETAIL_ICON_BUTTON_CLASS}
                  >
                    <Globe className="w-4 h-4" />
                  </a>
                  <a
                    href={AGENT_GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="GitHub"
                    className={DETAIL_ICON_BUTTON_CLASS}
                  >
                    <Github className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {showAgentMetadataGrid ? (
                <div className="mt-auto grid grid-cols-4 gap-4 border-t border-[#eadac7] pt-6">
                  <TagColumn
                    title="Chains"
                    items={displayChains}
                    getIconUri={(chain) => chainIconByName[normalizeNameKey(chain)] ?? null}
                  />
                  <TagColumn
                    title="Protocols"
                    items={displayProtocols}
                    getIconUri={(protocol) => {
                      const fallback = PROTOCOL_TOKEN_FALLBACK[protocol];
                      if (!fallback) return null;
                      return tokenIconBySymbol[normalizeSymbolKey(fallback)] ?? null;
                    }}
                  />
                  <TagColumn
                    title="Tokens"
                    items={displayTokens}
                    getIconUri={(symbol) => resolveTokenIconUri({ symbol, tokenIconBySymbol })}
                  />
                  <PointsColumn metrics={metrics} />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {useEmbeddedPortfolioChat ? null : (
          <div className="mt-10 flex items-center gap-6 border-b border-[#eadac7]">
            <button
              type="button"
              onClick={() => selectTab('metrics')}
              className={`px-1 pb-3 text-sm font-medium -mb-px border-b-2 ${
                resolvedTab === 'metrics'
                  ? 'text-[#fd6731] border-[#fd6731]'
                  : 'text-[#937c69] border-transparent hover:text-[#2f2118]'
              }`}
              aria-current={resolvedTab === 'metrics' ? 'page' : undefined}
            >
              Metrics
            </button>
            <button
              type="button"
              onClick={() => selectTab('chat')}
              disabled={!chatEnabled}
              className={`px-1 pb-3 text-sm font-medium -mb-px border-b-2 ${
                !chatEnabled
                  ? 'text-[#b09a8a] border-transparent'
                  : resolvedTab === 'chat'
                    ? 'text-[#fd6731] border-[#fd6731]'
                    : 'text-[#7c6757] border-transparent hover:text-[#2f2118]'
              }`}
            >
              Chat
            </button>
          </div>
        )}

        <div className="mt-6">
          {useEmbeddedPortfolioChat ? chatTab : null}
          {!useEmbeddedPortfolioChat && resolvedTab === 'chat' ? chatTab : null}
          {!useEmbeddedPortfolioChat && resolvedTab === 'metrics' ? (
            <>
              {/* Pre-hire should still show the same chart cards across agents (CLMM/Pendle/GMX)
                 so the page doesn't feel "empty" before hire. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={`${DETAIL_PANEL_CLASS} p-6`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-[#261a12]">APY Change</div>
                      <div className="mt-1 text-xs text-[#937c69]">Latest vs previous snapshot</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold text-teal-400">
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-7 w-20"
                          loadedClassName="text-teal-400"
                          value={formatPercent(currentApy)}
                        />
                      </div>
                      <div className="text-xs text-[#937c69]">
                        {currentApy !== undefined && previousApy !== undefined
                          ? formatPercent(currentApy - previousApy, 1)
                          : '—'}
                      </div>
                    </div>
                  </div>
                  <Sparkline
                    values={makeMockSeries({
                      seedKey: `${agentId}:apy`,
                      points: 24,
                      start: metrics.apy ?? 18,
                      drift: 0.02,
                      noise: 0.35,
                      min: 0,
                      max: 120,
                    })}
                  />
                </div>

                <div className={`${DETAIL_PANEL_CLASS} p-6`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-[#261a12]">Total Users</div>
                      <div className="mt-1 text-xs text-[#937c69]">All time</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold text-[#261a12]">
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-7 w-24"
                          loadedClassName="text-[#261a12]"
                          value={formatNumber(profile.totalUsers)}
                        />
                      </div>
                      <div className="text-xs text-[#937c69]">—</div>
                    </div>
                  </div>
                  <Sparkline
                    values={makeMockSeries({
                      seedKey: `${agentId}:users`,
                      points: 24,
                      start: Math.max(50, profile.totalUsers ?? 5000) * 0.6,
                      drift: Math.max(1, (profile.totalUsers ?? 5000) / 400),
                      noise: Math.max(2, (profile.totalUsers ?? 5000) / 250),
                      min: 0,
                    })}
                    strokeClassName="stroke-purple-300"
                    fillClassName="fill-purple-400/10"
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Tab Button Component
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  highlight?: boolean;
}

function TabButton({ active, onClick, children, disabled, highlight }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[2px] ${
        disabled
          ? 'text-[#b09a8a] cursor-not-allowed border-transparent'
          : active
            ? highlight
              ? 'text-[#fd6731] border-[#fd6731]'
              : 'text-[#261a12] border-[#d8c3ad]'
            : 'text-[#7c6757] hover:text-[#2f2118] border-transparent'
      }`}
    >
      {children}
    </button>
  );
}

function AgentChatTab(props: {
  agentName: string;
  isHired: boolean;
  isHiring: boolean;
  messages: Message[];
  chatDraft: string;
  onChatDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChatKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  isComposerEnabled: boolean;
  onSendChatMessage?: (content: string) => void;
}) {
  const visibleMessages = useMemo(() => {
    return props.messages
      .map(
        (message): VisibleChatMessage => ({
          id: message.id,
          label: getMessageRoleLabel(message),
          role: message.role,
          text: getMessageText(message),
        }),
      )
      .filter((message) => message.text.length > 0);
  }, [props.messages]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {visibleMessages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#d8c3ad] bg-[#fffaf2] px-4 py-5 text-sm text-[#7c6757]">
            {props.isHiring
              ? 'Submitting hire request...'
              : `Send a message to start a live conversation with ${props.agentName}.`}
          </div>
        ) : (
          visibleMessages.map((message) => (
            <div
              key={message.id}
              className={`rounded-2xl px-4 py-3 ${
                message.role === 'assistant'
                  ? 'border border-[#d4dbe9] bg-[#eef4ff] text-[#24406b]'
                  : message.role === 'reasoning'
                    ? 'border border-violet-200 bg-[#f4efff] text-[#5d3d8c]'
                  : message.role === 'user'
                    ? 'border border-[#f0d6c2] bg-[#fff0e6] text-[#7b3d20]'
                    : 'border border-[#eadac7] bg-[#fffaf2] text-[#261a12]'
              }`}
            >
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#907764]">
                {message.label}
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                <SimpleMarkdownText text={message.text} />
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={props.onSubmit} className="border-t border-[#eadac7] pt-4">
        <label className="block text-[12px] uppercase tracking-[0.14em] text-[#907764]">
          Message
        </label>
        <textarea
          value={props.chatDraft}
          onChange={(event) => props.onChatDraftChange(event.target.value)}
          onKeyDown={props.onChatKeyDown}
          rows={4}
          placeholder={`Ask ${props.agentName} what it can do.`}
          className="mt-3 w-full rounded-2xl border border-[#d8c3ad] bg-[#fffdf8] px-4 py-3 text-sm text-[#261a12] outline-none transition placeholder:text-[#9b826f] focus:border-[#fd6731]"
        />
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="text-xs text-[#937c69]">
            {props.isHired ? 'Live chat stays on the same thread.' : 'Chat works before and after hire.'}
          </div>
          <button
            type="submit"
            disabled={!props.isComposerEnabled || props.chatDraft.trim().length === 0}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#fd6731] px-4 text-[13px] font-medium text-white disabled:bg-[#eadac7] disabled:text-[#9b826f]"
          >
            Send message
          </button>
        </div>
      </form>
    </div>
  );
}

// Transaction History Tab Component
interface TransactionHistoryTabProps {
  agentId: string;
  transactions: Transaction[];
  taskId?: string;
  taskStatus?: string;
  telemetry?: TelemetryItem[];
  events?: ClmmEvent[];
  chainIconUri: string | null;
  protocolIconUri: string | null;
  protocolLabel: string | null;
}

function TransactionHistoryTab({
  agentId,
  transactions,
  taskId,
  taskStatus,
  telemetry = [],
  events = [],
  chainIconUri,
  protocolIconUri,
  protocolLabel,
}: TransactionHistoryTabProps) {
  const formatDate = (timestamp?: string) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {taskId && (
        <div className={`${DETAIL_INSET_CLASS} p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wide text-[#937c69]">Current Task</span>
              <p className="font-medium text-[#261a12]">{taskId.slice(0, 12)}...</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                taskStatus === 'working'
                  ? 'bg-[#dff4ea] text-[#2f7a57]'
                  : taskStatus === 'completed'
                    ? 'bg-[#e3edf8] text-[#496985]'
                    : 'bg-[#efe4d5] text-[#7c6757]'
              }`}
            >
              {taskStatus || 'pending'}
            </span>
          </div>
        </div>
      )}

      {telemetry.length > 0 && (
        <div className={`${DETAIL_INSET_CLASS} p-4`}>
          <div className="mb-2 text-xs uppercase tracking-wide text-[#937c69]">Latest Activity</div>
          <div className="space-y-2">
            {telemetry.slice(-3).reverse().map((t, i) => (
              <div
                key={`${t.cycle}-${i}`}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <span className="text-[#261a12]">Cycle {t.cycle}</span>
                  <span className="mx-2 text-[#937c69]">•</span>
                  <span className="text-[#7c6757]">{t.action}</span>
                </div>
                <span className="text-xs text-[#937c69]">{formatDate(t.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {transactions.length === 0 ? (
        <div className={`${DETAIL_PANEL_CLASS} p-8`}>
          <div className="mb-2 text-[12px] uppercase tracking-[0.14em] text-[#907764]">
            Transaction History
          </div>
          <div className="mb-1 text-lg font-semibold text-[#261a12]">No transactions yet</div>
          <div className="text-sm text-[#7c6757]">
            Transactions will appear here once the agent starts operating.
          </div>
        </div>
      ) : (
        <div className={`${DETAIL_PANEL_CLASS} overflow-hidden`}>
          <div className="flex items-center justify-between gap-6 border-b border-[#eadac7] px-5 py-4">
            <div>
              <div className="text-[12px] uppercase tracking-[0.14em] text-[#907764]">
                Transaction History
              </div>
              <div className="mt-1 text-sm text-[#7c6757]">
                Showing the latest {Math.min(10, transactions.length)} of {transactions.length}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-[#fff7ef]">
                <tr className="border-b border-[#eadac7] text-[11px] uppercase tracking-[0.14em] text-[#907764]">
                  <th className="text-left font-medium px-5 py-3">Transaction</th>
                  <th className="text-left font-medium px-5 py-3">Date &amp; time</th>
                  <th className="text-left font-medium px-5 py-3">Protocol</th>
                  <th className="text-right font-medium px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eadac7]">
                {transactions
                  .slice(-10)
                  .reverse()
                  .map((tx, index) => {
                    const shortHash = tx.txHash ? `${tx.txHash.slice(0, 10)}…${tx.txHash.slice(-4)}` : 'pending';
                    const status = tx.status ?? 'pending';

                    const statusPillClass =
                      status === 'success'
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25'
                        : status === 'failed'
                          ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/25'
                          : 'bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-500/25';

                    return (
                      <tr
                        key={`${tx.cycle}-${index}`}
                        className="transition-colors hover:bg-[#fff7ef]"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex items-center -space-x-2 flex-shrink-0">
                              {chainIconUri ? (
                                <img
                                  src={proxyIconUri(chainIconUri)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  className="h-7 w-7 rounded-full bg-[#f1e4d3] ring-1 ring-[#eadac7] object-contain"
                                />
                              ) : (
                                <div className="h-7 w-7 rounded-full bg-[#f1e4d3] ring-1 ring-[#eadac7]" />
                              )}
                              {protocolIconUri ? (
                                <img
                                  src={proxyIconUri(protocolIconUri)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  className="h-7 w-7 rounded-full bg-[#f1e4d3] ring-1 ring-[#eadac7] object-contain"
                                />
                              ) : (
                                <div className="h-7 w-7 rounded-full bg-[#f1e4d3] ring-1 ring-[#eadac7]" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="truncate font-medium text-[#261a12]">
                                Cycle {tx.cycle} · {tx.action}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-[#7c6757]">
                                {shortHash}
                                {tx.reason ? ` · ${tx.reason}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-sm text-[#6f5a4c]">
                          {formatDate(tx.timestamp)}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-sm text-[#6f5a4c]">
                          {protocolLabel ?? '—'}
                        </td>

                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[12px] font-medium ${statusPillClass}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className={`${DETAIL_PANEL_CLASS} p-6`}>
          <h3 className="mb-4 text-lg font-semibold text-[#261a12]">Activity Stream</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {events.slice(-10).reverse().map((event, i) => {
              const activityDescription = describeActivityEvent(event, agentId);
              return (
                <div key={i} className="flex items-start gap-3 rounded-lg bg-[#fff7ef] p-3">
                  <div
                    className={`w-2 h-2 rounded-full mt-2 ${
                      event.type === 'status'
                        ? 'bg-blue-400'
                        : event.type === 'artifact'
                          ? 'bg-purple-400'
                          : 'bg-gray-400'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs uppercase tracking-wide text-[#937c69]">{event.type}</div>
                    <div className="mt-1 whitespace-pre-line text-sm text-[#261a12]">
                      {activityDescription.body}
                    </div>
                    {activityDescription.details.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {activityDescription.details.map((detail) => (
                          <span
                            key={detail}
                            className="rounded-md border border-[#eadac7] bg-white/70 px-2 py-1 text-[11px] text-[#6f5a4c]"
                          >
                            {detail}
                          </span>
                        ))}
                      </div>
                    )}
                    {activityDescription.inspections.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {activityDescription.inspections.map((inspection) => {
                          if (inspection.kind === 'run') {
                            return (
                              <details
                                key={`${inspection.kind}-${inspection.id}`}
                                id={buildActivityElementId('run', inspection.id)}
                                className="rounded-md border border-[#eadac7] bg-white/80 px-3 py-2 text-xs text-[#503826]"
                              >
                                <summary className="flex cursor-pointer items-center gap-2 font-medium text-[#261a12]">
                                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                                  {inspection.label}
                                </summary>
                                <div className="mt-2 space-y-1 text-[#6f5a4c]">
                                  {inspection.detailLines.map((line) => (
                                    <div key={line}>{line}</div>
                                  ))}
                                  <a
                                    href={inspection.href}
                                    className="inline-flex items-center gap-1 font-medium text-[#7b4c2f] hover:text-[#3a2417]"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                    Open run {inspection.id}
                                  </a>
                                </div>
                              </details>
                            );
                          }

                          return (
                            <a
                              key={`${inspection.kind}-${inspection.id}`}
                              id={buildActivityElementId('artifact', inspection.id)}
                              href={inspection.href}
                              className="inline-flex items-center gap-1 rounded-md border border-[#eadac7] bg-white/80 px-3 py-2 text-xs font-medium text-[#503826] hover:bg-[#fff7ef]"
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              {inspection.label}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Agent Blockers Tab Component
interface AgentBlockersTabProps {
  agentId: string;
  activeInterrupt?: AgentInterrupt | null;
  allowedPools: Array<Pool | PendleMarket>;
  availableTokenSymbols?: string[];
  onInterruptSubmit?: (
    input:
      | OperatorConfigInput
      | PendleSetupInput
      | PortfolioManagerSetupInput
      | FundWalletAcknowledgement
      | GmxSetupInput
      | PiOperatorNoteInput
      | FundingTokenInput
      | DelegationSigningResponse,
  ) => void;
  taskId?: string;
  taskStatus?: string;
  haltReason?: string;
  executionError?: string;
  delegationsBypassActive?: boolean;
  onboardingFlow?: OnboardingFlow;
  settings?: AgentSettings;
  tokenIconBySymbol: Record<string, string>;
  onSettingsChange?: (updates: Partial<AgentSettings>) => void;
}

function AgentBlockersTab({
  agentId,
  activeInterrupt,
  allowedPools,
  availableTokenSymbols,
  onInterruptSubmit,
  taskId,
  taskStatus,
  haltReason,
  executionError,
  delegationsBypassActive,
  onboardingFlow,
  settings,
  tokenIconBySymbol,
  onSettingsChange,
}: AgentBlockersTabProps) {
  const {
    walletClient,
    privyWallet,
    chainId,
    switchChain,
    isLoading: isWalletLoading,
    error: walletError,
  } = usePrivyWalletClient();
  const delegationsBypassEnabled =
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_DELEGATIONS_BYPASS : undefined) ===
    'true';
  // Treat empty-string env as unset so the UI does not render a blank address.
  const walletBypassAddress =
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_WALLET_BYPASS_ADDRESS : undefined)?.trim() ||
    '0x0000000000000000000000000000000000000000';
  const delegationsBypassEnv = 'DELEGATIONS_BYPASS';
  const delegationContextLabel = resolveDelegationContextLabel(agentId);
  const connectedWalletAddress =
    privyWallet?.address ?? (delegationsBypassEnabled ? walletBypassAddress : '');

  const [poolAddress, setPoolAddress] = useState('');
  const [baseContributionUsd, setBaseContributionUsd] = useState(
    settings?.amount?.toString() ?? '',
  );
  const [targetMarket, setTargetMarket] = useState<'BTC' | 'ETH'>('BTC');
  const [fundingTokenAddress, setFundingTokenAddress] = useState('');
  const [isSigningDelegations, setIsSigningDelegations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTerminalTask = taskStatus === 'failed' || taskStatus === 'canceled';
  const showBlockingError = Boolean(haltReason || executionError) && isTerminalTask;
  const setupSteps = useMemo(
    () =>
      resolveSetupSteps({
        onboardingFlow,
      }),
    [
      onboardingFlow,
    ],
  );
  const maxSetupStep = setupSteps.length;
  const currentStep = resolveCurrentSetupStep({
    maxSetupStep,
    onboardingFlow,
  });
  const isPortfolioManagerSetupInterrupt =
    activeInterrupt?.type === 'portfolio-manager-setup-request';

  useEffect(() => {
    if (!isPortfolioManagerSetupInterrupt) {
      return;
    }

    setError(null);
  }, [isPortfolioManagerSetupInterrupt]);

  const isHexAddress = (value: string) => /^0x[0-9a-fA-F]+$/.test(value);
  const uniqueAllowedPools: Pool[] = [];
  const seenPoolAddresses = new Set<string>();
  const isPool = (value: unknown): value is Pool =>
    typeof value === 'object' &&
    value !== null &&
    'address' in value &&
    typeof (value as { address?: unknown }).address === 'string';
  for (const poolCandidate of allowedPools) {
    if (!isPool(poolCandidate)) continue;
    const pool = poolCandidate;
    if (seenPoolAddresses.has(pool.address)) continue;
    seenPoolAddresses.add(pool.address);
    uniqueAllowedPools.push(pool);
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!poolAddress) {
      setError('Please select a pool.');
      return;
    }

    const operatorWalletAddress =
      privyWallet?.address ?? (delegationsBypassEnabled ? walletBypassAddress : '');

    if (!operatorWalletAddress) {
      setError(
        delegationsBypassEnabled
          ? 'Connect a wallet or set NEXT_PUBLIC_WALLET_BYPASS_ADDRESS to continue.'
          : 'Connect a wallet to continue.',
      );
      return;
    }

    if (!isHexAddress(operatorWalletAddress)) {
      setError(
        delegationsBypassEnabled
          ? 'NEXT_PUBLIC_WALLET_BYPASS_ADDRESS must be a valid 0x-prefixed hex string.'
          : 'Connected wallet address is not a valid 0x-prefixed hex string.',
      );
      return;
    }

    const trimmedContribution = baseContributionUsd.trim();
    const parsedContribution =
      trimmedContribution === '' ? MIN_BASE_CONTRIBUTION_USD : Number(trimmedContribution);
    if (!Number.isFinite(parsedContribution)) {
      setError('Base contribution must be a valid number.');
      return;
    }
    if (parsedContribution < MIN_BASE_CONTRIBUTION_USD) {
      setError(`Base contribution must be at least $${MIN_BASE_CONTRIBUTION_USD}.`);
      return;
    }

    if (trimmedContribution === '') {
      setBaseContributionUsd(`${MIN_BASE_CONTRIBUTION_USD}`);
    }

    const baseContributionNumber = parsedContribution;
    onSettingsChange?.({ amount: baseContributionNumber });

    onInterruptSubmit?.({
      poolAddress: poolAddress as `0x${string}`,
      walletAddress: operatorWalletAddress as `0x${string}`,
      baseContributionUsd: baseContributionNumber,
    });
  };

  const handlePendleSetupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const operatorWalletAddress =
      privyWallet?.address ?? (delegationsBypassEnabled ? walletBypassAddress : '');

    if (!operatorWalletAddress) {
      setError(
        delegationsBypassEnabled
          ? 'Connect a wallet or set NEXT_PUBLIC_WALLET_BYPASS_ADDRESS to continue.'
          : 'Connect a wallet to continue.',
      );
      return;
    }

    if (!isHexAddress(operatorWalletAddress)) {
      setError(
        delegationsBypassEnabled
          ? 'NEXT_PUBLIC_WALLET_BYPASS_ADDRESS must be a valid 0x-prefixed hex string.'
          : 'Connected wallet address is not a valid 0x-prefixed hex string.',
      );
      return;
    }

    const trimmedContribution = baseContributionUsd.trim();
    const parsedContribution =
      trimmedContribution === '' ? MIN_BASE_CONTRIBUTION_USD : Number(trimmedContribution);
    if (!Number.isFinite(parsedContribution)) {
      setError('Funding amount must be a valid number.');
      return;
    }
    if (parsedContribution < MIN_BASE_CONTRIBUTION_USD) {
      setError(`Funding amount must be at least $${MIN_BASE_CONTRIBUTION_USD}.`);
      return;
    }

    if (trimmedContribution === '') {
      setBaseContributionUsd(`${MIN_BASE_CONTRIBUTION_USD}`);
    }

    const baseContributionNumber = parsedContribution;
    onSettingsChange?.({ amount: baseContributionNumber });

    onInterruptSubmit?.({
      walletAddress: operatorWalletAddress as `0x${string}`,
      baseContributionUsd: baseContributionNumber,
    });
  };

  const [portfolioManagerSetupMandate, setPortfolioManagerSetupMandate] =
    useState<PortfolioManagerMandateInput>(() => DEFAULT_PORTFOLIO_MANAGER_MANDATE_INPUT);

  const portfolioManagerSetupManagedMandate = useMemo<ManagedMandateInput>(
    () => ({
      lending_policy: buildManagedLendingPolicy({
        existingManagedMandate: null,
        collateralPolicies: [
          {
            asset: DEFAULT_MANAGED_LENDING_COLLATERAL_ASSET,
            max_allocation_pct: DEFAULT_MANAGED_LENDING_MAX_ALLOCATION_PCT,
          },
        ],
        allowedBorrowAssets: [],
      }),
    }),
    [],
  );

  const submitPortfolioManagerSetupMandate = async (
    managedMandate: ManagedMandateInput,
    portfolioManagerMandate: PortfolioManagerMandateInput = portfolioManagerSetupMandate,
  ) => {
    setError(null);

    const operatorWalletAddress =
      privyWallet?.address ?? (delegationsBypassEnabled ? walletBypassAddress : '');

    if (!operatorWalletAddress) {
      throw new Error(
        delegationsBypassEnabled
          ? 'Connect a wallet or set NEXT_PUBLIC_WALLET_BYPASS_ADDRESS to continue.'
          : 'Connect a wallet to continue.',
      );
    }

    if (!isHexAddress(operatorWalletAddress)) {
      throw new Error(
        delegationsBypassEnabled
          ? 'NEXT_PUBLIC_WALLET_BYPASS_ADDRESS must be a valid 0x-prefixed hex string.'
          : 'Connected wallet address is not a valid 0x-prefixed hex string.',
      );
    }

    onInterruptSubmit?.({
      walletAddress: operatorWalletAddress as `0x${string}`,
      portfolioMandate: {
        approved: true,
        riskLevel: 'medium',
      },
      portfolioManagerMandate,
      firstManagedMandate: {
        targetAgentId: 'ember-lending',
        targetAgentKey: 'ember-lending-primary',
        managedMandate,
      },
    });
  };

  const handleGmxSetupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    emitAgentConnectDebug({
      event: 'gmx-setup-submit-attempt',
      agentId,
      payload: {
        interruptType: activeInterrupt?.type ?? null,
        isWalletLoading,
        walletError: walletError?.message ?? null,
        hasPrivyWallet: Boolean(privyWallet?.address),
        connectedWalletAddress: connectedWalletAddress || null,
        targetMarket,
        baseContributionUsd,
      },
    });

    const operatorWalletAddress =
      privyWallet?.address ?? (delegationsBypassEnabled ? walletBypassAddress : '');

    if (!operatorWalletAddress) {
      setError(
        delegationsBypassEnabled
          ? 'Connect a wallet or set NEXT_PUBLIC_WALLET_BYPASS_ADDRESS to continue.'
          : 'Connect a wallet to continue.',
      );
      return;
    }

    if (!isHexAddress(operatorWalletAddress)) {
      setError(
        delegationsBypassEnabled
          ? 'NEXT_PUBLIC_WALLET_BYPASS_ADDRESS must be a valid 0x-prefixed hex string.'
          : 'Connected wallet address is not a valid 0x-prefixed hex string.',
      );
      return;
    }

    if (targetMarket !== 'BTC' && targetMarket !== 'ETH') {
      setError('Select a valid GMX market (BTC or ETH).');
      return;
    }

    const trimmedContribution = baseContributionUsd.trim();
    const parsedContribution =
      trimmedContribution === '' ? MIN_BASE_CONTRIBUTION_USD : Number(trimmedContribution);
    if (!Number.isFinite(parsedContribution)) {
      setError('USDC allocation must be a valid number.');
      return;
    }
    if (parsedContribution < MIN_BASE_CONTRIBUTION_USD) {
      setError(`USDC allocation must be at least $${MIN_BASE_CONTRIBUTION_USD}.`);
      return;
    }

    if (trimmedContribution === '') {
      setBaseContributionUsd(`${MIN_BASE_CONTRIBUTION_USD}`);
    }

    const baseContributionNumber = parsedContribution;
    onSettingsChange?.({ amount: baseContributionNumber });

    emitAgentConnectDebug({
      event: 'gmx-setup-submit-dispatch',
      agentId,
      payload: {
        walletAddress: operatorWalletAddress,
        targetMarket,
        baseContributionUsd: baseContributionNumber,
      },
    });

    onInterruptSubmit?.({
      walletAddress: operatorWalletAddress as `0x${string}`,
      baseContributionUsd: baseContributionNumber,
      targetMarket,
    });
  };

  const blockersInterruptView = useMemo(
    () =>
      resolveBlockersInterruptView({
        interruptType: activeInterrupt?.type,
        maxSetupStep,
      }),
    [activeInterrupt?.type, maxSetupStep],
  );
  const showOperatorConfigForm = blockersInterruptView.kind === 'operator-config';
  const showPendleSetupForm = blockersInterruptView.kind === 'pendle-setup';
  const showPortfolioManagerSetupForm = blockersInterruptView.kind === 'portfolio-manager-setup';
  const showPendleFundWalletForm = blockersInterruptView.kind === 'pendle-fund-wallet';
  const showGmxFundWalletForm = blockersInterruptView.kind === 'gmx-fund-wallet';
  const showGmxSetupForm = blockersInterruptView.kind === 'gmx-setup';
  const showFundingTokenForm = blockersInterruptView.kind === 'funding-token';
  const showDelegationSigningForm = blockersInterruptView.kind === 'delegation-signing';

  useEffect(() => {
    if (!showGmxSetupForm) return;

    emitAgentConnectDebug({
      event: 'gmx-setup-form-state',
      agentId,
      payload: {
        interruptType: activeInterrupt?.type ?? null,
        isWalletLoading,
        walletError: walletError?.message ?? null,
        hasPrivyWallet: Boolean(privyWallet?.address),
        connectedWalletAddress: connectedWalletAddress || null,
        targetMarket,
        baseContributionUsd,
        error,
      },
    });
  }, [
    activeInterrupt?.type,
    agentId,
    baseContributionUsd,
    connectedWalletAddress,
    error,
    isWalletLoading,
    privyWallet?.address,
    showGmxSetupForm,
    targetMarket,
    walletError?.message,
  ]);

  const fundingOptions: FundingTokenOption[] = showFundingTokenForm
    ? [...(activeInterrupt as { options: FundingTokenOption[] }).options].sort((a, b) => {
        const aValue = typeof a.valueUsd === 'number' && Number.isFinite(a.valueUsd) ? a.valueUsd : null;
        const bValue = typeof b.valueUsd === 'number' && Number.isFinite(b.valueUsd) ? b.valueUsd : null;
        if (aValue !== null && bValue !== null && aValue !== bValue) {
          return bValue - aValue;
        }
        if (aValue !== null && bValue === null) return -1;
        if (aValue === null && bValue !== null) return 1;
        try {
          const aBal = BigInt(a.balance);
          const bBal = BigInt(b.balance);
          if (aBal === bBal) return a.symbol.localeCompare(b.symbol);
          return aBal > bBal ? -1 : 1;
        } catch {
          return a.symbol.localeCompare(b.symbol);
        }
      })
    : [];

  const formatFundingBalance = (option: FundingTokenOption) => {
    try {
      return formatUnits(BigInt(option.balance), option.decimals);
    } catch {
      return option.balance;
    }
  };

  const handleFundingTokenSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isHexAddress(fundingTokenAddress)) {
      setError('Funding token address must be a 0x-prefixed hex string.');
      return;
    }

    onInterruptSubmit?.({
      fundingTokenAddress: fundingTokenAddress as `0x${string}`,
    });
  };

  const handleRejectDelegations = () => {
    setError(null);
    onInterruptSubmit?.({ outcome: 'rejected' });
  };

  const handleSignDelegations = async (delegationsToSign: UnsignedDelegation[]) => {
    setError(null);
    if (showDelegationSigningForm !== true) return;

    const interrupt = activeInterrupt as unknown as {
      chainId: number;
      delegationManager: `0x${string}`;
      delegatorAddress: `0x${string}`;
      delegationsToSign: UnsignedDelegation[];
    };

    if (!walletClient) {
      setError('Connect a wallet to sign delegations.');
      return;
    }
    if (isWalletLoading) {
      setError('Wallet is still loading. Try again in a moment.');
      return;
    }
    if (walletError) {
      setError(walletError.message);
      return;
    }
    if (chainId !== interrupt.chainId) {
      setError(`Switch your wallet to chainId=${interrupt.chainId} to sign delegations.`);
      return;
    }

    const requiredDelegatorAddress = interrupt.delegatorAddress.toLowerCase();
    const signerAddress = walletClient.account?.address?.toLowerCase();
    if (!signerAddress || signerAddress !== requiredDelegatorAddress) {
      setError(
        `Switch to Privy wallet ${interrupt.delegatorAddress} to sign delegations. Current signer: ${
          walletClient.account?.address ?? 'unknown'
        }.`,
      );
      return;
    }

    setIsSigningDelegations(true);
    try {
      emitAgentConnectDebug({
        event: 'gmx-delegation-sign-attempt',
        payload: {
          interruptType: activeInterrupt?.type ?? null,
          delegationCount: delegationsToSign.length,
          chainId,
          requiredChainId: interrupt.chainId,
          hasWalletClient: Boolean(walletClient),
          isWalletLoading,
        },
      });
      const signedDelegations = [];
      for (const delegation of delegationsToSign) {
        if (delegation.delegator.toLowerCase() !== requiredDelegatorAddress) {
          throw new Error(
            `Delegation delegator ${delegation.delegator} does not match required signer ${interrupt.delegatorAddress}.`,
          );
        }
        const signature = await signDelegationWithFallback({
          walletClient,
          delegation,
          delegationManager: interrupt.delegationManager,
          chainId: interrupt.chainId,
          account: interrupt.delegatorAddress,
        });
        signedDelegations.push({ ...delegation, signature });
      }

      const response: DelegationSigningResponse = { outcome: 'signed', signedDelegations };
      emitAgentConnectDebug({
        event: 'gmx-delegation-sign-dispatch',
        payload: {
          interruptType: activeInterrupt?.type ?? null,
          signedDelegationCount: signedDelegations.length,
        },
      });
      onInterruptSubmit?.(response);
    } catch (signError: unknown) {
      const message = formatDelegationSigningError({
        error: signError,
        context: {
          chainId: chainId ?? -1,
          expectedChainId: interrupt.chainId,
          requiredDelegatorAddress: interrupt.delegatorAddress,
          currentSignerAddress: walletClient.account?.address ?? null,
        },
      });
      emitAgentConnectDebug({
        event: 'gmx-delegation-sign-failed',
        payload: {
          interruptType: activeInterrupt?.type ?? null,
          message,
          chainId,
          requiredChainId: interrupt.chainId,
          signerAddress: walletClient.account?.address ?? null,
          requiredDelegatorAddress: interrupt.delegatorAddress,
          rawError:
            signError instanceof Error
              ? {
                  name: signError.name,
                  message: signError.message,
                  cause:
                    signError.cause instanceof Error
                      ? {
                          name: signError.cause.name,
                          message: signError.cause.message,
                        }
                      : signError.cause ?? null,
                }
              : signError,
        },
      });
      setError(`Failed to sign delegations: ${message}`);
    } finally {
      setIsSigningDelegations(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Error/Halt Display */}
      {showBlockingError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <span className="text-lg">⚠️</span>
            <span className="font-medium">Agent Blocked</span>
          </div>
          <p className="text-red-300 text-sm">{haltReason || executionError}</p>
        </div>
      )}

      {delegationsBypassActive && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
          <div className="text-yellow-300 text-sm font-medium mb-1">Delegation bypass active</div>
          <p className="text-yellow-200 text-xs">
            {` ${delegationsBypassEnv}=true `}is set. The agent will use its own wallet for
            {` ${delegationContextLabel} `}(not your wallet).
          </p>
        </div>
      )}

      <div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          {/* Form Area */}
          <div className={`${DETAIL_PANEL_CLASS} p-6`}>
            {showPendleSetupForm ? (
              <form onSubmit={handlePendleSetupSubmit}>
                <h3 className="mb-4 text-lg font-semibold text-[#261a12]">Pendle Setup</h3>
                {activeInterrupt?.message && (
                  <p className="mb-6 text-sm text-[#7c6757]">{activeInterrupt.message}</p>
                )}

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="mb-2 block text-sm text-[#7c6757]">Funding Amount (USD)</label>
                    <input
                      type="number"
                      value={baseContributionUsd}
                      onChange={(e) => setBaseContributionUsd(e.target.value)}
                      placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
                      min={MIN_BASE_CONTRIBUTION_USD}
                      className={DETAIL_INPUT_CLASS}
                    />
                  </div>

                  <div className={`${DETAIL_INSET_CLASS} p-4`}>
                    <div className="mb-2 text-sm font-medium text-[#503826]">PT position management</div>
                    <p className="text-xs text-[#7c6757]">
                      The agent configures and rebalances Pendle PT positions using your selected funding amount.
                    </p>
                    <p className="mt-3 text-xs text-[#937c69]">
                      Wallet: {connectedWalletAddress ? `${connectedWalletAddress.slice(0, 10)}…` : 'Not connected'}
                    </p>
                  </div>
                </div>

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isWalletLoading}
                    onClick={(event) => {
                      emitAgentConnectDebug({
                        event: 'gmx-setup-next-click',
                        agentId,
                        payload: {
                          disabled: event.currentTarget.disabled,
                          isWalletLoading,
                          hasPrivyWallet: Boolean(privyWallet?.address),
                          connectedWalletAddress: connectedWalletAddress || null,
                          targetMarket,
                          baseContributionUsd,
                        },
                      });
                    }}
                    className={`${DETAIL_NEUTRAL_BUTTON_CLASS} px-6 py-2.5`}
                  >
                    Next
                  </button>
                </div>
              </form>
            ) : showPortfolioManagerSetupForm ? (
              <div>
                <h3 className="mb-4 text-lg font-semibold text-[#261a12]">Ember Portfolio Agent Setup</h3>
                {activeInterrupt?.message && (
                  <p className="mb-6 text-sm text-[#7c6757]">{activeInterrupt.message}</p>
                )}

                <div className="space-y-4 mb-6">
                  <div className={`${DETAIL_INSET_CLASS} p-4`}>
                    <div className="mb-2 text-sm font-medium text-[#503826]">Portfolio manager mandate</div>
                    <p className="mb-4 text-xs text-[#7c6757]">
                      Tune the portfolio-wide PM mandate before approving managed lending control.
                    </p>
                    <PortfolioManagerMandateWorkbenchShell variant="portfolio-manager">
                      <PortfolioManagerMandateWorkbenchCard
                        view={{
                          ownerAgentId: agentId,
                          targetAgentId: 'agent-portfolio-manager',
                          targetAgentRouteId: 'agent-portfolio-manager',
                          targetAgentKey: 'portfolio-manager-primary',
                          title: 'Portfolio Manager Mandate',
                          mandateRef: null,
                          managedMandate: portfolioManagerSetupMandate,
                        }}
                        chrome="plain"
                        submitLabel="Save PM mandate"
                        onDraftChange={setPortfolioManagerSetupMandate}
                        onSave={(input) =>
                          setPortfolioManagerSetupMandate(
                            input.managedMandate as PortfolioManagerMandateInput,
                          )
                        }
                      />
                    </PortfolioManagerMandateWorkbenchShell>
                  </div>

                  <div className={`${DETAIL_INSET_CLASS} p-4`}>
                    <div className="mb-2 text-sm font-medium text-[#503826]">First managed lending lane</div>
                    <p className="mb-4 text-xs text-[#7c6757]">
                      Configure the first lending mandate inline before handing control to the portfolio manager.
                    </p>
                    <PortfolioManagerMandateWorkbenchShell variant="managed-lending">
                      <ManagedMandateWorkbenchCard
                        view={{
                          ownerAgentId: agentId,
                          targetAgentId: 'ember-lending',
                          targetAgentRouteId: 'agent-ember-lending',
                          mandateRef: null,
                          managedMandate: portfolioManagerSetupManagedMandate,
                        }}
                        availableTokenSymbols={availableTokenSymbols}
                        tokenIconBySymbolOverride={tokenIconBySymbol}
                        chrome="plain"
                        submitLabel="Continue onboarding"
                        onSave={(input) => submitPortfolioManagerSetupMandate(input.managedMandate)}
                      />
                    </PortfolioManagerMandateWorkbenchShell>
                  </div>
                </div>
              </div>
            ) : showPendleFundWalletForm ? (
              <div>
                <h3 className="mb-4 text-lg font-semibold text-[#261a12]">Fund Wallet</h3>
                {activeInterrupt?.message && (
                  <p className="mb-6 text-sm text-[#7c6757]">{activeInterrupt.message}</p>
                )}

                <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4 mb-6">
                  <div className="text-yellow-300 text-sm font-medium mb-2">What to do</div>
                  <ul className="space-y-1 text-yellow-200 text-xs">
                    <li>
                      Add a small balance of an eligible stablecoin on Arbitrum to your wallet, then click Continue.
                    </li>
                    <li>
                      Eligible: {(activeInterrupt as unknown as { whitelistSymbols?: string[] }).whitelistSymbols?.join(', ') || 'USDai, USDC'}
                    </li>
                    <li>
                      Wallet: {(activeInterrupt as unknown as { walletAddress?: string }).walletAddress || connectedWalletAddress || 'Unknown'}
                    </li>
                  </ul>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onInterruptSubmit?.({ acknowledged: true })}
                    className={`${DETAIL_NEUTRAL_BUTTON_CLASS} px-6 py-2.5`}
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : showGmxFundWalletForm ? (
              <div>
                <h3 className="mb-4 text-lg font-semibold text-[#261a12]">Fund Wallet</h3>
                {activeInterrupt?.message && (
                  <p className="mb-6 text-sm text-[#7c6757]">{activeInterrupt.message}</p>
                )}

                <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4 mb-6">
                  <div className="text-yellow-300 text-sm font-medium mb-2">What to do</div>
                  <ul className="space-y-1 text-yellow-200 text-xs">
                    <li>
                      Add enough{' '}
                      {(activeInterrupt as unknown as { requiredCollateralSymbol?: string })
                        .requiredCollateralSymbol || 'USDC'}{' '}
                      on Arbitrum for GMX collateral.
                    </li>
                    <li>Add a small amount of Arbitrum ETH for execution gas fees.</li>
                    <li>
                      Wallet:{' '}
                      {(activeInterrupt as unknown as { walletAddress?: string }).walletAddress ||
                        connectedWalletAddress ||
                        'Unknown'}
                    </li>
                  </ul>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onInterruptSubmit?.({ acknowledged: true })}
                    className={`${DETAIL_NEUTRAL_BUTTON_CLASS} px-6 py-2.5`}
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : showGmxSetupForm ? (
              <form
                onSubmitCapture={() => {
                  emitAgentConnectDebug({
                    event: 'gmx-setup-form-submit-capture',
                    agentId,
                    payload: {
                      isWalletLoading,
                      hasPrivyWallet: Boolean(privyWallet?.address),
                      connectedWalletAddress: connectedWalletAddress || null,
                      targetMarket,
                      baseContributionUsd,
                    },
                  });
                }}
                onSubmit={handleGmxSetupSubmit}
              >
                <h3 className="mb-4 text-lg font-semibold text-[#261a12]">GMX Allora Setup</h3>
                {activeInterrupt?.message && (
                  <p className="mb-6 text-sm text-[#7c6757]">{activeInterrupt.message}</p>
                )}

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="mb-2 block text-sm text-[#7c6757]">Target Market</label>
                    <select
                      value={targetMarket}
                      onChange={(e) => setTargetMarket(e.target.value as 'BTC' | 'ETH')}
                      className={DETAIL_INPUT_CLASS}
                    >
                      <option value="BTC">BTC / USDC</option>
                      <option value="ETH">ETH / USDC</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-[#7c6757]">USDC Allocation</label>
                    <input
                      type="number"
                      value={baseContributionUsd}
                      onChange={(e) => setBaseContributionUsd(e.target.value)}
                      placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
                      min={MIN_BASE_CONTRIBUTION_USD}
                      className={DETAIL_INPUT_CLASS}
                    />
                  </div>

                  <div className={`${DETAIL_INSET_CLASS} p-4`}>
                    <div className="mb-2 text-sm font-medium text-[#503826]">Allora Signal Source</div>
                    <p className="text-xs text-[#7c6757]">
                      The agent consumes 8-hour Allora prediction feeds and enforces max 2x leverage.
                    </p>
                    <p className="mt-3 text-xs text-[#937c69]">
                      Wallet: {connectedWalletAddress ? `${connectedWalletAddress.slice(0, 10)}…` : 'Not connected'}
                    </p>
                  </div>
                </div>

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isWalletLoading}
                    className={`${DETAIL_NEUTRAL_BUTTON_CLASS} px-6 py-2.5`}
                  >
                    Next
                  </button>
                </div>
              </form>
            ) : showOperatorConfigForm ? (
              <form onSubmit={handleSubmit}>
                <h3 className="mb-4 text-lg font-semibold text-[#261a12]">Agent Preferences</h3>
                {activeInterrupt?.message && (
                  <p className="mb-6 text-sm text-[#7c6757]">{activeInterrupt.message}</p>
                )}

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="mb-2 block text-sm text-[#7c6757]">Select Pool</label>
                    <select
                      value={poolAddress}
                      onChange={(e) => setPoolAddress(e.target.value)}
                      className={DETAIL_INPUT_CLASS}
                    >
                      <option value="">Choose a pool...</option>
                      {uniqueAllowedPools.map((pool) => (
                        <option key={pool.address} value={pool.address}>
                          {formatPoolPair(pool)} — {pool.address.slice(0, 10)}
                          ...
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-[#7c6757]">Allocated Funds (USD)</label>
                    <input
                      type="number"
                      value={baseContributionUsd}
                      onChange={(e) => setBaseContributionUsd(e.target.value)}
                      placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
                      min={MIN_BASE_CONTRIBUTION_USD}
                      className={DETAIL_INPUT_CLASS}
                    />
                    <button
                      type="button"
                      className={`${DETAIL_NEUTRAL_BUTTON_CLASS} mt-2 px-4 py-1.5 text-sm`}
                    >
                      Approve
                    </button>
                  </div>
                </div>

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isWalletLoading}
                    className={`${DETAIL_NEUTRAL_BUTTON_CLASS} px-6 py-2.5`}
                  >
                    Next
                  </button>
                </div>
              </form>
            ) : showFundingTokenForm ? (
              <form onSubmit={handleFundingTokenSubmit}>
                <h3 className="mb-4 text-lg font-semibold text-[#261a12]">Select Funding Token</h3>
                {activeInterrupt?.message && (
                  <p className="mb-6 text-sm text-[#7c6757]">{activeInterrupt.message}</p>
                )}

                <div className="mb-6">
                  <label className="mb-2 block text-sm text-[#7c6757]">Funding Token</label>
                  <select
                    value={fundingTokenAddress}
                    onChange={(e) => setFundingTokenAddress(e.target.value)}
                    className={DETAIL_INPUT_CLASS}
                  >
                    <option value="">Choose a token...</option>
                    {fundingOptions.map((option) => (
                      <option key={option.address} value={option.address}>
                        {option.symbol} — {formatFundingBalance(option)} ({option.address.slice(0, 8)}…)
                      </option>
                    ))}
                  </select>
                </div>

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className={`${DETAIL_NEUTRAL_BUTTON_CLASS} px-6 py-2.5`}
                  >
                    Next
                  </button>
                </div>
              </form>
            ) : showDelegationSigningForm ? (
              <div>
                <h3 className="mb-4 text-lg font-semibold text-[#261a12]">Authorize portfolio manager</h3>

                <div className={`${DETAIL_INSET_CLASS} mb-6 p-4`}>
                  <p className="text-sm font-medium text-[#503826]">
                    Sign once to let this portfolio manager operate the mandates you approved.
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#7c6757]">
                    This authorizes the portfolio manager to coordinate managed agents through your rooted
                    delegation. Only continue if you trust this session and the mandate settings shown above.
                  </p>
                </div>

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                {walletError && !error && (
                  <p className="text-red-400 text-sm mb-4">{walletError.message}</p>
                )}
                {delegationsBypassEnabled && !walletClient && !error && !walletError && (
                  <p className="text-yellow-300 text-sm mb-4">
                    Wallet bypass is enabled. To skip delegation signing, run the agent with
                    {` ${delegationsBypassEnv}=true`}.
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleRejectDelegations}
                    className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 text-sm transition-colors"
                    disabled={isSigningDelegations}
                  >
                    Reject
                  </button>
                  <div className="flex items-center gap-2">
                    {chainId !== null &&
                      (activeInterrupt as unknown as { chainId?: number }).chainId !== undefined &&
                      chainId !== (activeInterrupt as unknown as { chainId: number }).chainId && (
                        <button
                          type="button"
                          onClick={() =>
                            switchChain((activeInterrupt as unknown as { chainId: number }).chainId).catch(
                              () => void 0,
                            )
                          }
                          className={`${DETAIL_NEUTRAL_BUTTON_CLASS} px-4 py-2 text-sm`}
                          disabled={isSigningDelegations}
                        >
                          Switch Chain
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() =>
                        handleSignDelegations(
                          (activeInterrupt as unknown as { delegationsToSign: UnsignedDelegation[] })
                            .delegationsToSign,
                        )
                      }
                      className="px-6 py-2.5 rounded-lg bg-[#fd6731] hover:bg-[#fd6731]/90 text-white font-medium transition-colors disabled:opacity-60"
                      disabled={isSigningDelegations || !walletClient}
                    >
                      {isSigningDelegations ? 'Signing…' : 'Sign & Continue'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="mb-4 text-4xl text-[#b09a8a]">⏳</div>
                <h3 className="mb-2 text-lg font-medium text-[#261a12]">Waiting for the next onboarding prompt</h3>
                <p className="text-sm text-[#937c69]">
                  The agent will request funding token options or signatures when needed.
                </p>
              </div>
            )}
          </div>

          {/* Steps Sidebar */}
          <div className="space-y-2">
            {setupSteps.map((step) => (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
                  step.id === currentStep ? 'bg-[#fff7ef]' : ''
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                    step.id === currentStep
                      ? 'bg-[#fd6731] text-white'
                      : step.id < currentStep
                        ? 'bg-teal-500 text-white'
                        : 'bg-[#eadac7] text-[#937c69]'
                  }`}
                >
                  {step.id < currentStep ? <Check className="w-3 h-3" /> : step.id}
                </div>
                <div>
                  <p
                    className={`text-sm font-medium ${
                      step.id === currentStep ? 'text-[#261a12]' : 'text-[#937c69]'
                    }`}
                  >
                    {step.name}
                  </p>
                  {step.id === currentStep && (
                    <p className="mt-1 text-xs text-[#937c69]">{step.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Shared Components
interface StatBoxProps {
  label: string;
  value: string | null;
  valueColor?: string;
  isLoaded: boolean;
}

function StatBox({ label, value, valueColor = 'text-[#261a12]', isLoaded }: StatBoxProps) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-[#937c69]">{label}</div>
      {!isLoaded ? (
        <Skeleton className="h-6 w-20" />
      ) : value !== null ? (
          <div className={`text-xl font-semibold ${valueColor}`}>{value}</div>
        ) : (
          <div className="text-sm text-[#b09a8a]">-</div>
        )}
    </div>
  );
}

interface TagColumnProps {
  title: string;
  items: string[];
  getIconUri: (item: string) => string | null;
}

function TagColumn({ title, items, getIconUri }: TagColumnProps) {
  if (items.length === 0) {
    return (
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-[#937c69]">{title}</div>
        <div className="text-sm text-[#b09a8a]">—</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-[#937c69]">{title}</div>
      <div className="space-y-1.5">
        {items.slice(0, 3).map((item) => {
          const iconUri = getIconUri(item);
          return (
            <div key={item} className="flex items-center gap-2">
              {iconUri ? (
                <img
                  src={proxyIconUri(iconUri)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-4 w-4 rounded-full bg-[#f1e4d3] ring-1 ring-[#eadac7] object-contain"
                />
              ) : (
                <div
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-[#fff7ef] text-[7px] font-semibold text-[#7c6757] ring-1 ring-[#eadac7] select-none"
                  aria-hidden="true"
                >
                  {iconMonogram(item)}
                </div>
              )}
              <span className="text-sm text-[#261a12]">{item}</span>
            </div>
          );
        })}
        {items.length > 3 ? (
          <CursorListTooltip
            title={`${title} (more)`}
            items={items.slice(3).map((label) => ({
              label,
              iconUri: getIconUri(label),
            }))}
          >
            <div className="inline-flex cursor-default select-none items-center gap-1.5 text-xs text-[#7c6757]">
              <span className="flex h-5 w-6 items-center justify-center rounded-md bg-[#fff7ef] text-[12px] font-semibold text-[#6f5a4c] ring-1 ring-[#eadac7]">
                …
              </span>
              <span>{items.length - 3} more</span>
            </div>
          </CursorListTooltip>
        ) : null}
      </div>
    </div>
  );
}

interface PointsColumnProps {
  metrics: AgentMetrics;
}

function PointsColumn({ metrics }: PointsColumnProps) {
  const hasAnyMetric =
    metrics.iteration !== undefined ||
    metrics.cyclesSinceRebalance !== undefined ||
    metrics.rebalanceCycles !== undefined;

  if (!hasAnyMetric) {
    return (
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-[#937c69]">Points</div>
        <div className="text-sm text-[#b09a8a]">—</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-[#937c69]">Points</div>
      <div className="space-y-1.5">
        {metrics.iteration !== undefined && (
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <span className="text-sm text-[#261a12]">{metrics.iteration}x</span>
          </div>
        )}
        {metrics.cyclesSinceRebalance !== undefined && (
          <div className="flex items-center gap-2">
            <Minus className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-[#261a12]">{metrics.cyclesSinceRebalance}x</span>
          </div>
        )}
        {metrics.rebalanceCycles !== undefined && (
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-[#261a12]">{metrics.rebalanceCycles}x</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Settings Tab Component
interface SettingsTabProps {
  settings?: AgentSettings;
  onSettingsChange?: (updates: Partial<AgentSettings>) => void;
  onSettingsSave?: (updates: Partial<AgentSettings>) => void;
  isSyncing?: boolean;
}

function SettingsTab({ settings, onSettingsChange, onSettingsSave, isSyncing }: SettingsTabProps) {
  const [localAmount, setLocalAmount] = useState(settings?.amount?.toString() ?? '');
  const resolvedAllocationAmount = asFiniteNumber(settings?.amount);

  const handleSave = () => {
    if (!onSettingsChange && !onSettingsSave) return;

    const trimmedAmount = localAmount.trim();
    const parsedAmount =
      trimmedAmount === '' ? MIN_BASE_CONTRIBUTION_USD : Number(trimmedAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < MIN_BASE_CONTRIBUTION_USD) {
      return;
    }

    if (trimmedAmount === '') {
      setLocalAmount(`${MIN_BASE_CONTRIBUTION_USD}`);
    }
    if (onSettingsSave) {
      onSettingsSave({ amount: parsedAmount });
      return;
    }
    onSettingsChange?.({ amount: parsedAmount });
  };

  return (
    <div className="space-y-6">
      <div className={`${DETAIL_PANEL_CLASS} p-6`}>
        <h3 className="mb-4 text-lg font-semibold text-[#261a12]">Allocation Settings</h3>
        <p className="mb-6 text-sm text-[#7c6757]">
          Configure the amount of funds allocated to this agent for liquidity operations.
        </p>

        <div className="max-w-md">
          <label className="mb-2 block text-sm text-[#7c6757]">Allocated Amount (USD)</label>
          <div className="flex gap-3">
            <input
              type="number"
              value={localAmount}
              onChange={(e) => setLocalAmount(e.target.value)}
              placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
              min={MIN_BASE_CONTRIBUTION_USD}
              className={`flex-1 ${DETAIL_INPUT_CLASS}`}
            />
            <button
              onClick={handleSave}
              disabled={isSyncing || (!onSettingsChange && !onSettingsSave)}
              className="px-6 py-3 rounded-lg bg-[#fd6731] hover:bg-[#e55a28] text-white font-medium transition-colors disabled:opacity-60"
            >
              {isSyncing ? 'Syncing...' : 'Save'}
            </button>
          </div>
          {resolvedAllocationAmount !== undefined && (
            <p className="mt-2 text-xs text-[#937c69]">
              Current allocation: ${resolvedAllocationAmount.toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className={`${DETAIL_PANEL_CLASS} p-6`}>
        <h3 className="mb-4 text-lg font-semibold text-[#261a12]">Policies</h3>
        <p className="text-sm text-[#937c69]">
          Additional policy settings will be available in a future update.
        </p>
      </div>
    </div>
  );
}

export const __agentDetailPageTestOnly = {
  TransactionHistoryTab,
  AgentBlockersTab,
  TagColumn,
  PointsColumn,
  MetricsTab,
  GmxAlloraMetricsTab,
  PendleMetricsTab,
  SettingsTab,
};
