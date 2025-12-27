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
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useLogin, useLogout, usePrivy } from '@privy-io/react-auth';
import { supportedEvmChains, getEvmChainOrDefault } from '@/config/evmChains';
import { usePrivyWalletClient } from '@/hooks/usePrivyWalletClient';
import { useUpgradeToSmartAccount } from '@/hooks/useUpgradeToSmartAccount';
import { useAgentConnection } from '@/hooks/useAgentConnection';
import { DEFAULT_AGENT_ID } from '@/config/agents';

export interface AgentActivity {
  id: string;
  name: string;
  subtitle: string;
  status: 'active' | 'blocked' | 'completed';
  timestamp?: string;
}

export function AppSidebar() {
  const pathname = usePathname();
  const [isAgentsExpanded, setIsAgentsExpanded] = useState(true);
  const [isBlockedExpanded, setIsBlockedExpanded] = useState(true);
  const [isActiveExpanded, setIsActiveExpanded] = useState(true);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
  const [isChainMenuOpen, setIsChainMenuOpen] = useState(false);

  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { privyWallet, chainId, switchChain, isLoading: isWalletLoading, error: walletError } =
    usePrivyWalletClient();
  const {
    isDeployed: isSmartAccountDeployed,
    isLoading: isSmartAccountLoading,
    isUpgrading: isSmartAccountUpgrading,
    upgradeToSmartAccount,
    error: smartAccountError,
  } = useUpgradeToSmartAccount();

  // Get agent activity data
  const agent = useAgentConnection(DEFAULT_AGENT_ID);

  // Derive task status - only show a card if there's a task ID
  const taskId = agent.view.task?.id;
  const taskState = agent.view.task?.taskStatus?.state;

  // Determine which category this task belongs to (mutually exclusive)
  const isBlocked = Boolean(
    agent.view.haltReason || agent.view.executionError || agent.activeInterrupt
  );
  const isCompleted = taskState === 'completed' || taskState === 'canceled';
  const isRunning = taskId && agent.isActive && !isBlocked && !isCompleted;

  const blockedAgents: AgentActivity[] =
    taskId && isBlocked
      ? [
          {
            id: taskId,
            name: agent.config.name,
            subtitle: agent.activeInterrupt
              ? 'Set up agent'
              : agent.view.haltReason ?? agent.view.executionError ?? 'Blocked',
            status: 'blocked',
          },
        ]
      : [];

  const activeAgents: AgentActivity[] =
    taskId && isRunning
      ? [
          {
            id: taskId,
            name: agent.config.name,
            subtitle: `Task: ${taskId.slice(0, 8)}...`,
            status: 'active',
          },
        ]
      : [];

  const completedAgents: AgentActivity[] =
    taskId && isCompleted
      ? [
          {
            id: taskId,
            name: agent.config.name,
            subtitle: taskState === 'canceled' ? 'Canceled' : 'Completed',
            status: 'completed',
          },
        ]
      : [];

  const selectedChain = getEvmChainOrDefault(chainId);

  const formatAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

  const canSelectChain = ready && authenticated && Boolean(privyWallet) && !isWalletLoading;

  const isHireAgentsActive = pathname === '/hire-agents' || pathname?.startsWith('/hire-agents/');
  const isAcquireActive = pathname === '/acquire';
  const isLeaderboardActive = pathname === '/leaderboard';

  return (
    <div className="flex flex-col h-full w-[260px] bg-[#1a1a1a] border-r border-[#2a2a2a]">
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-3">
          <Image src="/ember-logo.svg" alt="Ember Logo" width={28} height={35} />
          <div className="flex items-center gap-2">
            <Image src="/ember-name.svg" alt="Ember" width={80} height={16} />
            <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-[#2a2a2a] rounded">AI</span>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Platform Section */}
        <div className="mb-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 mb-3">
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
                  isHireAgentsActive || isAcquireActive ? 'bg-[#252525]' : 'hover:bg-[#252525]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4" />
                  <span className="text-sm font-medium">Agents</span>
                </div>
                {isAgentsExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
              </button>

              {isAgentsExpanded && (
                <div className="ml-7 mt-1 space-y-1">
                  <Link
                    href="/hire-agents"
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors relative ${
                      isHireAgentsActive
                        ? 'text-white bg-[#2a2a2a]'
                        : 'text-gray-400 hover:text-white hover:bg-[#252525]'
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
                        ? 'text-white bg-[#2a2a2a]'
                        : 'text-gray-400 hover:text-white hover:bg-[#252525]'
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
                isLeaderboardActive ? 'bg-[#252525]' : 'hover:bg-[#252525]'
              }`}
            >
              {isLeaderboardActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#fd6731] rounded-r" />
              )}
              <Trophy className="w-4 h-4" />
              <span className="text-sm font-medium">Leaderboard</span>
            </Link>
          </div>
        </div>

        {/* Agent Activity Section */}
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 mb-3">
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
          />
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#2a2a2a] space-y-3">
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
        <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#fd6731] hover:bg-[#e55a28] text-white font-medium transition-colors">
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
          <div className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#252525]">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-mono truncate">{formatAddress(privyWallet.address)}</span>
            <button
              type="button"
              onClick={() => void logout()}
              className="ml-auto text-xs text-gray-300 hover:text-white"
              disabled={!ready || isWalletLoading}
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => login()}
            disabled={!ready || (ready && authenticated)}
            className="w-full flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] text-white font-medium transition-colors disabled:opacity-60 disabled:hover:bg-[#252525]"
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
}

function ActivitySection({
  title,
  count,
  agents,
  isExpanded,
  onToggle,
  badgeColor,
  icon,
}: ActivitySectionProps) {
  const hasAgents = agents.length > 0;

  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        disabled={!hasAgents}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
          hasAgents ? 'hover:bg-[#252525]' : 'cursor-default'
        }`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className={`text-sm ${!hasAgents ? 'text-gray-500' : ''}`}>{title}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              hasAgents ? badgeColor : 'bg-gray-700/50 text-gray-500'
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
        <div className="mt-1 ml-4 space-y-1">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#252525] cursor-pointer transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold">
                {agent.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{agent.name}</div>
                <div className="text-xs text-gray-500 truncate">{agent.subtitle}</div>
              </div>
              {agent.timestamp && (
                <span className="text-xs text-gray-500">{agent.timestamp}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
