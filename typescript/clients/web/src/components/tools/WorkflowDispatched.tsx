'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

interface WorkflowDispatchedProps {
  name?: string;
  subtitle?: string;
  token?: string;
  chains?: Array<{ chainName: string; chainIconUri?: string }>;
  protocol?: string;
  rewards?: Array<{
    type: 'points' | 'apy';
    multiplier?: number;
    percentage?: number;
    reward: string;
  }>;
  tokenIconUri?: string;
  platformIconUri?: string;
  childSessionId?: string;
  childTaskId?: string;
  taskId?: string;
  id?: string;
  onNavigate?: (sessionId: string) => void;
  workflowChildSessions?: Record<string, string>;
  sessions?: Record<string, any>;
  sessionOrder?: string[];
}

export function WorkflowDispatched({
  name,
  subtitle,
  rewards = [],
  tokenIconUri,
  platformIconUri,
  childSessionId: propChildSessionId,
  childTaskId,
  taskId,
  id,
  onNavigate,
  workflowChildSessions = {},
  sessions = {},
  sessionOrder = [],
}: WorkflowDispatchedProps) {
  const handleConfigureClick = () => {
    if (!onNavigate) return;

    // Try to resolve childSessionId from multiple sources
    let resolvedChildSessionId = propChildSessionId;

    if (!resolvedChildSessionId) {
      const lookupId = childTaskId || taskId || id;
      if (lookupId && workflowChildSessions[lookupId]) {
        resolvedChildSessionId = workflowChildSessions[lookupId];
      }
    }

    // If still not found, fallback to first blocked strategy session
    if (!resolvedChildSessionId && sessions && sessionOrder) {
      for (const sessionId of sessionOrder) {
        const session = sessions[sessionId];
        if (!session) continue;

        const isBlocked =
          session.status === 'waiting' ||
          session.status === 'paused' ||
          session.messages?.some(
            (msg: any) => msg.awaitingUserAction || msg.statusData?.awaitingInput,
          );

        if (isBlocked) {
          resolvedChildSessionId = sessionId;
          break;
        }
      }
    }

    if (resolvedChildSessionId) {
      onNavigate(resolvedChildSessionId);
    }
  };

  return (
    <div className="rounded-xl p-6" style={{ backgroundColor: '#2a2a2a' }}>
      <div className="flex items-start gap-4 mb-6">
        {/* Icon with avatar overlay */}
        <div className="relative flex-shrink-0">
          <div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center border-2 border-gray-700">
            {platformIconUri ? (
              <img src={platformIconUri} alt="Platform" className="w-10 h-10 rounded-full" />
            ) : (
              <svg className="w-10 h-10 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
              </svg>
            )}
          </div>
          {tokenIconUri && (
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border-2 border-[#2a2a2a] overflow-hidden">
              <img src={tokenIconUri} alt="Token" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* Title and subtitle */}
        <div className="flex-1">
          {name && <h3 className="text-xl font-bold text-white mb-1">{name}</h3>}
          {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
        </div>
      </div>

      {/* Rewards Cards */}
      {rewards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {rewards.map((reward, idx) => (
            <div key={idx} className="rounded-lg p-4" style={{ backgroundColor: '#1a1a1a' }}>
              {reward.type === 'points' && reward.multiplier && (
                <>
                  <div className="text-3xl font-bold text-white mb-1">{reward.multiplier}x</div>
                  <div className="text-sm text-gray-400">{reward.reward}</div>
                </>
              )}
              {reward.type === 'apy' && reward.percentage !== undefined && (
                <>
                  <div className="text-3xl font-bold text-white mb-1">{reward.percentage}%</div>
                  <div className="text-sm text-gray-400">{reward.reward}</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Configure Button */}
      <Button
        onClick={handleConfigureClick}
        className="w-full text-white font-semibold hover:opacity-90"
        style={{ backgroundColor: '#7C3AED' }}
      >
        Configure strategy
      </Button>
    </div>
  );
}
