/* eslint-disable @next/next/no-img-element */

import { Star, MoreHorizontal, ChevronDown } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';
import { proxyIconUri } from '../../utils/iconResolution';

export interface AgentTableItem {
  id: string;
  rank: number;
  name: string;
  creator: string;
  creatorVerified?: boolean;
  rating: number;
  weeklyIncome?: number;
  apy?: number;
  users?: number;
  aum?: number;
  points?: number;
  pointsTrend?: 'up' | 'down' | 'neutral';
  iconUri: string | null;
  isActive?: boolean;
  isLoaded: boolean;
}

interface AgentsTableProps {
  agents: AgentTableItem[];
  onAgentClick: (agentId: string) => void;
  onAgentAction: (agentId: string) => void;
  iconsLoaded: boolean;
}

export function AgentsTable({ agents, onAgentClick, onAgentAction, iconsLoaded }: AgentsTableProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <table className="agent-table">
        <thead className="bg-black/20">
          <tr>
            <th className="w-12"></th>
            <th></th>
            <th className="text-right cursor-pointer hover:text-white transition-colors">
              <div className="flex items-center justify-end gap-1">
                7d Income
                <ChevronDown className="w-3 h-3" />
              </div>
            </th>
            <th className="text-right">APY</th>
            <th className="text-right">Users</th>
            <th className="text-right">AUM</th>
            <th className="text-right">Points</th>
            <th className="w-12"></th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              iconsLoaded={iconsLoaded}
              onClick={() => onAgentClick(agent.id)}
              onAction={() => onAgentAction(agent.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface AgentRowProps {
  agent: AgentTableItem;
  iconsLoaded: boolean;
  onClick: () => void;
  onAction: () => void;
}

function AgentRow({ agent, iconsLoaded, onClick, onAction }: AgentRowProps) {
  return (
    <tr className="hover:bg-white/5 transition-colors cursor-pointer" onClick={onClick}>
      <td className="text-center">
        <span className="text-sm text-gray-500">#{agent.rank}</span>
      </td>
      <td>
        <div className="flex items-center gap-3">
          {!iconsLoaded ? (
            <Skeleton className="h-12 w-12 rounded-full" />
          ) : (
            <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden bg-black/30 ring-1 ring-white/10">
              {agent.iconUri ? (
                <img
                  src={proxyIconUri(agent.iconUri)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              {agent.isActive && <span className="w-2 h-2 rounded-full bg-teal-400" />}
              <span className="font-medium text-white">{agent.name}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs text-gray-500">by</span>
              <span className="text-xs text-[color:var(--hire-accent)]">{agent.creator}</span>
              {agent.creatorVerified && <span className="text-xs text-blue-400">✓</span>}
            </div>
          </div>
          <div className="star-rating ml-2">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-3 h-3 ${
                  i < Math.floor(agent.rating)
                    ? 'star fill-yellow-400 text-yellow-400'
                    : 'star-empty'
                }`}
              />
            ))}
          </div>
        </div>
      </td>
      <td className="text-right">
        {!agent.isLoaded ? (
          <div className="flex justify-end">
            <Skeleton className="h-5 w-16" />
          </div>
        ) : agent.weeklyIncome !== undefined ? (
            <span className="text-white">${agent.weeklyIncome.toLocaleString()}</span>
          ) : (
            <span className="text-gray-500">-</span>
          )}
      </td>
      <td className="text-right">
        {!agent.isLoaded ? (
          <div className="flex justify-end">
            <Skeleton className="h-5 w-12" />
          </div>
        ) : agent.apy !== undefined ? (
            <span className="text-teal-400">{agent.apy}%</span>
          ) : (
            <span className="text-gray-500">-</span>
          )}
      </td>
      <td className="text-right">
        {!agent.isLoaded ? (
          <div className="flex justify-end">
            <Skeleton className="h-5 w-12" />
          </div>
        ) : agent.users !== undefined ? (
            <span className="text-white">{agent.users.toLocaleString()}</span>
          ) : (
            <span className="text-gray-500">-</span>
          )}
      </td>
      <td className="text-right">
        {!agent.isLoaded ? (
          <div className="flex justify-end">
            <Skeleton className="h-5 w-16" />
          </div>
        ) : agent.aum !== undefined ? (
            <span className="text-white">${agent.aum.toLocaleString()}</span>
          ) : (
            <span className="text-gray-500">-</span>
          )}
      </td>
      <td className="text-right">
        <div className="flex items-center justify-end gap-2">
          {!agent.isLoaded ? (
            <Skeleton className="h-5 w-10" />
          ) : agent.pointsTrend && agent.points !== undefined ? (
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                agent.pointsTrend === 'up'
                  ? 'bg-teal-500/20 text-teal-400'
                  : agent.pointsTrend === 'down'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {agent.points}x
            </span>
          ) : agent.points !== undefined ? (
            <span className="text-white">{agent.points}</span>
          ) : (
            <span className="text-gray-500">-</span>
          )}
        </div>
      </td>
      <td>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <MoreHorizontal className="w-4 h-4 text-gray-500" />
        </button>
      </td>
    </tr>
  );
}
