'use client';

import { useCoAgent, useCopilotContext } from '@copilotkit/react-core';
import { CopilotKitCSSProperties, CopilotPopup } from '@copilotkit/react-ui';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { v7 } from 'uuid';
import { useLangGraphInterruptCustomUI } from './hooks/useLangGraphInterruptCustomUI';
import type {
  ClmmEvent,
  ClmmState,
  ClmmTransaction,
  OperatorInterrupt,
} from '../../../agent-clmm/src/workflow/context';
import type {
  CamelotPool,
  OperatorConfigInput,
  RebalanceTelemetry,
} from '../../../agent-clmm/src/domain/types';

// • Multiple threads

//   - CopilotKit exposes thread management on the provider context: threads,
//     selectedThreadId, selectThread, createThread, createAndSelectThread all live on the
//     same context that powers the chat UI. Use these to list threads and switch or create
//     new ones; the provider will reload state/messages for the newly selected thread.
//     (copilotjs.com (https://www.copilotjs.com/docs/react/use-copilot?utm_source=openai))
//   - useCopilotContext() (and the higher-level useCopilot) and useCoAgent() read/write
//     the same CopilotKit context; useCoAgent pulls threadId and state refs from that
//     context for synchronization. Switching the thread via setThreadId or selectThread
//     immediately changes which agent state/messages useCoAgent loads. (deepwiki.com
//     (https://deepwiki.com/CopilotKit/CopilotKit/3.1.4-copilotkit-provider-and-context?
//     utm_source=openai))

//   Recommended pattern for multi-thread apps

//   - Mount one <CopilotKit> per logical user/session, then drive thread selection
//     explicitly in UI (e.g., a sidebar list that calls selectThread(id); a “New chat”
//     button that calls createAndSelectThread()).
//   - If you need per-view isolation (e.g., multiple widgets on a page), pass an explicit
//     threadId prop to each <CopilotKit> instance so each widget is pinned to its own
//     thread; otherwise they’ll share the auto-generated thread in the shared provider.

export default function CopilotKitPage() {
  const themeColor = '#6366f1';

  return (
    <main style={{ '--copilot-kit-primary-color': themeColor } as CopilotKitCSSProperties}>
      <YourMainContent themeColor={themeColor} />
      {/* CopilotPopup is needed to enable the AG-UI interrupt resolution mechanism.
          Without a CopilotKit chat component, useLangGraphInterrupt's render callback
          is never called, so we can't capture the resolve function to resume interrupts. */}
      <CopilotPopup defaultOpen={false} clickOutsideToClose={false} />
    </main>
  );
}

type AgentState = {
  messages?: ClmmState['messages'];
  settings?: ClmmState['settings'];
  view?: ClmmState['view'];
  private?: ClmmState['private'];
  copilotkit?: ClmmState['copilotkit'];
};

const defaultProfile: ClmmState['view']['profile'] = {
  agentIncome: undefined,
  aum: undefined,
  totalUsers: undefined,
  apy: undefined,
  chains: [],
  protocols: [],
  tokens: [],
  pools: [],
  allowedPools: [],
};

const defaultActivity: ClmmState['view']['activity'] = {
  telemetry: [],
  events: [],
};

const defaultMetrics: ClmmState['view']['metrics'] = {
  lastSnapshot: undefined,
  previousPrice: undefined,
  cyclesSinceRebalance: 0,
  staleCycles: 0,
  iteration: 0,
  latestCycle: undefined,
};

const defaultView: ClmmState['view'] = {
  command: 'idle',
  task: undefined,
  poolArtifact: undefined,
  operatorInput: undefined,
  selectedPool: undefined,
  operatorConfig: undefined,
  haltReason: undefined,
  executionError: undefined,
  profile: defaultProfile,
  activity: defaultActivity,
  metrics: defaultMetrics,
  transactionHistory: [],
};

const initialAgentState: AgentState = {
  messages: [],
  settings: { amount: 0 },
  view: defaultView,
};

const AGENT_NAME = 'agent-clmm';

const isOperatorConfigRequest = (value: unknown): value is OperatorInterrupt =>
  typeof value === 'object' &&
  value !== null &&
  (value as { type?: string }).type === 'operator-config-request';

type OperatorConfigFormProps = {
  request: OperatorInterrupt;
  pools: CamelotPool[];
  onSubmit: (input: OperatorConfigInput) => void;
};

const OperatorConfigForm = ({ request, pools, onSubmit }: OperatorConfigFormProps) => {
  const [poolAddress, setPoolAddress] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [baseContributionUsd, setBaseContributionUsd] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isHexAddress = (value: string) => /^0x[0-9a-fA-F]+$/.test(value);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!poolAddress) {
      setError('Please select a pool.');
      return;
    }

    if (!isHexAddress(walletAddress)) {
      setError('Wallet address must be a 0x-prefixed hex string.');
      return;
    }

    let baseContributionNumber: number | undefined;
    if (baseContributionUsd.trim() !== '') {
      const parsed = Number(baseContributionUsd);
      if (Number.isNaN(parsed) || parsed <= 0) {
        setError('Base contribution must be a positive number when provided.');
        return;
      }
      baseContributionNumber = parsed;
    }

    onSubmit({
      poolAddress: poolAddress as `0x${string}`,
      walletAddress: walletAddress as `0x${string}`,
      ...(baseContributionNumber !== undefined
        ? { baseContributionUsd: baseContributionNumber }
        : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Operator input required</h2>
        <p className="text-sm text-gray-600 mb-4">{request.message}</p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="poolAddress">
              Select pool
            </label>
            <select
              id="poolAddress"
              name="poolAddress"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={poolAddress}
              onChange={(e) => setPoolAddress(e.target.value)}
              required
            >
              <option value="">Choose a pool...</option>
              {pools.map((pool) => (
                <option key={pool.address} value={pool.address}>
                  {pool.token0.symbol}/{pool.token1.symbol} — {pool.address.slice(0, 10)}...
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="walletAddress">
              Wallet address
            </label>
            <input
              id="walletAddress"
              name="walletAddress"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="0x..."
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value.trim())}
              required
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-gray-700"
              htmlFor="baseContributionUsd"
            >
              Base contribution (USD, optional)
            </label>
            <input
              id="baseContributionUsd"
              name="baseContributionUsd"
              type="number"
              step="any"
              min="0"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g., 2500"
              value={baseContributionUsd}
              onChange={(e) => setBaseContributionUsd(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

function YourMainContent({ themeColor }: { themeColor: string }) {
  // 🪁 Shared State: https://docs.copilotkit.ai/coagents/shared-state
  const { state, setState, run } = useCoAgent<AgentState>({
    name: AGENT_NAME,
    initialState: initialAgentState,
  });
  const { threadId } = useCopilotContext();

  // Handle LangGraph interrupts with custom UI (not CopilotKit chat components)
  const { activeInterrupt, resolve } = useLangGraphInterruptCustomUI<OperatorInterrupt>({
    enabled: isOperatorConfigRequest,
  });

  const handleInterruptSubmit = (input: OperatorConfigInput) => {
    console.log('[Interrupt] Submitting response:', input);
    // Resume the interrupted graph using the AG-UI protocol resolve function
    resolve(JSON.stringify(input));
  };

  const COMMAND_HIRE = {
    command: 'hire',
  };

  const COMMAND_FIRE = {
    command: 'fire',
  };

  const COMMAND_INVALID = {
    command: 'invalid',
  };

  const COMMAND_SYNC = {
    command: 'sync',
  };

  // TODO: Can we perform concurrent runs?

  // Parallel calls to run

  // - AG-UI guidance is to avoid concurrent agent runs/tool calls; trigger a run, wait for
  //   completion/stream to end, then start the next. CopilotKit’s runtime and many backends
  //   assume serial tool-call ordering, and concurrent runs can produce dropped or rejected
  //   events. (copilotkit.ai (https://www.copilotkit.ai/blog/how-to-make-agents-talk-to-
  //   each-other-and-your-app-using-a2a-ag-ui?utm_source=openai))
  // - CopilotKit surfaces a disableParallelToolCalls flag on adapters to force sequential
  //   execution, reflecting that parallel execution isn’t reliably supported. (github.com
  //   (https://github.com/CopilotKit/CopilotKit/issues/2462?utm_source=openai))
  // - If you invoke run twice before the first finishes, both will fire, but you
  //   risk interleaved or rejected tool events and non-deterministic state; practical
  //   recommendation is to serialize per thread (queue locally or disable the trigger while
  //   isRunning).

  const runCommandSync = () => {
    if (!threadId) return;
    run(() => ({
      id: v7(),
      role: 'user',
      content: JSON.stringify(COMMAND_SYNC),
    }));
  };

  // On initial connect (and when the user switches threads) request a sync from the agent.
  useEffect(() => {
    runCommandSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const runCommandHire = () => {
    run(() => ({
      id: v7(),
      role: 'user',
      content: JSON.stringify(COMMAND_HIRE),
    }));
  };

  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    if (value === '') {
      setState((prev) => ({
        ...(prev ?? initialAgentState),
        settings: { ...(prev?.settings ?? initialAgentState.settings), amount: undefined },
      }));
      return;
    }

    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
      return;
    }

    setState((prev) => ({
      ...(prev ?? initialAgentState),
      settings: { ...(prev?.settings ?? initialAgentState.settings), amount: numericValue },
    }));
  };

  const runCommandFire = () => {
    run(() => ({
      id: v7(),
      role: 'user',
      content: JSON.stringify(COMMAND_FIRE),
    }));
  };

  const runCommandInvalid = () => {
    run(() => ({
      id: v7(),
      role: 'user',
      content: JSON.stringify(COMMAND_INVALID),
    }));
  };

  const runSendMessage = () => {
    run(() => ({
      id: v7(),
      role: 'user',
      content: 'Hello, how are you?',
    }));
  };

  const view = state?.view ?? defaultView;
  const profile = view.profile ?? defaultProfile;
  const metrics = view.metrics ?? defaultMetrics;
  const activity = view.activity ?? defaultActivity;
  const telemetry = activity.telemetry ?? [];
  const events = activity.events ?? [];
  const transactionHistory = view.transactionHistory ?? [];
  const allowedPools = profile.allowedPools ?? [];
  const pools = profile.pools ?? [];

  const formattedCommand = view.command ?? '—';
  const amount = state?.settings?.amount;

  const totalPoints = useMemo(
    () => Math.max(0, Math.round((metrics.iteration ?? 0) / 3)),
    [metrics.iteration],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      {/* Render interrupt form as modal overlay when active */}
      {activeInterrupt ? (
        <OperatorConfigForm
          request={activeInterrupt}
          pools={allowedPools}
          onSubmit={handleInterruptSubmit}
        />
      ) : null}

      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Agent Console</p>
            <h1 className="text-3xl font-semibold text-white">Camelot CLMM</h1>
            <p className="text-sm text-slate-400">
              Automatically rebalances and optimizes concentrated liquidity on Camelot.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => runCommandSync()}
              className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 shadow-sm transition hover:-translate-y-[1px] hover:border-indigo-400 hover:bg-slate-800"
            >
              Reload state
            </button>
            <button
              onClick={runSendMessage}
              className="rounded-full border border-indigo-500/40 bg-indigo-600/80 px-4 py-2 text-sm font-semibold shadow-lg transition hover:-translate-y-[1px] hover:bg-indigo-500"
            >
              Nudge agent
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          <aside className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl">
            <SidebarCard
              command={formattedCommand}
              task={view.task}
              haltReason={view.haltReason}
              executionError={view.executionError}
              telemetry={telemetry}
              points={totalPoints}
            />
            <div className="mt-6 space-y-3">
              <ActionButton
                label="Hire"
                accent="success"
                onClick={runCommandHire}
                disabled={formattedCommand === 'hire'}
              />
              <ActionButton
                label="Fire"
                accent="danger"
                onClick={runCommandFire}
                disabled={formattedCommand === 'fire'}
              />
              <ActionButton label="Invalid command" accent="warning" onClick={runCommandInvalid} />
            </div>
            <SettingsCard amount={amount} onAmountChange={handleAmountChange} />
          </aside>

          <section className="space-y-6">
            <HeroPanel profile={profile} points={totalPoints} />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Agent Income" value={profile.agentIncome} formatter={formatUsd} />
              <StatCard label="AUM" value={profile.aum} formatter={formatUsd} />
              <StatCard label="Total Users" value={profile.totalUsers} formatter={formatNumber} />
              <StatCard label="APY" value={profile.apy} formatter={formatPercent} highlight />
              <StatCard label="Cycles Since Rebalance" value={metrics.cyclesSinceRebalance} />
              <StatCard label="Stale Cycles" value={metrics.staleCycles} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PillBoard
                title="Networks & Assets"
                chains={profile.chains ?? []}
                protocols={profile.protocols ?? []}
                tokens={profile.tokens ?? []}
              />
              <MetricsPanel metrics={metrics} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PoolsPanel title="Allowed Pools" pools={allowedPools} />
              <PoolsPanel title="Discovered Pools" pools={pools} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ActivityPanel events={events} telemetry={telemetry} />
              <TransactionHistoryPanel transactions={transactionHistory} />
            </div>

            <MessagesPanel messages={state?.messages ?? []} />
          </section>
        </div>
      </div>
    </div>
  );
}

type SidebarCardProps = {
  command: string;
  task: ClmmState['view']['task'];
  haltReason?: string;
  executionError?: string;
  telemetry: RebalanceTelemetry[];
  points: number;
};

function SidebarCard({ command, task, haltReason, executionError, telemetry, points }: SidebarCardProps) {
  const latestTelemetry = telemetry.at(-1);
  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-5 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Command</p>
          <p className="text-xl font-semibold text-white">{command}</p>
        </div>
        <div className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
          {points} pts
        </div>
      </div>
      <div className="mt-4 space-y-2 text-sm text-slate-300">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Task</span>
          <span className="font-medium text-white">{task?.id ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Status</span>
          <span className="font-medium text-emerald-300">
            {task?.taskStatus.state ?? 'waiting'}
          </span>
        </div>
        {haltReason ? (
          <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Halted: {haltReason}
          </p>
        ) : null}
        {executionError ? (
          <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            Error: {executionError}
          </p>
        ) : null}
        {latestTelemetry ? (
          <div className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
            Last action: {latestTelemetry.action} · Cycle {latestTelemetry.cycle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ActionButtonProps = {
  label: string;
  accent: 'success' | 'danger' | 'warning';
  onClick: () => void;
  disabled?: boolean;
};

function ActionButton({ label, accent, onClick, disabled }: ActionButtonProps) {
  const palette =
    accent === 'success'
      ? 'from-emerald-500 to-emerald-400 text-emerald-50 shadow-emerald-900/50'
      : accent === 'danger'
        ? 'from-rose-500 to-rose-400 text-rose-50 shadow-rose-900/50'
        : 'from-amber-500 to-amber-400 text-amber-50 shadow-amber-900/50';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl bg-gradient-to-r ${palette} px-4 py-3 text-sm font-semibold shadow-lg transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {label}
    </button>
  );
}

type SettingsCardProps = {
  amount: number | undefined;
  onAmountChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

function SettingsCard({ amount, onAmountChange }: SettingsCardProps) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Settings</p>
      <label className="mt-4 block text-sm font-medium text-slate-200" htmlFor="amount">
        Allocation (USD)
      </label>
      <input
        id="amount"
        type="number"
        inputMode="decimal"
        step="any"
        value={amount ?? ''}
        onChange={onAmountChange}
        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
        placeholder="Enter amount"
      />
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: number | undefined;
  formatter?: (value: number | undefined) => string;
  highlight?: boolean;
};

function StatCard({ label, value, formatter = formatNumber, highlight }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${highlight ? 'text-emerald-300' : 'text-white'}`}>
        {formatter(value)}
      </p>
    </div>
  );
}

type HeroPanelProps = {
  profile: ClmmState['view']['profile'];
  points: number;
};

function HeroPanel({ profile, points }: HeroPanelProps) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-6 shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/60 text-xl font-bold text-white shadow-lg">
              MC
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-white">Camelot CLMM</h2>
              <p className="text-sm text-slate-400">
                Runs continuous rebalancing cycles to keep liquidity dense around price and reduce
                drift.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge label="Active" tone="success" />
          <Badge label="Score" tone="info" value={`${points} pts`} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-300">
        <span>Your assets: —</span>
        <span>PNL: —</span>
        <span className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400">
          {profile.allowedPools.length} allowed pools
        </span>
      </div>
    </div>
  );
}

type BadgeProps = { label: string; tone: 'success' | 'info' | 'muted'; value?: string };

function Badge({ label, tone, value }: BadgeProps) {
  const palette =
    tone === 'success'
      ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40'
      : tone === 'info'
        ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/40'
        : 'bg-slate-500/15 text-slate-300 border-slate-600/40';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${palette}`}
    >
      {label}
      {value ? <span className="text-[11px] font-medium text-slate-100">{value}</span> : null}
    </span>
  );
}

type PillBoardProps = {
  title: string;
  chains: string[];
  protocols: string[];
  tokens: string[];
};

function PillBoard({ title, chains, protocols, tokens }: PillBoardProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{title}</p>
        <span className="text-xs text-slate-400">Live view</span>
      </div>
      <div className="mt-4 space-y-4">
        <PillGroup label="Chains" items={chains} />
        <PillGroup label="Protocols" items={protocols} />
        <PillGroup label="Tokens" items={tokens} />
      </div>
    </div>
  );
}

type PillGroupProps = {
  label: string;
  items: string[];
};

function PillGroup({ label, items }: PillGroupProps) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-sm text-slate-500">—</span>
        ) : (
          items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-200"
            >
              {item}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

type MetricsPanelProps = {
  metrics: ClmmState['view']['metrics'];
};

function MetricsPanel({ metrics }: MetricsPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Run Metrics</p>
        <span className="text-xs text-slate-400">Cycle {metrics.iteration ?? 0}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <MetricRow label="Previous price" value={formatUsd(metrics.previousPrice)} />
        <MetricRow label="Latest cycle" value={metrics.latestCycle?.cycle ?? '—'} />
        <MetricRow label="Last snapshot pool" value={metrics.lastSnapshot?.address ?? '—'} />
        <MetricRow label="Cycles since rebalance" value={metrics.cyclesSinceRebalance} />
        <MetricRow label="Stale cycles" value={metrics.staleCycles} />
        <MetricRow label="Iteration" value={metrics.iteration} />
      </div>
    </div>
  );
}

type MetricRowProps = {
  label: string;
  value: string | number | undefined;
};

function MetricRow({ label, value }: MetricRowProps) {
  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
      <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-white">{value ?? '—'}</p>
    </div>
  );
}

type PoolsPanelProps = {
  title: string;
  pools: CamelotPool[];
};

function PoolsPanel({ title, pools }: PoolsPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{title}</p>
        <span className="text-xs text-slate-400">{pools.length} pools</span>
      </div>
      <div className="mt-3 space-y-3">
        {pools.length === 0 ? (
          <p className="text-sm text-slate-500">No pools yet.</p>
        ) : (
          pools.map((pool) => (
            <div
              key={pool.address}
              className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-white">
                  {pool.token0.symbol}/{pool.token1.symbol}
                </p>
                {pool.feeTierBps ? (
                  <span className="text-xs text-slate-400">{pool.feeTierBps} bps</span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500 break-all">{pool.address}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type ActivityPanelProps = {
  events: ClmmEvent[];
  telemetry: RebalanceTelemetry[];
};

function ActivityPanel({ events, telemetry }: ActivityPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Activity</p>
        <span className="text-xs text-slate-400">Events & Telemetry</span>
      </div>
      <div className="mt-3 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Events</p>
          <div className="mt-2 space-y-2">
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">No events yet.</p>
            ) : (
              events.map((event, idx) => (
                <EventRow key={idx} event={event} />
              ))
            )}
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Telemetry</p>
          <div className="mt-2 space-y-2">
            {telemetry.length === 0 ? (
              <p className="text-sm text-slate-500">No telemetry captured yet.</p>
            ) : (
              telemetry.slice(-6).map((item) => <TelemetryRow key={item.cycle} telemetry={item} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type EventRowProps = { event: ClmmEvent };

function EventRow({ event }: EventRowProps) {
  if (event.type === 'status') {
    return (
      <div className="flex items-start justify-between rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-sm">
        <div>
          <p className="font-semibold text-white">{event.message}</p>
          <p className="text-xs text-slate-500">
            Task {event.task.id} · {event.task.taskStatus.state}
          </p>
        </div>
        <span className="text-xs text-slate-400">
          {formatDate(event.task.taskStatus.timestamp)}
        </span>
      </div>
    );
  }

  if (event.type === 'artifact') {
    const artifactId =
      (event.artifact as { artifactId?: string }).artifactId ??
      (event.artifact as { name?: string }).name ??
      'artifact';

    return (
      <div className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-100">
        Artifact {artifactId} {event.append ? 'updated' : 'created'}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
      Dispatch response with {event.parts.length} part(s)
    </div>
  );
}

type TelemetryRowProps = { telemetry: RebalanceTelemetry };

function TelemetryRow({ telemetry }: TelemetryRowProps) {
  return (
    <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-sm text-slate-200">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-white">
          Cycle {telemetry.cycle} • {telemetry.action}
        </p>
        <span className="text-xs text-slate-400">{formatDate(telemetry.timestamp)}</span>
      </div>
      <p className="text-xs text-slate-500">
        {telemetry.reason} • {telemetry.midPrice ? `mid ${telemetry.midPrice.toFixed(4)}` : '—'}
      </p>
    </div>
  );
}

type TransactionHistoryPanelProps = {
  transactions: ClmmTransaction[];
};

function TransactionHistoryPanel({ transactions }: TransactionHistoryPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Transaction History</p>
        <span className="text-xs text-slate-400">{transactions.length} entries</span>
      </div>
      <div className="mt-3 space-y-2">
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-500">No transactions recorded yet.</p>
        ) : (
          transactions
            .slice(-8)
            .reverse()
            .map((tx, index) => (
              <TransactionRow key={`${tx.cycle}-${index}-${tx.timestamp}`} tx={tx} />
            ))
        )}
      </div>
    </div>
  );
}

type TransactionRowProps = { tx: ClmmTransaction };

function TransactionRow({ tx }: TransactionRowProps) {
  const badge =
    tx.status === 'success'
      ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40'
      : 'bg-rose-500/15 text-rose-200 border-rose-500/40';

  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-white">
            Cycle {tx.cycle} • {tx.action}
          </p>
          <p className="text-xs text-slate-500">
            {tx.txHash ? tx.txHash.slice(0, 12) + '…' : 'pending'}{' '}
            {tx.reason ? `· ${tx.reason}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${badge}`}>
            {tx.status}
          </span>
          <span className="text-[11px] text-slate-400">{formatDate(tx.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

type MessagesPanelProps = { messages: AgentState['messages'] };

function MessagesPanel({ messages }: MessagesPanelProps) {
  const renderedMessages = Array.isArray(messages) ? messages : [];
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Messages</p>
        <span className="text-xs text-slate-400">
          {renderedMessages.length ? `${renderedMessages.length} items` : 'Live feed'}
        </span>
      </div>
      <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-2">
        {renderedMessages.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet.</p>
        ) : (
          renderedMessages.map((msg, index) => (
            <div
              key={(msg as { id?: string })?.id ?? `${index}`}
              className="rounded-xl border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-sm"
            >
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
                {(msg as { role?: string })?.role ?? 'unknown'}
              </p>
              <p className="mt-1 text-slate-200">
                {typeof (msg as { content?: unknown }).content === 'string'
                  ? (msg as { content?: string }).content
                  : JSON.stringify((msg as { content?: unknown }).content)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatUsd(value: number | undefined) {
  if (value === undefined || value === null) return '—';
  return value >= 1000
    ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${value.toFixed(2)}`;
}

function formatPercent(value: number | undefined) {
  if (value === undefined || value === null) return '—';
  return `${value.toFixed(2)}%`;
}

function formatNumber(value: number | undefined) {
  if (value === undefined || value === null) return '—';
  if (value >= 10_000) {
    return value.toLocaleString();
  }
  return value.toString();
}

function formatDate(timestamp?: string) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
