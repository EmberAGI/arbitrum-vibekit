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
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export interface AgentActivity {
  id: string;
  name: string;
  subtitle: string;
  status: 'active' | 'blocked' | 'completed';
  timestamp?: string;
}

interface AppSidebarProps {
  currentPage: 'chat' | 'hire' | 'acquire' | 'leaderboard';
  onNavigate: (page: 'chat' | 'hire' | 'acquire' | 'leaderboard') => void;
  blockedAgents: AgentActivity[];
  activeAgents: AgentActivity[];
  completedAgents: AgentActivity[];
  selectedNetwork?: string;
}

export function AppSidebar({
  currentPage,
  onNavigate,
  blockedAgents,
  activeAgents,
  completedAgents,
}: AppSidebarProps) {
  const [isAgentsExpanded, setIsAgentsExpanded] = useState(true);
  const [isBlockedExpanded, setIsBlockedExpanded] = useState(true);
  const [isActiveExpanded, setIsActiveExpanded] = useState(true);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);

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
                  currentPage === 'hire' || currentPage === 'acquire'
                    ? 'bg-[#252525]'
                    : 'hover:bg-[#252525]'
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
                  <button
                    onClick={() => onNavigate('hire')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors relative ${
                      currentPage === 'hire'
                        ? 'text-white bg-[#2a2a2a]'
                        : 'text-gray-400 hover:text-white hover:bg-[#252525]'
                    }`}
                  >
                    {currentPage === 'hire' && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#fd6731] rounded-r" />
                    )}
                    Hire
                  </button>
                  <button
                    onClick={() => onNavigate('acquire')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors relative ${
                      currentPage === 'acquire'
                        ? 'text-white bg-[#2a2a2a]'
                        : 'text-gray-400 hover:text-white hover:bg-[#252525]'
                    }`}
                  >
                    {currentPage === 'acquire' && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#fd6731] rounded-r" />
                    )}
                    Acquire
                  </button>
                </div>
              )}
            </div>

            {/* Leaderboard */}
            <button
              onClick={() => onNavigate('leaderboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors relative ${
                currentPage === 'leaderboard' ? 'bg-[#252525]' : 'hover:bg-[#252525]'
              }`}
            >
              {currentPage === 'leaderboard' && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#fd6731] rounded-r" />
              )}
              <Trophy className="w-4 h-4" />
              <span className="text-sm font-medium">Leaderboard</span>
            </button>
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
        {/* Network Selector - Using RainbowKit's chain selector */}
        <ConnectButton.Custom>
          {({ chain, openChainModal }) => {
            if (!chain) return null;
            return (
              <button
                onClick={openChainModal}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#252525] hover:bg-[#2a2a2a] transition-colors"
              >
                {chain.hasIcon && chain.iconUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={chain.iconUrl}
                    alt={chain.name ?? 'Chain icon'}
                    className="w-5 h-5 rounded-full"
                  />
                )}
                <span className="text-sm">{chain.name}</span>
                <ChevronDown className="w-4 h-4 text-gray-500 ml-auto" />
              </button>
            );
          }}
        </ConnectButton.Custom>

        {/* Build Agent Button */}
        <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#fd6731] hover:bg-[#e55a28] text-white font-medium transition-colors">
          Build my Agent
        </button>

        {/* Wallet Connection */}
        <div className="wallet-connect-wrapper">
          <ConnectButton
            showBalance={false}
            chainStatus="none"
            accountStatus={{
              smallScreen: 'avatar',
              largeScreen: 'full',
            }}
          />
        </div>
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
