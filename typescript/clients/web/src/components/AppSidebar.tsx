'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Settings,
  ChevronDown,
  ChevronRight,
  Wifi,
  CheckCircle,
  Sparkles,
  Bug,
  MessageSquare,
  AlertCircle,
  Loader,
  Circle,
} from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Session } from '@/lib/types/session';

interface AppSidebarProps {
  isA2AConnected: boolean;
  isA2AConnecting: boolean;
  mcpConnectionStatus: string;
  mcpToolsCount: number;
  mcpPromptsCount: number;
  mcpResourcesCount: number;
  mcpTemplatesCount: number;
  onShowConnection: () => void;
  onShowSettings: () => void;
  showConnection: boolean;
  showSettings: boolean;
  onShowDebug: () => void;
  debugLogsCount: number;
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  sessionOrder: string[];
  onSwitchSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onCreateSession: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  isA2AConnected,
  _isA2AConnecting,
  mcpConnectionStatus,
  mcpToolsCount,
  mcpPromptsCount,
  mcpResourcesCount,
  mcpTemplatesCount,
  onShowConnection,
  onShowSettings,
  showConnection,
  showSettings,
  onShowDebug,
  debugLogsCount,
  sessions,
  activeSessionId,
  sessionOrder,
  onSwitchSession,
  _onCloseSession,
  _onCreateSession,
}) => {
  // Check if debug mode is enabled
  const isDebugMode = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';

  const [isCapabilitiesExpanded, setIsCapabilitiesExpanded] = useState(false);
  const [isActiveStrategiesExpanded, setIsActiveStrategiesExpanded] = useState(true);
  const [isCompletedStrategiesExpanded, setIsCompletedStrategiesExpanded] = useState(false);
  const [isBlockedStrategiesExpanded, setIsBlockedStrategiesExpanded] = useState(true);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [isConnectionsExpanded, setIsConnectionsExpanded] = useState(false);

  // Find the main chat session
  const mainChatSession = Object.values(sessions).find((session) => session.isMainChat);

  // Filter sessions by strategy state (excluding main chat)
  // Priority: completed > blocked > active (sessions should only appear in one category)
  const completedStrategies = sessionOrder.filter((sessionId) => {
    const session = sessions[sessionId];
    if (!session || session.isMainChat) return false;
    // Completed state takes priority over everything else
    const isCompleted = session.status === 'completed';
    if (isCompleted) {
      console.log('[AppSidebar] Found completed session:', {
        sessionId,
        title: session.title,
        status: session.status,
      });
    }
    return isCompleted;
  });

  const blockedStrategies = sessionOrder.filter((sessionId) => {
    const session = sessions[sessionId];
    if (!session || session.isMainChat) return false;
    // Skip if already in completed
    if (completedStrategies.includes(sessionId)) return false;
    // Blocked: error, waiting for input, or paused
    return (
      session.status === 'error' ||
      session.status === 'waiting' ||
      session.status === 'paused' ||
      session.messages?.some((msg: any) => msg.awaitingUserAction || msg.statusData?.awaitingInput)
    );
  });

  const activeStrategies = sessionOrder.filter((sessionId) => {
    const session = sessions[sessionId];
    if (!session || session.isMainChat) return false;
    // Skip if already categorized as completed or blocked
    if (completedStrategies.includes(sessionId) || blockedStrategies.includes(sessionId))
      return false;
    // Active: working, active, connecting, or any other state
    return (
      session.status === 'working' ||
      session.status === 'active' ||
      session.status === 'connecting' ||
      session.status === 'idle'
    );
  });

  // Determine category order based on blocked strategies
  const categoryOrder =
    blockedStrategies.length > 0
      ? ['blocked', 'active', 'completed']
      : ['active', 'completed', 'blocked'];

  const getSessionIcon = (session: Session) => {
    // Check if session is awaiting user input
    const hasAwaitingInput = session.messages?.some(
      (msg: any) => msg.awaitingUserAction || msg.statusData?.awaitingInput,
    );

    if (hasAwaitingInput || session.status === 'waiting') {
      return <AlertCircle className="w-4 h-4" />;
    }
    if (session.status === 'working' || session.status === 'connecting') {
      return <Loader className="w-4 h-4 animate-spin" />;
    }
    if (session.status === 'completed') {
      return <CheckCircle className="w-4 h-4" />;
    }
    return <Circle className="w-4 h-4" />;
  };

  return (
    <div
      className="flex flex-col h-full w-[320px]"
      style={{
        backgroundColor: '#2a2a2a',
        borderRight: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      {/* Header */}
      <div className="p-4" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <div className="flex items-center gap-3">
          <Image src="/Logo (1).svg" alt="Ember Logo" width={32} height={32} />
          <div>
            <div className="flex items-center gap-2">
              <Image src="/name.svg" alt="EmberAi" width={80} height={14} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">AI</p>
          </div>
        </div>
      </div>

      {/* Main Settings Section */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Platform Section */}
        <div>
          <div className="flex items-center gap-2 px-2 py-1 mb-2">
            <span className="text-xs text-muted-foreground font-medium">Platform</span>
          </div>
          <div className="space-y-1">
            {/* Chat Button */}
            {mainChatSession && (
              <div
                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer group relative ${
                  activeSessionId === mainChatSession.id ? 'bg-muted' : 'hover:bg-muted/50'
                }`}
                onClick={() => onSwitchSession(mainChatSession.id)}
              >
                {/* Active indicator - orange vertical line on the left */}
                {activeSessionId === mainChatSession.id && (
                  <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-[#FD6731] rounded-r-full" />
                )}
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm font-medium">Chat</span>
                {mainChatSession.status === 'working' && (
                  <Loader className="w-3 h-3 ml-auto animate-spin text-blue-400" />
                )}
              </div>
            )}

            {/* Strategies Button */}
            <div
              className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/50"
              onClick={() => {
                // TODO: Implement strategies view
                console.log('Strategies clicked');
              }}
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
              <span className="text-sm font-medium">Strategies</span>
            </div>

            {/* Powerups Button (Disabled) */}
            <div className="flex items-center gap-2 p-2 rounded-md opacity-50 cursor-not-allowed">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Powerups</span>
            </div>
          </div>
        </div>

        {/* Agent Activity Header */}
        <div>
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="text-xs text-muted-foreground font-medium">Agent Activity</span>
          </div>
        </div>

        {/* Strategy Categories - Always shown, ordered dynamically */}
        {categoryOrder.map((categoryType) => {
          let strategies: string[];
          let title: string;
          let iconClass: string;
          let badgeColor: string;
          let isExpanded: boolean;
          let setIsExpanded: (value: boolean) => void;

          if (categoryType === 'active') {
            strategies = activeStrategies;
            title = 'Active Strategies';
            iconClass = activeStrategies.length > 0 ? 'text-teal-400' : 'text-gray-500';
            badgeColor = activeStrategies.length > 0 ? 'bg-teal-500' : 'bg-gray-600';
            isExpanded = isActiveStrategiesExpanded;
            setIsExpanded = setIsActiveStrategiesExpanded;
          } else if (categoryType === 'completed') {
            strategies = completedStrategies;
            title = 'Completed Strategies';
            iconClass = completedStrategies.length > 0 ? 'text-blue-400' : 'text-gray-500';
            badgeColor = completedStrategies.length > 0 ? 'bg-blue-400' : 'bg-gray-600';
            isExpanded = isCompletedStrategiesExpanded;
            setIsExpanded = setIsCompletedStrategiesExpanded;
          } else {
            strategies = blockedStrategies;
            title = 'Blocked Strategies';
            iconClass = blockedStrategies.length > 0 ? 'text-amber-400' : 'text-gray-500';
            badgeColor = blockedStrategies.length > 0 ? 'bg-amber-500' : 'bg-gray-600';
            isExpanded = isBlockedStrategiesExpanded;
            setIsExpanded = setIsBlockedStrategiesExpanded;
          }

          const hasStrategies = strategies.length > 0;
          const isDisabled = !hasStrategies;

          return (
            <div key={categoryType}>
              <button
                onClick={() => {
                  if (!isDisabled) {
                    setIsExpanded(!isExpanded);
                  }
                }}
                className={`w-full ${isDisabled ? 'cursor-not-allowed' : ''}`}
                disabled={isDisabled}
              >
                <div
                  className={`flex items-center justify-between w-full p-2 rounded-md ${!isDisabled ? 'hover:bg-muted/50' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    {categoryType === 'active' && <Loader className={`w-4 h-4 ${iconClass}`} />}
                    {categoryType === 'completed' && (
                      <CheckCircle className={`w-4 h-4 ${iconClass}`} />
                    )}
                    {categoryType === 'blocked' && (
                      <AlertCircle className={`w-4 h-4 ${iconClass}`} />
                    )}
                    <span className={`text-sm font-medium ${isDisabled ? 'text-gray-500' : ''}`}>
                      {title}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-xs px-2 py-0.5 ${badgeColor} ${isDisabled ? 'text-gray-400' : 'text-white'} border-none`}
                    >
                      {strategies.length}
                    </Badge>
                  </div>
                  {!isDisabled && (
                    <>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </>
                  )}
                </div>
              </button>
              {isExpanded && hasStrategies && (
                <div className="mt-2 space-y-1 pl-2">
                  {strategies.map((sessionId) => {
                    const session = sessions[sessionId];
                    if (!session) return null;

                    const isActive = activeSessionId === sessionId;

                    return (
                      <div
                        key={sessionId}
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer group relative ${
                          isActive ? 'bg-muted' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => onSwitchSession(sessionId)}
                      >
                        {/* Colored indicator line on the left */}
                        <div
                          className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r ${badgeColor}`}
                        />

                        <div className="flex items-center gap-2 flex-1 min-w-0 pl-2">
                          {getSessionIcon(session)}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate font-medium">
                              {session.title}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {session.subtitle ||
                                (categoryType === 'active'
                                  ? 'Active'
                                  : categoryType === 'completed'
                                    ? 'Completed'
                                    : 'Blocked')}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* New Session Button - Hidden per requirements */}
        {/* <div className="pt-2">
          <Button
            onClick={onCreateSession}
            variant="outline"
            size="sm"
            className="w-full text-xs justify-start"
            style={{ border: "none" }}
          >
            <Plus className="w-3 h-3 mr-2" />
            New Session
          </Button>
        </div> */}
      </div>

      {/* Bottom Section */}
      <div className="p-4 space-y-3" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
        {/* Settings */}
        <div>
          <button onClick={() => setIsSettingsExpanded(!isSettingsExpanded)} className="w-full">
            <div className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded-md">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Settings</span>
              </div>
              {isSettingsExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>
          </button>
          {isSettingsExpanded && (
            <div className="mt-2 space-y-2 pl-6">
              <Button
                onClick={onShowSettings}
                variant="ghost"
                size="sm"
                className="w-full text-xs justify-start"
              >
                <Settings className="w-3 h-3 mr-2" />
                {showSettings ? 'Hide' : 'Show'} Settings Panel
              </Button>
              <Button
                onClick={onShowConnection}
                variant="ghost"
                size="sm"
                className="w-full text-xs justify-start"
              >
                <Wifi className="w-3 h-3 mr-2" />
                {showConnection ? 'Hide' : 'Show'} Connection Panel
              </Button>
            </div>
          )}
        </div>

        {/* Connection Status */}
        {isDebugMode && (
          <div>
            <button
              onClick={() => setIsConnectionsExpanded(!isConnectionsExpanded)}
              className="w-full"
            >
              <div className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded-md">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Connections</span>
                </div>
                <div className="flex items-center gap-2">
                  {!isConnectionsExpanded && (
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={isA2AConnected ? 'success' : 'secondary'}
                        className="text-xs px-1.5 py-0.5"
                        style={{ border: 'none', fontSize: '10px' }}
                      >
                        A2A
                      </Badge>
                      <Badge
                        variant={mcpConnectionStatus === 'connected' ? 'success' : 'secondary'}
                        className="text-xs px-1.5 py-0.5"
                        style={{ border: 'none', fontSize: '10px' }}
                      >
                        MCP
                      </Badge>
                    </div>
                  )}
                  {isConnectionsExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
              </div>
            </button>
            {isConnectionsExpanded && (
              <div className="mt-2 space-y-2 pl-6">
                {isA2AConnected && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">A2A</span>
                    <Badge
                      variant="success"
                      className="text-xs flex items-center gap-1"
                      style={{ border: 'none' }}
                    >
                      <CheckCircle className="w-3 h-3" />
                      Connected
                    </Badge>
                  </div>
                )}
                {mcpConnectionStatus === 'connected' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">MCP</span>
                    <Badge
                      variant="success"
                      className="text-xs flex items-center gap-1"
                      style={{ border: 'none' }}
                    >
                      <CheckCircle className="w-3 h-3" />
                      Connected
                    </Badge>
                  </div>
                )}
                {mcpConnectionStatus === 'connecting' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">MCP</span>
                    <Badge variant="secondary" className="text-xs" style={{ border: 'none' }}>
                      Connecting...
                    </Badge>
                  </div>
                )}
                {!isA2AConnected &&
                  mcpConnectionStatus !== 'connected' &&
                  mcpConnectionStatus !== 'connecting' && (
                    <div className="text-xs text-muted-foreground">No connections</div>
                  )}
              </div>
            )}
          </div>
        )}

        {/* MCP Capabilities */}
        {isDebugMode && mcpConnectionStatus === 'connected' && (
          <div>
            <button
              onClick={() => setIsCapabilitiesExpanded(!isCapabilitiesExpanded)}
              className="w-full"
            >
              <div className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded-md">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-medium">MCP Resources</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className="text-xs bg-orange-500/20 text-orange-400"
                    style={{ border: 'none' }}
                  >
                    {mcpToolsCount + mcpPromptsCount + mcpResourcesCount + mcpTemplatesCount}
                  </Badge>
                  {isCapabilitiesExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
              </div>
            </button>
            {isCapabilitiesExpanded && (
              <div className="mt-2 space-y-2 pl-6">
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-muted-foreground">Tools</span>
                  <Badge variant="secondary" className="text-xs" style={{ border: 'none' }}>
                    {mcpToolsCount}
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-muted-foreground">Prompts</span>
                  <Badge variant="secondary" className="text-xs" style={{ border: 'none' }}>
                    {mcpPromptsCount}
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-muted-foreground">Resources</span>
                  <Badge variant="secondary" className="text-xs" style={{ border: 'none' }}>
                    {mcpResourcesCount}
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-muted-foreground">Templates</span>
                  <Badge variant="secondary" className="text-xs" style={{ border: 'none' }}>
                    {mcpTemplatesCount}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Debug Console Button */}
        {isDebugMode && (
          <div>
            <Button
              onClick={onShowDebug}
              variant="outline"
              className="w-full justify-start text-left"
              style={{ borderColor: '#404040', backgroundColor: 'transparent' }}
            >
              <Bug className="w-4 h-4 mr-2 text-orange-500" />
              <span className="flex-1">Debug Console</span>
              {debugLogsCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-2"
                  style={{
                    backgroundColor: '#FD6731',
                    color: 'white',
                    border: 'none',
                  }}
                >
                  {debugLogsCount}
                </Badge>
              )}
            </Button>
          </div>
        )}

        {/* Separator */}
        <div
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            margin: '12px 0',
          }}
        />

        {/* Wallet Connect - Full Width */}
        <div className="w-full">
          <div style={{ width: '100%', textAlign: 'center' }} className="wallet-connect-wrapper">
            <ConnectButton />
          </div>
        </div>
      </div>
    </div>
  );
};
