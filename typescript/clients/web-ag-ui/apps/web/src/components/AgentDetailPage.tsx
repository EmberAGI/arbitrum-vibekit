'use client';

/* eslint-disable @next/next/no-img-element */

import {
  ChevronRight,
  ChevronDown,
  Star,
  Globe,
  Github,
  TrendingUp,
  Minus,
  Check,
  RefreshCw,
} from 'lucide-react';
import type { Message } from '@ag-ui/core';
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
import { buildPortfolioManagerSetupInput } from '../utils/portfolioManagerSetup';
import {
  buildManagedMandateSummary,
  canonicalizeManagedMandateAssets,
  DEFAULT_MANAGED_MANDATE_ROOT_ASSET,
  normalizeManagedMandateAssetSymbol,
  parseManagedMandateAssetList,
} from '../utils/managedMandate';
import {
  buildPiExampleInterruptA2UiView,
  buildPiExampleStatusA2UiView,
  PiExampleA2UiCard,
  type PiExampleA2UiView,
} from './piExampleA2ui';

export type { AgentProfile, AgentMetrics, Transaction, TelemetryItem, ClmmEvent };

const MIN_BASE_CONTRIBUTION_USD = 10;
const AGENT_WEBSITE_URL = 'https://emberai.xyz';
const AGENT_GITHUB_URL = 'https://github.com/EmberAGI/arbitrum-vibekit';
const AGENT_X_URL = 'https://x.com/emberagi';

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
    <div className="mt-5 h-[160px] rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
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

  return '';
}

function getMessageRoleLabel(message: Message): string {
  if (message.role === 'assistant') return 'Agent';
  if (message.role === 'reasoning') return 'Reasoning';
  if (message.role === 'tool') return 'Tool';
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

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

type ManagedMandateEditorView = {
  ownerAgentId: string;
  targetAgentId: string;
  targetAgentRouteId: string;
  targetAgentKey: string;
  title: string;
  laneLabel: string | null;
  mandateRef: string | null;
  mandateSummary: string | null;
  managedMandate: Record<string, unknown> | null;
  walletAddress: string | null;
  rootUserWallet: string | null;
  rootedWalletContextId: string | null;
  reservationSummary: string | null;
};

type ManagedMandateEditorSubmitInput = {
  ownerAgentId: string;
  targetAgentId: string;
  targetAgentRouteId: string;
  mandateSummary: string;
  managedMandate: ManagedMandateInput;
};

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
  const assetIntent = asRecord(managedMandate?.['asset_intent']);

  return {
    ownerAgentId,
    targetAgentId,
    targetAgentRouteId,
    targetAgentKey,
    title: readString(editor['targetAgentTitle']) ?? 'Managed lending lane',
    laneLabel: formatManagedLaneLabel(
      readString(assetIntent?.['network']),
      readLaneProtocolFromControlPath(readString(assetIntent?.['control_path'])),
    ),
    mandateRef: readString(editor['mandateRef']),
    mandateSummary: readString(editor['mandateSummary']),
    managedMandate,
    walletAddress: readString(editor['agentWallet']),
    rootUserWallet: readString(editor['rootUserWallet']),
    rootedWalletContextId: readString(editor['rootedWalletContextId']),
    reservationSummary: buildReservationSummaryFromProjection(asRecord(editor['reservation'])),
  };
}

type PortfolioManagerManagedAgentView = {
  title: string;
  detailHref: string;
  laneLabel: string | null;
  mandateSummary: string | null;
  reservationSummary: string | null;
};

function buildPortfolioManagerManagedAgentView(
  domainProjection: Record<string, unknown> | undefined,
): PortfolioManagerManagedAgentView | null {
  const managedMandateEditorView = readManagedMandateEditorView(domainProjection);
  if (!managedMandateEditorView) {
    return null;
  }

  return {
    title: managedMandateEditorView.title,
    detailHref: `/hire-agents/${managedMandateEditorView.targetAgentRouteId}`,
    laneLabel: managedMandateEditorView.laneLabel,
    mandateSummary: managedMandateEditorView.mandateSummary,
    reservationSummary: managedMandateEditorView.reservationSummary,
  };
}

type EmberLendingRuntimeView = {
  phase: string | null;
  laneLabel: string | null;
  walletAddress: string | null;
  mandateSummary: string | null;
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
    mandateSummary: managedMandateEditorView?.mandateSummary ?? null,
    reservationSummary: managedMandateEditorView?.reservationSummary ?? null,
  };

  return runtimeView.phase ||
    runtimeView.laneLabel ||
    runtimeView.walletAddress ||
    runtimeView.mandateSummary ||
    runtimeView.reservationSummary
    ? runtimeView
    : null;
}

function ManagedMandateEditorCard(props: {
  view: ManagedMandateEditorView;
  onSave?: (input: ManagedMandateEditorSubmitInput) => Promise<void> | void;
}) {
  const initialRootAsset = normalizeManagedMandateAssetSymbol(
    readString(asRecord(props.view.managedMandate?.['asset_intent'])?.['root_asset']) ?? '',
  );
  const initialAllowedAssets = Array.isArray(props.view.managedMandate?.['allowed_assets'])
    ? props.view.managedMandate?.['allowed_assets']
        .map((value) => (typeof value === 'string' ? normalizeManagedMandateAssetSymbol(value) : ''))
        .filter((value) => value.length > 0)
    : [];
  const initialAllowedAssetsValue = initialAllowedAssets.join(', ');
  const [rootAsset, setRootAsset] = useState(initialRootAsset);
  const [allowedAssetsInput, setAllowedAssetsInput] = useState(initialAllowedAssetsValue);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setRootAsset(initialRootAsset);
    setAllowedAssetsInput(initialAllowedAssetsValue);
    setSubmitError(null);
  }, [initialAllowedAssetsValue, initialRootAsset, props.view.mandateRef]);

  const assetIntent = asRecord(props.view.managedMandate?.['asset_intent']);
  const protocolSystem: ManagedMandateInput['asset_intent']['protocol_system'] =
    assetIntent?.['protocol_system'] === 'aave' ? 'aave' : 'aave';
  const network: ManagedMandateInput['asset_intent']['network'] =
    assetIntent?.['network'] === 'arbitrum' ? 'arbitrum' : 'arbitrum';
  const controlPath: ManagedMandateInput['asset_intent']['control_path'] =
    assetIntent?.['control_path'] === 'lending.supply' ? 'lending.supply' : 'lending.supply';
  const benchmarkAsset: ManagedMandateInput['asset_intent']['benchmark_asset'] =
    assetIntent?.['benchmark_asset'] === 'USD' ? 'USD' : 'USD';
  const intent: ManagedMandateInput['asset_intent']['intent'] =
    assetIntent?.['intent'] === 'position.enter' ? 'position.enter' : 'position.enter';
  const allocationBasis: ManagedMandateInput['allocation_basis'] =
    props.view.managedMandate?.['allocation_basis'] === 'allocable_idle'
      ? 'allocable_idle'
      : 'allocable_idle';

  const handleSave = async () => {
    if (!props.onSave) {
      return;
    }

    const normalizedRootAsset = normalizeManagedMandateAssetSymbol(rootAsset);
    if (normalizedRootAsset.length === 0) {
      setSubmitError('Root asset is required.');
      return;
    }

    const allowedAssets = parseManagedMandateAssetList(allowedAssetsInput);
    const normalizedAllowedAssets = canonicalizeManagedMandateAssets(
      normalizedRootAsset,
      allowedAssets,
    );

    if (normalizedAllowedAssets.length === 0) {
      setSubmitError('At least one allowed asset is required.');
      return;
    }

    setIsSaving(true);
    setSubmitError(null);
    try {
      await props.onSave({
        ownerAgentId: props.view.ownerAgentId,
        targetAgentId: props.view.targetAgentId,
        targetAgentRouteId: props.view.targetAgentRouteId,
        mandateSummary: buildManagedMandateSummary(normalizedAllowedAssets),
        managedMandate: {
          allocation_basis: allocationBasis,
          allowed_assets: normalizedAllowedAssets,
          asset_intent: {
            root_asset: normalizedRootAsset,
            protocol_system: protocolSystem,
            network,
            benchmark_asset: benchmarkAsset,
            intent,
            control_path: controlPath,
          },
        },
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Managed mandate update failed.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.16)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
            Managed mandate
          </div>
          <div className="mt-2 text-base font-semibold text-white">{props.view.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
              {network}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
              {controlPath}
            </span>
          </div>
        </div>
        {props.view.mandateRef ? (
          <div className="text-right text-[11px] uppercase tracking-[0.18em] text-white/35">
            {props.view.mandateRef}
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Root asset</label>
          <input
            type="text"
            value={rootAsset}
            onChange={(event) => setRootAsset(event.target.value)}
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#121212] px-4 py-3 text-white outline-none transition-colors focus:border-[#fd6731]"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-2">Allowed assets</label>
          <input
            type="text"
            value={allowedAssetsInput}
            onChange={(event) => setAllowedAssetsInput(event.target.value)}
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#121212] px-4 py-3 text-white outline-none transition-colors focus:border-[#fd6731]"
          />
          <div className="mt-2 text-xs text-gray-500">Comma-separated asset symbols.</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-[#151515] p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Summary preview</div>
        <div className="mt-2 text-sm leading-relaxed text-gray-300">
          {buildManagedMandateSummary(
            canonicalizeManagedMandateAssets(
              normalizeManagedMandateAssetSymbol(rootAsset),
              parseManagedMandateAssetList(allowedAssetsInput),
            ),
          )}
        </div>
      </div>

      {submitError ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {submitError}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!props.onSave || isSaving}
          className="rounded-lg bg-[#fd6731] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#e55a28] disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save managed mandate'}
        </button>
      </div>
    </div>
  );
}

type PiExampleChatCard = {
  id: string;
  label: 'Artifact' | 'A2UI';
  view: PiExampleA2UiView;
  actionKind?: 'submit-operator-note';
};

function buildPiExampleChatCards(events: ClmmEvent[]): PiExampleChatCard[] {
  return events.flatMap((event, index): PiExampleChatCard[] => {
    if (event.type === 'artifact') {
      const artifactData = asRecord(event.artifact?.data);
      if (artifactData?.type === 'automation-status') {
        const status = typeof artifactData.status === 'string' ? artifactData.status : 'unknown';
        const command = typeof artifactData.command === 'string' ? artifactData.command : 'refresh';
        const detail = typeof artifactData.detail === 'string' ? artifactData.detail : 'Automation status updated.';
        return [
          {
            id: `artifact-${event.artifact?.artifactId ?? 'unknown'}-${index}`,
            label: 'Artifact',
            view: buildPiExampleStatusA2UiView({
              title: `Automation ${status}`,
              body: `${command}: ${detail}`,
            }),
          },
        ];
      }

      if (artifactData?.type === 'lifecycle-status') {
        const phase = typeof artifactData.phase === 'string' ? artifactData.phase : 'unknown';
        const onboardingStep =
          typeof artifactData.onboardingStep === 'string' ? artifactData.onboardingStep : null;
        const operatorNote =
          typeof artifactData.operatorNote === 'string' ? artifactData.operatorNote : null;
        const detailLines = [
          onboardingStep ? `Step: ${onboardingStep}` : null,
          operatorNote ? `Operator note: ${operatorNote}` : null,
        ].filter((line): line is string => line !== null);

        return [
          {
            id: `lifecycle-artifact-${event.artifact?.artifactId ?? 'unknown'}-${index}`,
            label: 'Artifact',
            view: buildPiExampleStatusA2UiView({
              title: `Lifecycle ${phase}`,
              body: detailLines.length > 0 ? detailLines.join('\n') : 'Lifecycle state updated.',
            }),
          },
        ];
      }

      if (artifactData?.type === 'interrupt-status') {
        const message = typeof artifactData.message === 'string' ? artifactData.message : 'Awaiting operator input.';
        return [
          {
            id: `interrupt-artifact-${event.artifact?.artifactId ?? 'unknown'}-${index}`,
            label: 'Artifact',
            view: buildPiExampleStatusA2UiView({
              title: 'Interrupt checkpoint',
              body: message,
            }),
          },
        ];
      }

      return [];
    }

    if (event.type !== 'dispatch-response') {
      return [];
    }

    return event.parts.flatMap((part, partIndex): PiExampleChatCard[] => {
      if (part.kind !== 'a2ui') {
        return [];
      }

      const payloadEnvelope = asRecord(asRecord(part.data)?.payload);
      if (!payloadEnvelope) {
        return [];
      }

      if (payloadEnvelope.kind === 'automation-status') {
        const payload = asRecord(payloadEnvelope.payload);
        if (!payload) {
          return [];
        }

        const status = typeof payload.status === 'string' ? payload.status : 'unknown';
        const command = typeof payload.command === 'string' ? payload.command : 'refresh';
        const detail = typeof payload.detail === 'string' ? payload.detail : 'Automation status updated.';
        return [
          {
            id: `automation-a2ui-${index}-${partIndex}`,
            label: 'A2UI',
            view: buildPiExampleStatusA2UiView({
              title: `Automation ${status}`,
              body: `${command}: ${detail}`,
            }),
          },
        ];
      }

      if (payloadEnvelope.kind === 'interrupt') {
        const payload = asRecord(payloadEnvelope.payload);
        if (!payload) {
          return [];
        }

        return [
          {
            id: `interrupt-a2ui-${index}-${partIndex}`,
            label: 'A2UI',
            actionKind: 'submit-operator-note',
            view: buildPiExampleInterruptA2UiView({
              title: 'Operator input required',
              message:
                typeof payload.message === 'string'
                  ? payload.message
                  : 'Provide a short operator note to continue.',
              inputLabel:
                typeof payload.inputLabel === 'string' ? payload.inputLabel : 'Operator note',
              submitLabel:
                typeof payload.submitLabel === 'string' ? payload.submitLabel : 'Continue agent loop',
              artifactId: typeof payload.artifactId === 'string' ? payload.artifactId : undefined,
            }),
          },
        ];
      }

      return [];
    });
  });
}

function FloatingErrorToast(props: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed top-5 right-5 z-[60] w-[360px] max-w-[calc(100vw-2.5rem)]">
      <div className="rounded-2xl border border-red-500/30 bg-[#141414]/95 backdrop-blur px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-red-200">{props.title}</div>
            <div className="mt-1 text-xs text-red-100/80 leading-relaxed break-words">
              {props.message}
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="shrink-0 rounded-lg p-2 text-red-100/70 hover:text-red-100 hover:bg-white/5 transition-colors"
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
  const emberLendingRuntimeView = useMemo(
    () =>
      agentId === 'agent-ember-lending'
        ? buildEmberLendingRuntimeView({ lifecycleState, domainProjection })
        : null,
    [agentId, domainProjection, lifecycleState],
  );
  const isPortfolioAgent = agentId === 'agent-portfolio-manager';
  const portfolioManagerManagedAgentView = useMemo(
    () => (isPortfolioAgent ? buildPortfolioManagerManagedAgentView(domainProjection) : null),
    [domainProjection, isPortfolioAgent],
  );
  const emberLendingChatEnabled =
    agentId === 'agent-ember-lending' &&
    emberLendingRuntimeView?.phase === 'active';
  const chatEnabled =
    agentId === 'agent-pi-example' ||
    isPortfolioAgent ||
    emberLendingChatEnabled;
  const isEmberLendingAgent = agentId === 'agent-ember-lending';
  const inlineOnboardingChatEnabled =
    agentId === 'agent-pi-example' || agentId === 'agent-ember-lending';
  const [activeTab, setActiveTab] = useState<TabType>(
    initialTab ?? (showPostHireLayout ? 'blockers' : 'metrics'),
  );
  const [hasUserSelectedTab, setHasUserSelectedTab] = useState(Boolean(initialTab));
  const [dismissedBlockingError, setDismissedBlockingError] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [isManagedLaneExpanded, setIsManagedLaneExpanded] = useState(false);
  const [isSubagentWalletPopoverOpen, setIsSubagentWalletPopoverOpen] = useState(false);
  const [subagentWalletCopyStatus, setSubagentWalletCopyStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const subagentWalletPopoverRef = useRef<HTMLDivElement | null>(null);
  const subagentWalletCopyResetTimeoutRef = useRef<number | null>(null);
  const isOnboardingActive = resolveOnboardingActive({
    activeInterruptPresent: Boolean(activeInterrupt),
    taskStatus,
    onboardingStatus: onboardingFlow?.status,
  });
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
  const managedLaneContentId = useId();
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

    return out;
  }, [displayProtocols, displayTokens]);

  const { chainIconByName, tokenIconBySymbol } = useOnchainActionsIconMaps({
    chainNames: profile.chains ?? [],
    tokenSymbols: desiredTokenSymbols,
  });

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
        stars.push(<Star key={i} className="w-4 h-4 text-gray-600" />);
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
      activityEvents={events}
      chatDraft={chatDraft}
      onChatDraftChange={setChatDraft}
      onSubmit={handleChatSubmit}
      onChatKeyDown={handleChatKeyDown}
      isComposerEnabled={chatEnabled && typeof onSendChatMessage === 'function'}
      onSendChatMessage={onSendChatMessage}
      onInterruptSubmit={onInterruptSubmit}
    />
  ) : null;
  const showManagedLendingRuntimeCards = Boolean(
    emberLendingRuntimeView &&
      (emberLendingRuntimeView.mandateSummary ||
        emberLendingRuntimeView.reservationSummary),
  );
  const managedAgentContextCards =
    portfolioManagerManagedAgentView || showManagedLendingRuntimeCards || managedMandateEditorView ? (
      <div className="mt-6 space-y-5">
        {portfolioManagerManagedAgentView ? (
          <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.16)]">
            <div className="flex items-start justify-between gap-4">
              <button
                type="button"
                aria-expanded={isManagedLaneExpanded}
                aria-controls={managedLaneContentId}
                onClick={() => setIsManagedLaneExpanded((current) => !current)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-start gap-3">
                  <ChevronDown
                    className={`mt-0.5 h-4 w-4 shrink-0 text-white/45 transition-transform ${
                      isManagedLaneExpanded ? 'rotate-180' : '-rotate-90'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                      Managed lending lane
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="text-base font-semibold text-white">
                        {portfolioManagerManagedAgentView.title}
                      </div>
                      {portfolioManagerManagedAgentView.laneLabel ? (
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-gray-300">
                          {portfolioManagerManagedAgentView.laneLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
              <a
                href={portfolioManagerManagedAgentView.detailHref}
                className="shrink-0 text-xs font-medium text-[#fd6731] hover:text-[#ff8a5c] transition-colors"
              >
                View lending agent
              </a>
            </div>
            {isManagedLaneExpanded ? (
              <div id={managedLaneContentId}>
                {portfolioManagerManagedAgentView.mandateSummary ? (
                  <div className="mt-4 rounded-xl border border-white/10 bg-[#151515] p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      Mandate
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-gray-300">
                      {portfolioManagerManagedAgentView.mandateSummary}
                    </p>
                  </div>
                ) : null}
                {portfolioManagerManagedAgentView.reservationSummary ? (
                  <div className="mt-4 rounded-xl border border-white/10 bg-[#151515] p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      Reservation
                    </div>
                    <div className="mt-2 text-sm leading-relaxed text-gray-300">
                      {portfolioManagerManagedAgentView.reservationSummary}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {showManagedLendingRuntimeCards && emberLendingRuntimeView ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {emberLendingRuntimeView.mandateSummary ? (
              <div className="min-w-0 rounded-xl border border-white/10 bg-[#151515] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                  Mandate
                </div>
                <div className="mt-2 text-sm leading-relaxed text-gray-300">
                  {emberLendingRuntimeView.mandateSummary}
                </div>
              </div>
            ) : null}
            {emberLendingRuntimeView.reservationSummary ? (
              <div className="min-w-0 rounded-xl border border-white/10 bg-[#151515] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                  Reservation
                </div>
                <div className="mt-2 text-sm leading-relaxed text-gray-300">
                  {emberLendingRuntimeView.reservationSummary}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {managedMandateEditorView ? (
          <ManagedMandateEditorCard
            view={managedMandateEditorView}
            onSave={onManagedMandateSave}
          />
        ) : null}
      </div>
    ) : null;
  const subagentWalletBar = emberLendingRuntimeView?.walletAddress ? (
    <div className="mt-6">
      <div className="relative border-t border-[#2a2a2a] pt-4" ref={subagentWalletPopoverRef}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Subagent wallet</div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <button
            type="button"
            onClick={() => setIsSubagentWalletPopoverOpen((current) => !current)}
            className="flex-1 min-w-0 text-left text-sm font-mono truncate text-gray-200 hover:text-white"
            aria-haspopup="dialog"
            aria-expanded={isSubagentWalletPopoverOpen}
            aria-controls={subagentWalletPopoverId}
          >
            {formatWalletRowAddress(emberLendingRuntimeView.walletAddress)}
          </button>
          <button
            type="button"
            onClick={() => setIsSubagentWalletPopoverOpen((current) => !current)}
            className="text-xs text-gray-300 hover:text-white"
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
            className="absolute left-0 top-full mt-2 z-30 w-max rounded-lg border border-[#2a2a2a] bg-[#1f1f1f] p-3 shadow-lg"
          >
            <div className="text-xs text-gray-400">Subagent wallet address</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={emberLendingRuntimeView.walletAddress}
                onFocus={handleWalletFieldFocus}
                onClick={handleWalletFieldClick}
                className="shrink-0 w-auto rounded-md border border-[#2a2a2a] bg-[#151515] px-2 py-1 text-xs font-mono text-gray-200"
                style={{
                  width: `calc(${Math.max(emberLendingRuntimeView.walletAddress.length, 20)}ch + 1rem)`,
                }}
                aria-label="Full subagent wallet address"
              />
              <button
                type="button"
                onClick={() => void handleCopySubagentWalletAddress()}
                className="shrink-0 rounded-md border border-[#2a2a2a] bg-[#2a2a2a] px-2 py-1 text-xs text-white hover:bg-[#333]"
              >
                {subagentWalletCopyStatus === 'success' ? 'Copied' : 'Copy'}
              </button>
            </div>
            {subagentWalletCopyStatus === 'error' ? (
              <div className="mt-2 text-xs text-red-300" role="status" aria-live="polite">
                Clipboard unavailable. Select and copy manually.
              </div>
            ) : null}
            {subagentWalletCopyStatus === 'success' ? (
              <div className="mt-2 text-xs text-green-300" role="status" aria-live="polite">
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
      <div className="flex items-center gap-1 mb-6 border-b border-[#2a2a2a]">
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
                onInterruptSubmit={onInterruptSubmit}
                taskId={taskId}
                taskStatus={taskStatus}
                haltReason={haltReason}
                executionError={executionError}
                delegationsBypassActive={delegationsBypassActive}
                onboardingFlow={onboardingFlow}
                settings={settings}
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
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1200px] mx-auto">
          {popups}
          {/* Breadcrumb */}
          <nav className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <button onClick={onBack} className="hover:text-white transition-colors">
                Agents
              </button>
              <ChevronRight className="w-4 h-4" />
              <span className="text-white">{agentName}</span>
            </div>
            {/* Refresh button */}
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white text-sm transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Refresh'}
            </button>
          </nav>

          <>
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 items-start">
                {/* Left summary card (Figma onboarding) */}
                <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
                  <div
                    className="h-[220px] w-[220px] rounded-full flex items-center justify-center mb-6 overflow-hidden bg-[#111] ring-1 ring-[#2a2a2a] mx-auto"
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
                      <span className="text-4xl font-semibold text-white/75" aria-hidden="true">
                        {iconMonogram(agentName)}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-center">
                    {isHired ? (
                      <div
                        className={`group relative w-full inline-flex h-10 items-stretch overflow-hidden rounded-[999px] bg-[#2a2a2a] ring-1 ring-white/10 transition-[background-color,box-shadow,border-color] duration-300 ease-out hover:ring-white/20 hover:shadow-[0_10px_30px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] group-hover:bg-gradient-to-r group-hover:from-[#ff2a00] group-hover:to-[#fd6731] group-hover:ring-[#fd6731]/30 group-hover:shadow-[0_16px_55px_rgba(255,42,0,0.28),0_10px_30px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.10)] ${
                          isFiring ? 'opacity-90' : ''
                        }`}
                      >
                        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(1200px_circle_at_50%_0%,rgba(255,255,255,0.10),transparent_40%)]" />

                        <div className="relative z-10 flex flex-1 min-w-0 items-center gap-2 px-3 text-[13px] font-medium text-gray-100 transition-[opacity,flex-basis,padding] duration-200 ease-out group-hover:opacity-0 group-hover:flex-[0_0_0%] group-hover:px-0 overflow-hidden">
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
                          className={`relative z-10 flex flex-[0_0_92px] items-center justify-center px-3 h-full text-[13px] font-medium text-white border-l border-white/10 transition-[flex-basis,background-color,border-color,color,box-shadow] duration-300 ease-out group-hover:flex-1 group-hover:bg-transparent group-hover:border-white/0 ${
                            !managedOnboardingOwner && isFiring
                              ? 'bg-gray-600 cursor-wait'
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
                            ? 'bg-purple-500/50 text-white cursor-wait'
                            : 'bg-purple-500 hover:bg-purple-600 text-white shadow-[0_10px_30px_rgba(168,85,247,0.25)]',
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
                        <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                          Agent Income
                        </div>
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-6 w-24"
                          loadedClassName="text-lg font-semibold text-white"
                          value={formatCurrency(profile.agentIncome)}
                        />
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                          AUM
                        </div>
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-6 w-24"
                          loadedClassName="text-lg font-semibold text-white"
                          value={formatCurrency(profile.aum)}
                        />
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                          Total Users
                        </div>
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-6 w-20"
                          loadedClassName="text-lg font-semibold text-white"
                          value={formatNumber(profile.totalUsers)}
                        />
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                          APY
                        </div>
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-6 w-16"
                          loadedClassName="text-lg font-semibold text-teal-400"
                          value={formatPercent(profile.apy)}
                        />
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                          Your Assets
                        </div>
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-6 w-24"
                          loadedClassName="text-lg font-semibold text-white"
                          value={formatCurrency(fullMetrics?.latestSnapshot?.totalUsd)}
                        />
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                          Your PnL
                        </div>
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
                      <h1 className="text-2xl font-bold text-white mb-2">{agentName}</h1>
                      <div className="mt-4 flex items-center gap-3">
                        {rank !== undefined && <span className="text-gray-400 text-sm">#{rank}</span>}
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
                            nameClassName="text-sm text-white"
                          />
                        )}
                        {ownerAddress && (
                          <div className="text-sm text-gray-400">
                            Owned by <span className="text-white">{formatAddress(ownerAddress)}</span>
                          </div>
                        )}
                      </div>
                      {agentConfig.surfaceTag ? (
                        <AgentSurfaceTag tag={agentConfig.surfaceTag} className="mt-3" />
                      ) : null}
                      {agentDescription ? (
                        <p className="mt-4 text-gray-400 text-sm leading-relaxed">
                          {agentDescription}
                        </p>
                      ) : (
                        <p className="mt-4 text-gray-500 text-sm italic">No description available</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={AGENT_X_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="X"
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
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
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <Globe className="w-4 h-4" />
                      </a>
                      <a
                        href={AGENT_GITHUB_URL}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="GitHub"
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <Github className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                  {managedAgentContextCards}

                  {showAgentMetadataGrid ? (
                    <div className="grid grid-cols-4 gap-4 mt-8 pt-6 border-t border-white/10">
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
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[1200px] mx-auto">
        {popups}
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <button onClick={onBack} className="hover:text-white transition-colors">
            Agents
          </button>
          <ChevronRight className="w-4 h-4" />
          <span className="text-white">{agentName}</span>
        </nav>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 items-start">
          {/* Left Column - Agent Card */}
          <div>
            <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
              <div
                className="h-[220px] w-[220px] rounded-full flex items-center justify-center mb-6 overflow-hidden bg-[#111] ring-1 ring-[#2a2a2a] mx-auto"
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
                  <span className="text-4xl font-semibold text-white/75" aria-hidden="true">
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
                    ? 'bg-purple-500/50 text-white cursor-wait'
                    : 'bg-purple-500 hover:bg-purple-600 text-white shadow-[0_10px_30px_rgba(168,85,247,0.25)]',
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
                <div className="mt-4 rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                  <div className="text-gray-300 text-sm font-medium mb-2">Restoring state</div>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    Waiting for the latest runtime snapshot before rendering agent controls.
                  </p>
                </div>
              ) : null}

              {managedOnboardingOwner && !isRestoringState ? (
                <div className="mt-4 rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                  <div className="text-gray-300 text-sm font-medium mb-2">Managed onboarding</div>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    Managed onboarding happens through {managedOnboardingOwner.name}.
                  </p>
                </div>
              ) : null}

              {showLeftRailStats ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-6">
                  <div>
                    <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                      Agent Income
                    </div>
                    {!hasLoadedView ? (
                      <Skeleton className="h-6 w-24" />
                    ) : (
                      <div className="text-lg font-semibold text-white">
                        {formatCurrency(profile.agentIncome) ?? '-'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                      AUM
                    </div>
                    {!hasLoadedView ? (
                      <Skeleton className="h-6 w-24" />
                    ) : (
                      <div className="text-lg font-semibold text-white">
                        {formatCurrency(profile.aum) ?? '-'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                      Total Users
                    </div>
                    {!hasLoadedView ? (
                      <Skeleton className="h-6 w-20" />
                    ) : (
                      <div className="text-lg font-semibold text-white">
                        {formatNumber(profile.totalUsers) ?? '-'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
                      APY
                    </div>
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
                  <h1 className="text-2xl font-bold text-white mb-2">{agentName}</h1>
                  <div className="mt-4 flex items-center gap-3">
                    {rank !== undefined && <span className="text-gray-400 text-sm">#{rank}</span>}
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
                        nameClassName="text-sm text-white"
                      />
                    )}
                    {ownerAddress && (
                      <div className="text-sm text-gray-400">
                        Owned by <span className="text-white">{formatAddress(ownerAddress)}</span>
                      </div>
                    )}
                  </div>
                  {agentConfig.surfaceTag ? (
                    <AgentSurfaceTag tag={agentConfig.surfaceTag} className="mt-3" />
                  ) : null}
                  {agentDescription ? (
                    <p className="mt-4 text-gray-400 text-sm leading-relaxed">{agentDescription}</p>
                  ) : (
                    <p className="mt-4 text-gray-500 text-sm italic">No description available</p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={AGENT_X_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="X"
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
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
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <Globe className="w-4 h-4" />
                  </a>
                  <a
                    href={AGENT_GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="GitHub"
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <Github className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {showAgentMetadataGrid ? (
                <div className="grid grid-cols-4 gap-4 mt-auto pt-6 border-t border-white/10">
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
          <div className="mt-10 border-b border-white/10 flex items-center gap-6">
            <button
              type="button"
              onClick={() => selectTab('metrics')}
              className={`px-1 pb-3 text-sm font-medium -mb-px border-b-2 ${
                resolvedTab === 'metrics'
                  ? 'text-[#fd6731] border-[#fd6731]'
                  : 'text-gray-500 border-transparent hover:text-white'
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
                  ? 'text-gray-600 border-transparent'
                  : resolvedTab === 'chat'
                    ? 'text-[#fd6731] border-[#fd6731]'
                    : 'text-gray-400 border-transparent hover:text-white'
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
                <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">APY Change</div>
                      <div className="text-xs text-gray-500 mt-1">Latest vs previous snapshot</div>
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
                      <div className="text-xs text-gray-500">
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

                <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">Total Users</div>
                      <div className="text-xs text-gray-500 mt-1">All time</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold text-white">
                        <LoadingValue
                          isLoaded={hasLoadedView}
                          skeletonClassName="h-7 w-24"
                          loadedClassName="text-white"
                          value={formatNumber(profile.totalUsers)}
                        />
                      </div>
                      <div className="text-xs text-gray-500">—</div>
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
          ? 'text-gray-600 cursor-not-allowed border-transparent'
          : active
            ? highlight
              ? 'text-[#fd6731] border-[#fd6731]'
              : 'text-white border-white'
            : 'text-gray-400 hover:text-white border-transparent'
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
  activityEvents: ClmmEvent[];
  chatDraft: string;
  onChatDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChatKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  isComposerEnabled: boolean;
  onSendChatMessage?: (content: string) => void;
  onInterruptSubmit?: (input: PiOperatorNoteInput) => void;
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
  const activityCards = buildPiExampleChatCards(props.activityEvents);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {visibleMessages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#131313] px-4 py-5 text-sm text-gray-400">
            {props.isHiring
              ? 'Submitting hire request...'
              : 'Send a message to start a live Pi runtime conversation.'}
          </div>
        ) : (
          visibleMessages.map((message) => (
            <div
              key={message.id}
              className={`rounded-2xl px-4 py-3 ${
                message.role === 'assistant'
                  ? 'bg-[#111827] text-blue-50'
                  : message.role === 'reasoning'
                    ? 'border border-violet-400/20 bg-[#1f1630] text-violet-50'
                  : message.role === 'user'
                    ? 'bg-[#1c1917] text-orange-50'
                    : 'bg-[#161616] text-white'
              }`}
            >
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">
                {message.label}
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{message.text}</div>
            </div>
          ))
        )}

        {activityCards.map((card) => (
          <div key={card.id} className="rounded-2xl border border-white/10 bg-[#171717] px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">
              {card.label}
            </div>
            <div className="mt-2">
              <PiExampleA2UiCard
                view={card.view}
                onAction={(action) => {
                  if (
                    card.actionKind !== 'submit-operator-note' ||
                    action.actionName !== 'submitOperatorNote' ||
                    !props.onInterruptSubmit
                  ) {
                    return;
                  }

                  const note =
                    typeof action.context?.operatorNote === 'string'
                      ? action.context.operatorNote.trim()
                      : '';
                  if (note.length === 0) {
                    return;
                  }

                  props.onInterruptSubmit({ operatorNote: note });
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={props.onSubmit} className="border-t border-white/10 pt-4">
        <label className="block text-[12px] uppercase tracking-[0.14em] text-white/50">
          Message
        </label>
        <textarea
          value={props.chatDraft}
          onChange={(event) => props.onChatDraftChange(event.target.value)}
          onKeyDown={props.onChatKeyDown}
          rows={4}
          placeholder="Ask the Pi example agent to explain what it can do."
          className="mt-3 w-full rounded-2xl border border-white/10 bg-[#101010] px-4 py-3 text-sm text-white outline-none transition focus:border-[#fd6731]"
        />
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="text-xs text-gray-500">
            {props.isHired ? 'Live chat stays on the same thread.' : 'Chat works before and after hire.'}
          </div>
          <button
            type="submit"
            disabled={!props.isComposerEnabled || props.chatDraft.trim().length === 0}
            className="h-10 px-4 rounded-full text-[13px] font-medium inline-flex items-center justify-center bg-[#fd6731] text-white disabled:bg-white/10 disabled:text-white/35"
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
        <div className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">Current Task</span>
              <p className="text-white font-medium">{taskId.slice(0, 12)}...</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                taskStatus === 'working'
                  ? 'bg-teal-500/20 text-teal-400'
                  : taskStatus === 'completed'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {taskStatus || 'pending'}
            </span>
          </div>
        </div>
      )}

      {telemetry.length > 0 && (
        <div className="rounded-xl bg-[#1e1e1e] border border-[#2a2a2a] p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Latest Activity</div>
          <div className="space-y-2">
            {telemetry.slice(-3).reverse().map((t, i) => (
              <div
                key={`${t.cycle}-${i}`}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <span className="text-white">Cycle {t.cycle}</span>
                  <span className="text-gray-500 mx-2">•</span>
                  <span className="text-gray-400">{t.action}</span>
                </div>
                <span className="text-xs text-gray-500">{formatDate(t.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {transactions.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <div className="text-[12px] uppercase tracking-[0.14em] text-white/60 mb-2">
            Transaction History
          </div>
          <div className="text-white text-lg font-semibold mb-1">No transactions yet</div>
          <div className="text-sm text-gray-400">
            Transactions will appear here once the agent starts operating.
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-6">
            <div>
              <div className="text-[12px] uppercase tracking-[0.14em] text-white/60">
                Transaction History
              </div>
              <div className="text-sm text-gray-400 mt-1">
                Showing the latest {Math.min(10, transactions.length)} of {transactions.length}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-white/[0.02]">
                <tr className="text-[11px] uppercase tracking-[0.14em] text-white/60 border-b border-white/10">
                  <th className="text-left font-medium px-5 py-3">Transaction</th>
                  <th className="text-left font-medium px-5 py-3">Date &amp; time</th>
                  <th className="text-left font-medium px-5 py-3">Protocol</th>
                  <th className="text-right font-medium px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
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
                        className="hover:bg-white/[0.04] transition-colors"
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
                                  className="h-7 w-7 rounded-full bg-black/30 ring-1 ring-[#0e0e12] object-contain"
                                />
                              ) : (
                                <div className="h-7 w-7 rounded-full bg-black/30 ring-1 ring-[#0e0e12]" />
                              )}
                              {protocolIconUri ? (
                                <img
                                  src={proxyIconUri(protocolIconUri)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  className="h-7 w-7 rounded-full bg-black/30 ring-1 ring-[#0e0e12] object-contain"
                                />
                              ) : (
                                <div className="h-7 w-7 rounded-full bg-black/30 ring-1 ring-[#0e0e12]" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="text-white font-medium truncate">
                                Cycle {tx.cycle} · {tx.action}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5 truncate">
                                {shortHash}
                                {tx.reason ? ` · ${tx.reason}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-300 whitespace-nowrap">
                          {formatDate(tx.timestamp)}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-300 whitespace-nowrap">
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
        <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Activity Stream</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {events.slice(-10).reverse().map((event, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[#252525]">
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
                  <div className="text-xs text-gray-500 uppercase tracking-wide">{event.type}</div>
                  <div className="text-sm text-white mt-1">
                    {event.type === 'status' && event.message}
                    {event.type === 'artifact' && `Artifact: ${readArtifactEventType(event)}`}
                    {event.type === 'dispatch-response' && `Response with ${event.parts?.length ?? 0} parts`}
                  </div>
                </div>
              </div>
            ))}
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
  onSettingsChange?: (updates: Partial<AgentSettings>) => void;
}

function AgentBlockersTab({
  agentId,
  activeInterrupt,
  allowedPools,
  onInterruptSubmit,
  taskId,
  taskStatus,
  haltReason,
  executionError,
  delegationsBypassActive,
  onboardingFlow,
  settings,
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
  const [portfolioManagerRootAsset, setPortfolioManagerRootAsset] = useState(
    DEFAULT_MANAGED_MANDATE_ROOT_ASSET,
  );
  const [portfolioManagerAllowedAssetsInput, setPortfolioManagerAllowedAssetsInput] = useState(
    DEFAULT_MANAGED_MANDATE_ROOT_ASSET,
  );
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

    setPortfolioManagerRootAsset(DEFAULT_MANAGED_MANDATE_ROOT_ASSET);
    setPortfolioManagerAllowedAssetsInput(DEFAULT_MANAGED_MANDATE_ROOT_ASSET);
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

  const handlePortfolioManagerSetupSubmit = (event: FormEvent<HTMLFormElement>) => {
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

    const normalizedRootAsset = normalizeManagedMandateAssetSymbol(portfolioManagerRootAsset);
    if (normalizedRootAsset.length === 0) {
      setError('Root asset is required.');
      return;
    }

    const allowedAssets = parseManagedMandateAssetList(portfolioManagerAllowedAssetsInput);
    const normalizedAllowedAssets = canonicalizeManagedMandateAssets(
      normalizedRootAsset,
      allowedAssets,
    );

    if (normalizedAllowedAssets.length === 0) {
      setError('At least one allowed asset is required.');
      return;
    }

    onInterruptSubmit?.({
      ...buildPortfolioManagerSetupInput(operatorWalletAddress as `0x${string}`, {
        rootAsset: normalizedRootAsset,
        allowedAssetsInput: normalizedAllowedAssets.join(', '),
      }),
    });
  };

  const normalizedPortfolioManagerPreviewRootAsset = normalizeManagedMandateAssetSymbol(
    portfolioManagerRootAsset,
  );
  const portfolioManagerPreviewAllowedAssets = parseManagedMandateAssetList(
    portfolioManagerAllowedAssetsInput,
  );
  const portfolioManagerPreviewMandateAssets = canonicalizeManagedMandateAssets(
    normalizedPortfolioManagerPreviewRootAsset,
    portfolioManagerPreviewAllowedAssets,
  );
  const portfolioManagerPreviewSummary = buildManagedMandateSummary(
    portfolioManagerPreviewMandateAssets,
  );

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

      {delegationsBypassEnabled && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
          <div className="text-yellow-300 text-sm font-medium mb-1">Wallet bypass enabled</div>
          <p className="text-yellow-200 text-xs">
            `DELEGATIONS_BYPASS=true` is set. When no wallet is connected, the UI will use
            {` ${walletBypassAddress} `}for onboarding. Run the agent with
            {` ${delegationsBypassEnv}=true `}to skip delegation signing.
          </p>
        </div>
      )}

      <div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          {/* Form Area */}
          <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
            {showPendleSetupForm ? (
              <form onSubmit={handlePendleSetupSubmit}>
                <h3 className="text-lg font-semibold text-white mb-4">Pendle Setup</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Funding Amount (USD)</label>
                    <input
                      type="number"
                      value={baseContributionUsd}
                      onChange={(e) => setBaseContributionUsd(e.target.value)}
                      placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
                      min={MIN_BASE_CONTRIBUTION_USD}
                      className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-[#fd6731] focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                    <div className="text-gray-300 text-sm font-medium mb-2">PT position management</div>
                    <p className="text-gray-400 text-xs">
                      The agent configures and rebalances Pendle PT positions using your selected funding amount.
                    </p>
                    <p className="text-gray-500 text-xs mt-3">
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
                    className="px-6 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
                  >
                    Next
                  </button>
                </div>
              </form>
            ) : showPortfolioManagerSetupForm ? (
              <form onSubmit={handlePortfolioManagerSetupSubmit}>
                <h3 className="text-lg font-semibold text-white mb-4">Ember Portfolio Agent Setup</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="space-y-4 mb-6">
                  <div className="rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                    <div className="text-gray-300 text-sm font-medium mb-2">Root delegation setup</div>
                    <p className="text-gray-400 text-xs">
                      Shared Ember will observe your connected wallet directly during onboarding and derive
                      the initial reserve state from that live wallet observation.
                    </p>
                    <p className="text-gray-500 text-xs mt-3">
                      Wallet: {connectedWalletAddress ? `${connectedWalletAddress.slice(0, 10)}…` : 'Not connected'}
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                    <div className="text-gray-300 text-sm font-medium mb-2">Portfolio mandate</div>
                    <p className="text-gray-400 text-xs">
                      Approve the preloaded medium-risk portfolio mandate so the portfolio manager can
                      coordinate managed subagents without overriding your rooted wallet controls.
                    </p>
                    <p className="text-gray-500 text-xs mt-3">Risk level: Medium</p>
                  </div>

                  <div className="rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                    <div className="text-gray-300 text-sm font-medium mb-2">First managed lending lane</div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label
                          htmlFor="portfolio-manager-root-asset"
                          className="block text-sm text-gray-400 mb-2"
                        >
                          Root asset
                        </label>
                        <input
                          id="portfolio-manager-root-asset"
                          name="portfolio-manager-root-asset"
                          type="text"
                          value={portfolioManagerRootAsset}
                          onChange={(event) => setPortfolioManagerRootAsset(event.target.value)}
                          className="w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-white outline-none transition-colors focus:border-[#fd6731]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="portfolio-manager-allowed-assets"
                          className="block text-sm text-gray-400 mb-2"
                        >
                          Allowed assets
                        </label>
                        <input
                          id="portfolio-manager-allowed-assets"
                          name="portfolio-manager-allowed-assets"
                          type="text"
                          value={portfolioManagerAllowedAssetsInput}
                          onChange={(event) =>
                            setPortfolioManagerAllowedAssetsInput(event.target.value)
                          }
                          className="w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-white outline-none transition-colors focus:border-[#fd6731]"
                        />
                        <div className="mt-2 text-xs text-gray-500">
                          Comma-separated asset symbols. The root asset is always included.
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl border border-white/10 bg-[#151515] p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Summary preview
                      </div>
                      <div className="mt-2 text-sm leading-relaxed text-gray-300">
                        {portfolioManagerPreviewSummary}
                      </div>
                    </div>
                  </div>
                </div>

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isWalletLoading}
                    className="px-6 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
                  >
                    Approve &amp; Continue
                  </button>
                </div>
              </form>
            ) : showPendleFundWalletForm ? (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Fund Wallet</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
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
                    className="px-6 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : showGmxFundWalletForm ? (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Fund Wallet</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
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
                    className="px-6 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
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
                <h3 className="text-lg font-semibold text-white mb-4">GMX Allora Setup</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Target Market</label>
                    <select
                      value={targetMarket}
                      onChange={(e) => setTargetMarket(e.target.value as 'BTC' | 'ETH')}
                      className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white focus:border-[#fd6731] focus:outline-none transition-colors"
                    >
                      <option value="BTC">BTC / USDC</option>
                      <option value="ETH">ETH / USDC</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">USDC Allocation</label>
                    <input
                      type="number"
                      value={baseContributionUsd}
                      onChange={(e) => setBaseContributionUsd(e.target.value)}
                      placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
                      min={MIN_BASE_CONTRIBUTION_USD}
                      className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-[#fd6731] focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                    <div className="text-gray-300 text-sm font-medium mb-2">Allora Signal Source</div>
                    <p className="text-gray-400 text-xs">
                      The agent consumes 8-hour Allora prediction feeds and enforces max 2x leverage.
                    </p>
                    <p className="text-gray-500 text-xs mt-3">
                      Wallet: {connectedWalletAddress ? `${connectedWalletAddress.slice(0, 10)}…` : 'Not connected'}
                    </p>
                  </div>
                </div>

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isWalletLoading}
                    className="px-6 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
                  >
                    Next
                  </button>
                </div>
              </form>
            ) : showOperatorConfigForm ? (
              <form onSubmit={handleSubmit}>
                <h3 className="text-lg font-semibold text-white mb-4">Agent Preferences</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Select Pool</label>
                    <select
                      value={poolAddress}
                      onChange={(e) => setPoolAddress(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white focus:border-[#fd6731] focus:outline-none transition-colors"
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
                    <label className="block text-sm text-gray-400 mb-2">Allocated Funds (USD)</label>
                    <input
                      type="number"
                      value={baseContributionUsd}
                      onChange={(e) => setBaseContributionUsd(e.target.value)}
                      placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
                      min={MIN_BASE_CONTRIBUTION_USD}
                      className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-[#fd6731] focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      className="mt-2 px-4 py-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white text-sm transition-colors"
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
                    className="px-6 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
                  >
                    Next
                  </button>
                </div>
              </form>
            ) : showFundingTokenForm ? (
              <form onSubmit={handleFundingTokenSubmit}>
                <h3 className="text-lg font-semibold text-white mb-4">Select Funding Token</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-2">Funding Token</label>
                  <select
                    value={fundingTokenAddress}
                    onChange={(e) => setFundingTokenAddress(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white focus:border-[#fd6731] focus:outline-none transition-colors"
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
                    className="px-6 py-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
                  >
                    Next
                  </button>
                </div>
              </form>
            ) : showDelegationSigningForm ? (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Review & Sign Delegations</h3>
                {activeInterrupt?.message && (
                  <p className="text-gray-400 text-sm mb-6">{activeInterrupt.message}</p>
                )}

                <div className="space-y-4 mb-6">
                  {(activeInterrupt as unknown as { warnings?: string[] }).warnings?.length ? (
                    <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
                      <div className="text-yellow-300 text-sm font-medium mb-2">Warnings</div>
                      <ul className="space-y-1 text-yellow-200 text-xs">
                        {(activeInterrupt as unknown as { warnings: string[] }).warnings.map((w, index) => (
                          <li key={`${index}-${w}`}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="rounded-xl bg-[#121212] border border-[#2a2a2a] p-4">
                    <div className="text-gray-300 text-sm font-medium mb-2">What you are authorizing</div>
                    <ul className="space-y-1 text-gray-400 text-xs">
                      {(activeInterrupt as unknown as { descriptions?: string[] }).descriptions?.map((d, index) => (
                        <li key={`${index}-${d}`}>{d}</li>
                      ))}
                    </ul>
                  </div>
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
                          className="px-4 py-2 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white text-sm transition-colors"
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
                <div className="text-gray-600 text-4xl mb-4">⏳</div>
                <h3 className="text-lg font-medium text-white mb-2">Waiting for the next onboarding prompt</h3>
                <p className="text-gray-500 text-sm">
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
                  step.id === currentStep ? 'bg-[#1e1e1e]' : ''
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                    step.id === currentStep
                      ? 'bg-[#fd6731] text-white'
                      : step.id < currentStep
                        ? 'bg-teal-500 text-white'
                        : 'bg-[#2a2a2a] text-gray-500'
                  }`}
                >
                  {step.id < currentStep ? <Check className="w-3 h-3" /> : step.id}
                </div>
                <div>
                  <p
                    className={`text-sm font-medium ${
                      step.id === currentStep ? 'text-white' : 'text-gray-500'
                    }`}
                  >
                    {step.name}
                  </p>
                  {step.id === currentStep && (
                    <p className="text-xs text-gray-500 mt-1">{step.description}</p>
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

function StatBox({ label, value, valueColor = 'text-white', isLoaded }: StatBoxProps) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      {!isLoaded ? (
        <Skeleton className="h-6 w-20" />
      ) : value !== null ? (
          <div className={`text-xl font-semibold ${valueColor}`}>{value}</div>
        ) : (
          <div className="text-gray-600 text-sm">-</div>
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
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{title}</div>
        <div className="text-gray-600 text-sm">—</div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{title}</div>
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
                  className="h-4 w-4 rounded-full bg-[#111] ring-1 ring-[#2a2a2a] object-contain"
                />
              ) : (
                <div
                  className="h-4 w-4 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center text-[7px] font-semibold text-white/70 select-none"
                  aria-hidden="true"
                >
                  {iconMonogram(item)}
                </div>
              )}
              <span className="text-sm text-white">{item}</span>
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
            <div className="inline-flex items-center gap-1.5 text-xs text-gray-400 select-none cursor-default">
              <span className="h-5 w-6 rounded-md bg-white/[0.04] ring-1 ring-white/10 flex items-center justify-center text-[12px] text-gray-200 font-semibold">
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
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Points</div>
        <div className="text-gray-600 text-sm">—</div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Points</div>
      <div className="space-y-1.5">
        {metrics.iteration !== undefined && (
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <span className="text-sm text-white">{metrics.iteration}x</span>
          </div>
        )}
        {metrics.cyclesSinceRebalance !== undefined && (
          <div className="flex items-center gap-2">
            <Minus className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-white">{metrics.cyclesSinceRebalance}x</span>
          </div>
        )}
        {metrics.rebalanceCycles !== undefined && (
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-white">{metrics.rebalanceCycles}x</span>
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
      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Allocation Settings</h3>
        <p className="text-gray-400 text-sm mb-6">
          Configure the amount of funds allocated to this agent for liquidity operations.
        </p>

        <div className="max-w-md">
          <label className="block text-sm text-gray-400 mb-2">Allocated Amount (USD)</label>
          <div className="flex gap-3">
            <input
              type="number"
              value={localAmount}
              onChange={(e) => setLocalAmount(e.target.value)}
              placeholder={`$${MIN_BASE_CONTRIBUTION_USD}`}
              min={MIN_BASE_CONTRIBUTION_USD}
              className="flex-1 px-4 py-3 rounded-lg bg-[#121212] border border-[#2a2a2a] text-white placeholder:text-gray-600 focus:border-[#fd6731] focus:outline-none transition-colors"
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
            <p className="text-xs text-gray-500 mt-2">
              Current allocation: ${resolvedAllocationAmount.toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Policies</h3>
        <p className="text-gray-500 text-sm">
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
