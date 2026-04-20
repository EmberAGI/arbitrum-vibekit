'use client';

import {
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Bot,
  Trophy,
  AlertCircle,
  Terminal,
  CheckCircle,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLogin, useLogout, usePrivy } from '@privy-io/react-auth';
import type { Chain } from 'viem';
import { defaultEvmChain, supportedEvmChains } from '@/config/evmChains';
import { usePrivyWalletClient } from '@/hooks/usePrivyWalletClient';
import { useUpgradeToSmartAccount } from '@/hooks/useUpgradeToSmartAccount';
import { useOnchainActionsIconMaps } from '@/hooks/useOnchainActionsIconMaps';
import { useAgent } from '@/contexts/AgentContext';
import { useAgentList } from '@/contexts/AgentListContext';
import { getVisibleAgents } from '@/config/agents';
import type { TaskState } from '@/types/agent';
import { resolveSidebarTaskState } from '@/utils/resolveSidebarTaskState';
import { selectRuntimeTaskState } from '@/utils/selectRuntimeTaskState';
import { collectUniqueChainNames, collectUniqueTokenSymbols } from '@/utils/agentCollections';
import { extractTaskStatusMessage } from '@/utils/extractTaskStatusMessage';
import { PROTOCOL_TOKEN_FALLBACK } from '@/constants/protocolTokenFallback';
import { isPrivyConfigured } from '@/utils/privyConfig';
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

const ETHEREUM_MAINNET_CHAIN_ID = 1;
const PORTFOLIO_AGENT_ID = 'agent-portfolio-manager';
const PORTFOLIO_AGENT_CHAT_HREF = `/hire-agents/${PORTFOLIO_AGENT_ID}?tab=chat`;

export function getWalletSelectorChains(chains: readonly Chain[]): Chain[] {
  return chains.filter(
    (chain) => chain.id === defaultEvmChain.id || chain.id === ETHEREUM_MAINNET_CHAIN_ID,
  );
}

export function getSidebarAgentHref(agentId: string): string {
  return agentId === PORTFOLIO_AGENT_ID ? PORTFOLIO_AGENT_CHAT_HREF : `/hire-agents/${agentId}`;
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
  const privyConfigured = isPrivyConfigured();

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

  const agentConfigs = useMemo(() => getVisibleAgents(), []);
  const isInactiveRuntime = agent.config.id === 'inactive-agent';
  const runtimeAgentId = isInactiveRuntime ? null : agent.config.id;
  const runtimeTaskId = agent.uiState.task?.id;
  const runtimeLifecyclePhase = agent.uiState.lifecycle?.phase;
  const runtimeHaltReason = agent.uiState.haltReason;
  const runtimeExecutionError = agent.uiState.executionError;
  const debugStatus = process.env.NEXT_PUBLIC_AGENT_STATUS_DEBUG === 'true';
  const runtimeTaskMessage = extractTaskStatusMessage(agent.uiState.task?.taskStatus?.message);
  const runtimeTaskState = selectRuntimeTaskState({
    effectiveTaskState: agent.uiState.selectors?.effectiveTaskState,
    lifecyclePhase: runtimeLifecyclePhase,
    taskState: agent.uiState.task?.taskStatus?.state,
    taskMessage: runtimeTaskMessage,
  }) as TaskState | undefined;

  const blockedAgents: AgentActivity[] = [];
  const activeAgents: AgentActivity[] = [];
  const completedAgents: AgentActivity[] = [];

  agentConfigs.forEach((config) => {
    const listEntry = listAgents[config.id];
    const useRuntime = runtimeAgentId === config.id;
    const entry = useRuntime
      ? {
          ...listEntry,
          taskId: runtimeTaskId,
          taskState: resolveSidebarTaskState({
            listTaskState: listEntry?.taskState,
            listLifecyclePhase: listEntry?.lifecyclePhase,
            listOnboardingStatus: listEntry?.onboardingStatus,
            runtimeTaskState,
            runtimeLifecyclePhase,
            runtimeOnboardingStatus: agent.uiState.onboardingFlow?.status,
            runtimeTaskMessage,
            fallbackToListWhenRuntimeMissing: false,
          }),
          taskMessage: runtimeTaskMessage,
          haltReason: runtimeHaltReason,
          executionError: runtimeExecutionError,
        }
      : listEntry;

    let taskState = entry?.taskState;
    if (!taskState) {
      return;
    }

    const taskId = entry.taskId ?? config.id;
    const needsInput = taskState === 'input-required';
    const hasError = taskState === 'failed';
    const isBlocked = needsInput || hasError;
    const isCompleted = taskState === 'completed' || taskState === 'canceled';

    if (debugStatus && runtimeAgentId === config.id) {
      console.debug('[AppSidebar] runtime classification', {
        agentId: config.id,
        source: useRuntime ? 'runtime' : 'list',
        runtimeTaskId,
        runtimeTaskState,
        runtimeTaskMessage,
        listTaskState: listEntry?.taskState,
        resolvedTaskState: taskState,
        isBlocked,
        isCompleted,
      });
    }

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

  const walletSelectorChains = useMemo(() => getWalletSelectorChains(supportedEvmChains), []);
  const selectedChain = walletSelectorChains.find((chain) => chain.id === chainId) ?? defaultEvmChain;
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

  const agentAvatarBgById = useMemo(
    () =>
      Object.fromEntries(
        agentConfigs.map((config) => [config.id, config.imageUrl ? config.avatarBg : undefined]),
      ),
    [agentConfigs],
  );

  const agentIconById = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const config of agentConfigs) {
      const profile = listAgents[config.id]?.profile;
      const protocols = profile?.protocols?.length ? profile.protocols : (config.protocols ?? []);
      const chains = profile?.chains?.length ? profile.chains : (config.chains ?? []);
      const avatar =
        resolveAgentAvatarUri({
          imageUrl: config.imageUrl,
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
    router.push(getSidebarAgentHref(agentId));
  };

  const canSelectChain =
    privyConfigured && ready && authenticated && Boolean(privyWallet) && !isWalletLoading;

  const isPortfolioAgentActive = pathname?.startsWith(`/hire-agents/${PORTFOLIO_AGENT_ID}`);
  const isHireAgentsActive =
    pathname === '/hire-agents' || (pathname?.startsWith('/hire-agents/') && !isPortfolioAgentActive);
  const isAcquireActive = pathname === '/acquire';
  const isLeaderboardActive = pathname === '/leaderboard';

  return (
    <div className="flex flex-col h-full w-[312px] flex-shrink-0 bg-[#F7EFE3] border-r border-[#DDC8B3] text-[#3C2A21]">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[#DDC8B3]">
        <div className="flex items-center gap-2.5">
          <Image
            src="/ember-sidebar-logo.png"
            alt="Ember Logo"
            width={10}
            height={16}
            className="w-auto h-4 object-contain"
          />
          <div className="flex items-center gap-2">
            <Image src="/ember-name.svg" alt="Ember" width={76} height={15} className="h-[15px] w-auto" />
            <span className="text-[10px] font-mono font-medium text-[#8A6F58] px-1.5 py-0.5 bg-[#FFF8F0] border border-[#D8C0A7] rounded-[5px]">
              AI
            </span>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Platform Section */}
        <div className="mb-6">
          <div className="text-[11px] font-mono font-medium text-[#A98C74] tracking-[0.12em] px-2 mb-3">
            Platform
          </div>
          <div className="space-y-1">
            <Link
              href={PORTFOLIO_AGENT_CHAT_HREF}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors relative ${
                isPortfolioAgentActive
                  ? 'text-[#241813]'
                  : 'text-[#7B6758] hover:text-[#241813] hover:bg-[#F0E2D2]'
              }`}
            >
              {isPortfolioAgentActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-6 bg-[#fd6731]" />
              )}
              <MessageSquare className="w-4 h-4 text-[#9B7C63]" />
              <span className="text-sm font-medium text-[#2C1E17]">Ember Portfolio Agent</span>
            </Link>

            {/* Agents */}
            <div>
              <button
                onClick={() => setIsAgentsExpanded(!isAgentsExpanded)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-[#F0E2D2]"
              >
                <div className="flex items-center gap-3">
                  <Bot className="w-4 h-4 text-[#9B7C63]" />
                  <span className="text-sm font-medium text-[#2C1E17]">Agents</span>
                </div>
                {isAgentsExpanded ? (
                  <ChevronDown className="w-4 h-4 text-[#9B7C63]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[#9B7C63]" />
                )}
              </button>

              {isAgentsExpanded && (
                <div className="ml-7 mt-1.5 space-y-1">
                  <Link
                    href="/hire-agents"
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors relative ${
                      isHireAgentsActive
                        ? 'text-[#241813]'
                        : 'text-[#7B6758] hover:text-[#241813] hover:bg-[#F0E2D2]'
                    }`}
                  >
                    {isHireAgentsActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-6 bg-[#fd6731]" />
                    )}
                    Hire
                  </Link>
                  <Link
                    href="/acquire"
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors relative ${
                      isAcquireActive
                        ? 'text-[#241813]'
                        : 'text-[#7B6758] hover:text-[#241813] hover:bg-[#F0E2D2]'
                    }`}
                  >
                    {isAcquireActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-6 bg-[#fd6731]" />
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
                  ? 'text-[#241813]'
                  : 'text-[#7B6758] hover:text-[#241813] hover:bg-[#F0E2D2]'
              }`}
            >
              {isLeaderboardActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-6 bg-[#fd6731]" />
              )}
              <Trophy className="w-4 h-4 text-[#9B7C63]" />
              <span className="text-sm font-medium text-[#2C1E17]">Leaderboard</span>
            </Link>
          </div>
        </div>

        {/* Agent Activity Section */}
        <div>
          <div className="text-[11px] font-mono font-medium text-[#A98C74] tracking-[0.12em] px-2 mb-3">
            Agent Activity
          </div>

          {/* Blocked Agents */}
          <ActivitySection
            title="Blocked"
            count={blockedAgents.length}
            agents={blockedAgents}
            isExpanded={isBlockedExpanded}
            onToggle={() => setIsBlockedExpanded(!isBlockedExpanded)}
            badgeColor="bg-[#FCE6E4] text-[#B84C38]"
            icon={<AlertCircle className="w-4 h-4 text-[#A98C74]" />}
            agentIconById={agentIconById}
            agentAvatarBgById={agentAvatarBgById}
            onAgentClick={handleAgentClick}
          />

          {/* Active Agents */}
          <ActivitySection
            title="Active"
            count={activeAgents.length}
            agents={activeAgents}
            isExpanded={isActiveExpanded}
            onToggle={() => setIsActiveExpanded(!isActiveExpanded)}
            badgeColor="bg-[#E6F1E8] text-[#4E7A58]"
            icon={<Terminal className="w-4 h-4 text-[#A98C74]" />}
            agentIconById={agentIconById}
            agentAvatarBgById={agentAvatarBgById}
            onAgentClick={handleAgentClick}
          />

          {/* Completed Agents */}
          <ActivitySection
            title="Completed"
            count={completedAgents.length}
            agents={completedAgents}
            isExpanded={isCompletedExpanded}
            onToggle={() => setIsCompletedExpanded(!isCompletedExpanded)}
            badgeColor="bg-[#E8EDF8] text-[#5D73B5]"
            icon={<CheckCircle className="w-4 h-4 text-[#A98C74]" />}
            agentIconById={agentIconById}
            agentAvatarBgById={agentAvatarBgById}
            onAgentClick={handleAgentClick}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#DDC8B3] space-y-3">
        {/* Network Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsChainMenuOpen((open) => !open)}
            disabled={!canSelectChain}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors ${
              canSelectChain
                ? 'bg-[#FFF8F0] hover:bg-[#F4E6D8] border border-[#DDC8B3]'
                : 'bg-[#EFE4D7] border border-[#DDC8B3] opacity-60'
            }`}
          >
            <span className="text-sm">{selectedChain.name}</span>
            <ChevronDown className="w-4 h-4 text-[#9B7C63] ml-auto" />
          </button>

          {isChainMenuOpen && canSelectChain && (
            <div className="absolute bottom-full mb-2 w-full rounded-lg border border-[#DDC8B3] bg-[#FFF8F0] overflow-hidden z-50 shadow-[0_12px_32px_rgba(81,49,30,0.12)]">
              {walletSelectorChains.map((chain) => {
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
                      isSelected
                        ? 'bg-[#F0E2D2] text-[#241813]'
                        : 'text-[#6F5A4C] hover:bg-[#FFF2E4]'
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
        <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#DDC8B3] bg-[#FFF8F0] hover:bg-[#F4E6D8] text-[#2C1E17] font-medium transition-colors">
          Build my Agent
        </button>

        {/* Smart Account Upgrade */}
        {privyConfigured && authenticated && privyWallet && !walletError && (
          <>
            {isSmartAccountLoading ? (
              <div className="w-full px-3 py-2 rounded-lg border border-[#DDC8B3] bg-[#FFF8F0] text-xs text-[#6F5A4C]">
                Checking wallet status…
              </div>
            ) : smartAccountError ? (
              <div className="w-full px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-200">
                {smartAccountError.message}
              </div>
            ) : isSmartAccountDeployed === false ? (
              <div className="w-full p-3 rounded-lg bg-[#FFF8F0] border border-[#DDC8B3]">
                <div className="text-xs text-[#6F5A4C]">
                  Upgrade your wallet to a smart account to enable delegations.
                </div>
                <button
                  type="button"
                  onClick={() => upgradeToSmartAccount()}
                  disabled={isSmartAccountUpgrading || isWalletLoading}
                  className="mt-2 w-full flex items-center justify-center px-3 py-2 rounded-lg bg-[#2F211B] hover:bg-[#241813] text-white text-sm font-medium transition-colors disabled:opacity-60 disabled:hover:bg-[#2F211B]"
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
            className="relative w-full rounded-lg border border-[#DDC8B3] bg-[#FFF8F0] px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <button
                type="button"
                onClick={() => setIsAddressPopoverOpen((prev) => !prev)}
                className="flex-1 min-w-0 text-left text-sm font-mono truncate hover:text-[#241813]"
                aria-haspopup="dialog"
                aria-expanded={isAddressPopoverOpen}
                aria-controls={addressPopoverId}
              >
                {formatAddress(privyWallet.address)}
              </button>
              <button
                type="button"
                onClick={() => setIsAddressPopoverOpen((prev) => !prev)}
                className="text-xs text-[#7B6758] hover:text-[#241813]"
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
                className="ml-auto text-xs text-[#7B6758] hover:text-[#241813]"
                disabled={!ready || isWalletLoading}
              >
                Logout
              </button>
            </div>

            <div className="mt-2 border-t border-[#DDC8B3] pt-2">
              <Link
                href="/wallet"
                className="inline-flex text-xs text-[#7B6758] hover:text-[#241813] transition-colors"
              >
                Manage Wallet
              </Link>
            </div>

            {isAddressPopoverOpen && (
              <div
                id={addressPopoverId}
                role="dialog"
                aria-label="Privy wallet address"
                className="absolute left-3 bottom-full mb-2 z-30 w-max rounded-lg border border-[#DDC8B3] bg-[#FFF8F0] p-3 shadow-[0_12px_32px_rgba(81,49,30,0.12)]"
              >
                <div className="text-xs text-[#8A6F58]">Privy wallet address</div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={privyWallet.address}
                    onFocus={handleAddressFieldFocus}
                    onClick={handleAddressFieldClick}
                    className="shrink-0 w-auto rounded-md border border-[#DDC8B3] bg-[#FCF5EC] px-2 py-1 text-xs font-mono text-[#2C1E17]"
                    style={{
                      width: `calc(${Math.max(privyWallet.address.length, 20)}ch + 1rem)`,
                    }}
                    aria-label="Full wallet address"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyAddress()}
                    className="shrink-0 rounded-md border border-[#DDC8B3] bg-[#F0E2D2] px-2 py-1 text-xs text-[#2C1E17] hover:bg-[#E6D2BF]"
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
        ) : !privyConfigured ? (
          <div className="w-full px-3 py-2 rounded-lg border border-[#DDC8B3] bg-[#EFE4D7] text-xs text-[#8A6F58]">
            Privy auth unavailable
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
  agentAvatarBgById?: Record<string, string | undefined>;
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
  agentAvatarBgById = {},
  onAgentClick,
}: ActivitySectionProps) {
  const hasAgents = agents.length > 0;

  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        disabled={!hasAgents}
        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors ${
          hasAgents ? 'hover:bg-[#F0E2D2]' : 'cursor-default'
        }`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className={`text-sm ${!hasAgents ? 'text-[#A88F7A]' : 'text-[#3C2A21]'}`}>{title}</span>
          <span
            className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
              hasAgents ? `${badgeColor} border-current/20` : 'bg-[#EFE4D7] text-[#A88F7A] border-[#D9C6B1]'
            }`}
          >
            {count}
          </span>
        </div>
        {hasAgents && (
          <>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-[#9B7C63]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#9B7C63]" />
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
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[#E3D2BF] bg-[#FFF8F0] hover:bg-[#F9EFE2] hover:border-[#D7BFA5] cursor-pointer transition-colors"
            >
              {agentIconById[agentItem.id] ? (
                <Image
                  src={agentIconById[agentItem.id] ?? ''}
                  alt=""
                  width={32}
                  height={32}
                  unoptimized
                  className="w-8 h-8 rounded-full ring-1 ring-[#E7D3BE] object-contain"
                  style={
                    agentAvatarBgById[agentItem.id]
                      ? { background: agentAvatarBgById[agentItem.id] }
                      : { background: 'rgba(253,103,49,0.12)' }
                  }
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FD6731] to-[#E3A04E] flex items-center justify-center text-xs font-semibold text-white">
                  {agentItem.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-[#2C1E17] font-medium truncate">{agentItem.name}</div>
                <div className="text-[11px] text-[#8A6F58] truncate">{agentItem.subtitle}</div>
              </div>
              {agentItem.timestamp && (
                <span className="text-xs text-[#A98C74]">{agentItem.timestamp}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
