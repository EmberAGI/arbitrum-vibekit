'use client';

import {
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Users,
  Trophy,
  AlertCircle,
  Loader,
  CheckCircle,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLogin, useLogout, usePrivy } from '@privy-io/react-auth';
import { supportedEvmChains, getEvmChainOrDefault } from '@/config/evmChains';
import { usePrivyWalletClient } from '@/hooks/usePrivyWalletClient';
import { useUpgradeToSmartAccount } from '@/hooks/useUpgradeToSmartAccount';
import { useOnchainActionsIconMaps } from '@/hooks/useOnchainActionsIconMaps';
import { useAgent } from '@/contexts/AgentContext';
import { useAgentList } from '@/contexts/AgentListContext';
import { getAllAgents } from '@/config/agents';
import type { TaskState } from '@/types/agent';
import { resolveSidebarTaskState } from '@/utils/resolveSidebarTaskState';
import { collectUniqueChainNames, collectUniqueTokenSymbols } from '@/utils/agentCollections';
import { PROTOCOL_TOKEN_FALLBACK } from '@/constants/protocolTokenFallback';
import {
  normalizeNameKey,
  proxyIconUri,
  resolveAgentAvatarUri,
} from '@/utils/iconResolution';

export interface AgentActivity {
  id: string;
  name: string;
  subtitle: string;
  status: 'active' | 'blocked' | 'completed';
  timestamp?: string;
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAgentsExpanded, setIsAgentsExpanded] = useState(true);
  const [isBlockedExpanded, setIsBlockedExpanded] = useState(true);
  const [isActiveExpanded, setIsActiveExpanded] = useState(true);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
  const [isChainMenuOpen, setIsChainMenuOpen] = useState(false);
  const [isAddressPopoverOpen, setIsAddressPopoverOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const addressPopoverRef = useRef<HTMLDivElement | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const addressPopoverId = useId();

  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const {
    privyWallet,
    chainId,
    switchChain,
    isLoading: isWalletLoading,
    error: walletError,
  } = usePrivyWalletClient();
  const {
    isDeployed: isSmartAccountDeployed,
    isLoading: isSmartAccountLoading,
    isUpgrading: isSmartAccountUpgrading,
    upgradeToSmartAccount,
    error: smartAccountError,
  } = useUpgradeToSmartAccount();

  // Get agent activity data from shared context
  const agent = useAgent();
  const { agents: listAgents } = useAgentList();

  const agentConfigs = useMemo(() => getAllAgents(), []);
  const isInactiveRuntime = agent.config.id === 'inactive-agent';
  const runtimeAgentId = isInactiveRuntime ? null : agent.config.id;
  const runtimeTaskId = agent.view.task?.id;
  const runtimeTaskState = agent.view.task?.taskStatus?.state as TaskState | undefined;
  const runtimeCommand = agent.view.command;
  const runtimeHaltReason = agent.view.haltReason;
  const runtimeExecutionError = agent.view.executionError;
  const runtimeTaskMessage = (() => {
    const message = agent.view.task?.taskStatus?.message;
    if (typeof message !== 'object' || message === null) return undefined;
    if (!('content' in message)) return undefined;
    const content = (message as { content?: unknown }).content;
    return typeof content === 'string' ? content : undefined;
  })();

  const blockedAgents: AgentActivity[] = [];
  const activeAgents: AgentActivity[] = [];
  const completedAgents: AgentActivity[] = [];

  agentConfigs.forEach((config) => {
    const listEntry = listAgents[config.id];
    const useRuntime = runtimeAgentId === config.id && Boolean(runtimeTaskId);
    const entry = useRuntime
      ? {
          ...listEntry,
          taskId: runtimeTaskId,
          taskState: resolveSidebarTaskState({
            listTaskState: listEntry?.taskState,
            runtimeTaskState,
            runtimeCommand,
            runtimeTaskMessage,
          }),
          command: runtimeCommand,
          taskMessage: runtimeTaskMessage,
          haltReason: runtimeHaltReason,
          executionError: runtimeExecutionError,
        }
      : listEntry;

    const taskState = entry?.taskState;
    if (!taskState) {
      return;
    }

    const taskId = entry.taskId ?? config.id;
    const needsInput = taskState === 'input-required';
    const hasError = taskState === 'failed';
    const isBlocked = needsInput || hasError;
    const isCompleted = taskState === 'completed' || taskState === 'canceled';

    if (isBlocked) {
      blockedAgents.push({
        id: config.id,
        name: config.name,
        subtitle: needsInput ? 'Set up agent' : 'Blocked',
        status: 'blocked',
      });
      return;
    }

    if (isCompleted) {
      completedAgents.push({
        id: config.id,
        name: config.name,
        subtitle: taskState === 'canceled' ? 'Canceled' : 'Completed',
        status: 'completed',
      });
      return;
    }

    activeAgents.push({
      id: config.id,
      name: config.name,
      subtitle: taskId ? `Task: ${taskId.slice(0, 8)}...` : `Task: ${taskState}`,
      status: 'active',
    });
  });

  const selectedChain = getEvmChainOrDefault(chainId);
  const sidebarIconGroups = useMemo(
    () =>
      agentConfigs.map((config) => {
        const profile = listAgents[config.id]?.profile;
        return {
          chains: profile?.chains?.length ? profile.chains : (config.chains ?? []),
          tokens: profile?.tokens?.length ? profile.tokens : (config.tokens ?? []),
          protocols: profile?.protocols?.length ? profile.protocols : (config.protocols ?? []),
        };
      }),
    [agentConfigs, listAgents],
  );

  const sidebarChainNames = useMemo(
    () =>
      collectUniqueChainNames({
        groups: sidebarIconGroups,
        keyFn: (value) => normalizeNameKey(value),
      }),
    [sidebarIconGroups],
  );

  const sidebarTokenSymbols = useMemo(
    () =>
      collectUniqueTokenSymbols({
        groups: sidebarIconGroups,
        protocolTokenFallback: PROTOCOL_TOKEN_FALLBACK,
      }),
    [sidebarIconGroups],
  );

  const { chainIconByName, tokenIconBySymbol } = useOnchainActionsIconMaps({
    chainNames: sidebarChainNames,
    tokenSymbols: sidebarTokenSymbols,
  });

  const agentIconById = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const config of agentConfigs) {
      const profile = listAgents[config.id]?.profile;
      const protocols = profile?.protocols?.length ? profile.protocols : (config.protocols ?? []);
      const chains = profile?.chains?.length ? profile.chains : (config.chains ?? []);
      const avatar =
        resolveAgentAvatarUri({
          protocols,
          tokenIconBySymbol,
        }) ??
        (chains.length > 0 ? chainIconByName[normalizeNameKey(chains[0])] ?? null : null);
      out[config.id] = avatar ? proxyIconUri(avatar) : null;
    }
    return out;
  }, [agentConfigs, listAgents, chainIconByName, tokenIconBySymbol]);

  const formatAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

  const clearCopyResetTimeout = () => {
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = null;
    }
  };

  const closeAddressPopover = () => {
    setIsAddressPopoverOpen(false);
    setCopyStatus('idle');
  };

  const handleCopyAddress = async () => {
    if (!privyWallet?.address) return;

    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(privyWallet.address);
      setCopyStatus('success');
    } catch {
      setCopyStatus('error');
    }

    clearCopyResetTimeout();
    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopyStatus('idle');
    }, 2000);
  };

  const handleAddressFieldFocus: React.FocusEventHandler<HTMLInputElement> = (event) => {
    event.currentTarget.select();
  };

  const handleAddressFieldClick: React.MouseEventHandler<HTMLInputElement> = (event) => {
    event.currentTarget.select();
  };

  useEffect(() => {
    if (!isAddressPopoverOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (addressPopoverRef.current?.contains(target)) return;
      closeAddressPopover();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAddressPopover();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAddressPopoverOpen]);

  useEffect(() => {
    return () => {
      clearCopyResetTimeout();
    };
  }, []);

  useEffect(() => {
    setCopyStatus('idle');
  }, [privyWallet?.address]);

  // Navigate to agent detail page when clicking on an agent in the sidebar
  const handleAgentClick = (agentId: string) => {
    router.push(`/hire-agents/${agentId}`);
  };

  const canSelectChain = ready && authenticated && Boolean(privyWallet) && !isWalletLoading;

  const isHireAgentsActive = pathname === '/hire-agents' || pathname?.startsWith('/hire-agents/');
  const isAcquireActive = pathname === '/acquire';
  const isLeaderboardActive = pathname === '/leaderboard';

  return (
    <div className="flex flex-col h-full w-[260px] flex-shrink-0 bg-[#09090B] border-r border-[#242429] text-[#D1D1D1]">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[#242429]">
        <div className="flex items-center gap-2.5">
          <Image
            src="/ember-logo.svg"
            alt="Ember Logo"
            width={12}
            height={16}
            className="w-3 h-4 object-contain"
          />
          <div className="flex items-center gap-2">
            <Image src="/ember-name.svg" alt="Ember" width={76} height={15} className="h-[15px] w-auto" />
            <span className="text-[10px] font-medium text-[#A7A7B2] px-1.5 py-0.5 bg-[#15161b] border border-[#2A2B32] rounded-[5px]">
              AI
            </span>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Platform Section */}
        <div className="mb-6">
          <div className="text-[11px] font-medium text-[#6F7280] uppercase tracking-[0.12em] px-2 mb-3">
            Platform
          </div>
          <div className="space-y-1">
            {/* Chat - Disabled */}
            <button
              disabled
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left opacity-40 cursor-not-allowed"
            >
              <MessageSquare className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-500">Chat</span>
            </button>

            {/* Agents */}
            <div>
              <button
                onClick={() => setIsAgentsExpanded(!isAgentsExpanded)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${
                  isHireAgentsActive || isAcquireActive
                    ? 'bg-[#1B1C21] border border-[#2B2D36]'
                    : 'hover:bg-[#1B1C21]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4" />
                  <span className="text-sm font-medium text-[#D7D8DE]">Agents</span>
                </div>
                {isAgentsExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
              </button>

              {isAgentsExpanded && (
                <div className="ml-7 mt-1.5 space-y-1">
                  <Link
                    href="/hire-agents"
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors relative ${
                      isHireAgentsActive
                        ? 'text-white bg-[#1C1D23] border border-[#2F313B]'
                        : 'text-[#9A9CAA] hover:text-white hover:bg-[#1B1C21]'
                    }`}
                  >
                    {isHireAgentsActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#fd6731] rounded-r" />
                    )}
                    Hire
                  </Link>
                  <Link
                    href="/acquire"
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors relative ${
                      isAcquireActive
                        ? 'text-white bg-[#1C1D23] border border-[#2F313B]'
                        : 'text-[#9A9CAA] hover:text-white hover:bg-[#1B1C21]'
                    }`}
                  >
                    {isAcquireActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#fd6731] rounded-r" />
                    )}
                    Acquire
                  </Link>
                </div>
              )}
            </div>

            {/* Leaderboard */}
            <Link
              href="/leaderboard"
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors relative ${
                isLeaderboardActive
                  ? 'bg-[#1B1C21] border border-[#2B2D36]'
                  : 'hover:bg-[#1B1C21]'
              }`}
            >
              {isLeaderboardActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#fd6731] rounded-r" />
              )}
              <Trophy className="w-4 h-4" />
              <span className="text-sm font-medium text-[#D7D8DE]">Leaderboard</span>
            </Link>
          </div>
        </div>

        {/* Agent Activity Section */}
        <div>
          <div className="text-[11px] font-medium text-[#6F7280] uppercase tracking-[0.12em] px-2 mb-3">
            Agent Activity
          </div>

          {/* Blocked Agents */}
          <ActivitySection
            title="Blocked"
            count={blockedAgents.length}
            agents={blockedAgents}
            isExpanded={isBlockedExpanded}
            onToggle={() => setIsBlockedExpanded(!isBlockedExpanded)}
            badgeColor="bg-red-500/20 text-red-400"
            icon={<AlertCircle className="w-4 h-4 text-red-400" />}
            agentIconById={agentIconById}
            onAgentClick={handleAgentClick}
          />

          {/* Active Agents */}
          <ActivitySection
            title="Active"
            count={activeAgents.length}
            agents={activeAgents}
            isExpanded={isActiveExpanded}
            onToggle={() => setIsActiveExpanded(!isActiveExpanded)}
            badgeColor="bg-teal-500/20 text-teal-400"
            icon={<Loader className="w-4 h-4 text-teal-400 animate-spin" />}
            agentIconById={agentIconById}
            onAgentClick={handleAgentClick}
          />

          {/* Completed Agents */}
          <ActivitySection
            title="Completed"
            count={completedAgents.length}
            agents={completedAgents}
            isExpanded={isCompletedExpanded}
            onToggle={() => setIsCompletedExpanded(!isCompletedExpanded)}
            badgeColor="bg-blue-500/20 text-blue-400"
            icon={<CheckCircle className="w-4 h-4 text-blue-400" />}
            agentIconById={agentIconById}
            onAgentClick={handleAgentClick}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#242429] space-y-3">
        {/* Network Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsChainMenuOpen((open) => !open)}
            disabled={!canSelectChain}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors ${
              canSelectChain ? 'bg-[#252525] hover:bg-[#2a2a2a]' : 'bg-[#252525]/50 opacity-60'
            }`}
          >
            <span className="text-sm">{selectedChain.name}</span>
            <ChevronDown className="w-4 h-4 text-gray-500 ml-auto" />
          </button>

          {isChainMenuOpen && canSelectChain && (
            <div className="absolute bottom-full mb-2 w-full rounded-lg border border-[#2a2a2a] bg-[#1f1f1f] overflow-hidden z-50">
              {supportedEvmChains.map((chain) => {
                const isSelected = chain.id === selectedChain.id;
                return (
                  <button
                    key={chain.id}
                    type="button"
                    onClick={() => {
                      setIsChainMenuOpen(false);
                      void switchChain(chain.id);
                    }}
                    className={`w-full flex items-center px-3 py-2 text-sm text-left transition-colors ${
                      isSelected ? 'bg-[#2a2a2a] text-white' : 'text-gray-300 hover:bg-[#252525]'
                    }`}
                  >
                    {chain.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Build Agent Button */}
        <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-white font-medium transition-colors">
          Build my Agent
        </button>

        {/* Smart Account Upgrade */}
        {authenticated && privyWallet && !walletError && (
          <>
            {isSmartAccountLoading ? (
              <div className="w-full px-3 py-2 rounded-lg bg-[#252525] text-xs text-gray-300">
                Checking wallet status…
              </div>
            ) : smartAccountError ? (
              <div className="w-full px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-200">
                {smartAccountError.message}
              </div>
            ) : isSmartAccountDeployed === false ? (
              <div className="w-full p-3 rounded-lg bg-[#252525] border border-[#2a2a2a]">
                <div className="text-xs text-gray-300">
                  Upgrade your wallet to a smart account to enable delegations.
                </div>
                <button
                  type="button"
                  onClick={() => upgradeToSmartAccount()}
                  disabled={isSmartAccountUpgrading || isWalletLoading}
                  className="mt-2 w-full flex items-center justify-center px-3 py-2 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-medium transition-colors disabled:opacity-60 disabled:hover:bg-[#2a2a2a]"
                >
                  {isSmartAccountUpgrading ? 'Upgrading…' : 'Upgrade wallet'}
                </button>
              </div>
            ) : null}
          </>
        )}

        {/* Wallet Connection */}
        {walletError ? (
          <div className="w-full px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-200">
            Wallet unavailable
          </div>
        ) : authenticated && privyWallet ? (
          <div
            ref={addressPopoverRef}
            className="relative w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#252525]"
          >
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <button
              type="button"
              onClick={() => setIsAddressPopoverOpen((prev) => !prev)}
              className="flex-1 min-w-0 text-left text-sm font-mono truncate hover:text-white"
              aria-haspopup="dialog"
              aria-expanded={isAddressPopoverOpen}
              aria-controls={addressPopoverId}
            >
              {formatAddress(privyWallet.address)}
            </button>
            <button
              type="button"
              onClick={() => setIsAddressPopoverOpen((prev) => !prev)}
              className="text-xs text-gray-300 hover:text-white"
              aria-label={
                isAddressPopoverOpen ? 'Hide full wallet address' : 'Show full wallet address'
              }
            >
              {isAddressPopoverOpen ? (
                <ChevronDown className="w-4 h-4 rotate-180" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="ml-auto text-xs text-gray-300 hover:text-white"
              disabled={!ready || isWalletLoading}
            >
              Logout
            </button>

            {isAddressPopoverOpen && (
              <div
                id={addressPopoverId}
                role="dialog"
                aria-label="Privy wallet address"
                className="absolute left-3 bottom-full mb-2 z-30 w-max rounded-lg border border-[#2a2a2a] bg-[#1f1f1f] p-3 shadow-lg"
              >
                <div className="text-xs text-gray-400">Privy wallet address</div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={privyWallet.address}
                    onFocus={handleAddressFieldFocus}
                    onClick={handleAddressFieldClick}
                    className="shrink-0 w-auto rounded-md border border-[#2a2a2a] bg-[#151515] px-2 py-1 text-xs font-mono text-gray-200"
                    style={{
                      width: `calc(${Math.max(privyWallet.address.length, 20)}ch + 1rem)`,
                    }}
                    aria-label="Full wallet address"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyAddress()}
                    className="shrink-0 rounded-md border border-[#2a2a2a] bg-[#2a2a2a] px-2 py-1 text-xs text-white hover:bg-[#333]"
                  >
                    {copyStatus === 'success' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {copyStatus === 'error' && (
                  <div className="mt-2 text-xs text-red-300" role="status" aria-live="polite">
                    Clipboard unavailable. Select and copy manually.
                  </div>
                )}
                {copyStatus === 'success' && (
                  <div className="mt-2 text-xs text-green-300" role="status" aria-live="polite">
                    Copied to clipboard.
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => login()}
            disabled={!ready || (ready && authenticated)}
            className="w-full flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#fd6731] hover:bg-[#e55a28] text-white font-medium transition-colors disabled:opacity-60 disabled:hover:bg-[#fd6731]"
          >
            {ready ? 'Login / Connect' : 'Loading...'}
          </button>
        )}
      </div>
    </div>
  );
}

interface ActivitySectionProps {
  title: string;
  count: number;
  agents: AgentActivity[];
  isExpanded: boolean;
  onToggle: () => void;
  badgeColor: string;
  icon: React.ReactNode;
  agentIconById?: Record<string, string | null>;
  onAgentClick?: (agentId: string) => void;
}

function ActivitySection({
  title,
  count,
  agents,
  isExpanded,
  onToggle,
  badgeColor,
  icon,
  agentIconById = {},
  onAgentClick,
}: ActivitySectionProps) {
  const hasAgents = agents.length > 0;

  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        disabled={!hasAgents}
        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors ${
          hasAgents ? 'hover:bg-[#17181d]' : 'cursor-default'
        }`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className={`text-sm ${!hasAgents ? 'text-[#666A77]' : 'text-[#C4C6D1]'}`}>{title}</span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full border ${
              hasAgents ? `${badgeColor} border-current/20` : 'bg-[#181920] text-[#666A77] border-[#2A2C35]'
            }`}
          >
            {count}
          </span>
        </div>
        {hasAgents && (
          <>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </>
        )}
      </button>

      {isExpanded && hasAgents && (
        <div className="mt-1.5 ml-4 space-y-1.5">
          {agents.map((agentItem) => (
            <div
              key={agentItem.id}
              onClick={() => onAgentClick?.(agentItem.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[#252833] bg-[#111319] hover:bg-[#171a22] hover:border-[#323744] cursor-pointer transition-colors"
            >
              {agentIconById[agentItem.id] ? (
                <Image
                  src={agentIconById[agentItem.id] ?? ''}
                  alt=""
                  width={32}
                  height={32}
                  unoptimized
                  className="w-8 h-8 rounded-full bg-black/30 ring-1 ring-[#2D3140] object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5f6bff] to-[#8f47ff] flex items-center justify-center text-xs font-semibold text-white">
                  {agentItem.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-[#E7E7EC] font-medium truncate">{agentItem.name}</div>
                <div className="text-[11px] text-[#8D8D97] truncate">{agentItem.subtitle}</div>
              </div>
              {agentItem.timestamp && (
                <span className="text-xs text-gray-500">{agentItem.timestamp}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
