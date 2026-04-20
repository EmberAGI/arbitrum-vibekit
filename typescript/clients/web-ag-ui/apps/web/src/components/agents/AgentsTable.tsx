/* eslint-disable @next/next/no-img-element */

import { Star, MoreHorizontal, ChevronDown } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Skeleton } from '../ui/Skeleton';
import { iconMonogram, proxyIconUri } from '../../utils/iconResolution';
import { CreatorIdentity } from '../ui/CreatorIdentity';
import { AgentSurfaceTag } from '../ui/AgentSurfaceTag';

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
  avatarBg?: string;
  rowBg?: string;
  rowHoverBg?: string;
  surfaceTag?: 'Swarm' | 'Workflow';
  usesBrandedImage?: boolean;
  isActive?: boolean;
  isLoaded: boolean;
}

interface AgentsTableProps {
  agents: AgentTableItem[];
  onAgentClick: (agentId: string) => void;
  onAgentAction: (agentId: string) => void;
}

export function AgentsTable({ agents, onAgentClick, onAgentAction }: AgentsTableProps) {
  return (
    <div className="rounded-2xl border border-[#E3D2BF] bg-[#FFF8F0] overflow-hidden">
      <table className="agent-table text-sm">
        <thead className="bg-[#F0E2D2]">
          <tr>
            <th className="w-12"></th>
            <th></th>
            <th className="text-right cursor-pointer hover:text-[color:var(--hire-accent)] transition-colors">
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
  onClick: () => void;
  onAction: () => void;
}

function AgentRow({ agent, onClick, onAction }: AgentRowProps) {
  const rowStyle = agent.rowBg
    ? ({
        '--agent-row-bg': agent.rowBg,
        '--agent-row-hover-bg': agent.rowHoverBg ?? agent.rowBg,
      } as CSSProperties)
    : undefined;

  return (
    <tr
      className="bg-[color:var(--agent-row-bg,transparent)] hover:bg-[color:var(--agent-row-hover-bg,rgba(244,230,216,0.72))] transition-colors cursor-pointer"
      onClick={onClick}
      style={rowStyle}
    >
      <td className="text-center">
        <span className="text-xs text-[#A98C74]">#{agent.rank}</span>
      </td>
      <td>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-[#E3D2BF]">
            <div
              className="h-full w-full flex items-center justify-center bg-[#F6ECDD]"
              style={
                agent.usesBrandedImage && agent.avatarBg
                  ? { background: agent.avatarBg }
                  : undefined
              }
            >
              {agent.iconUri ? (
                <img
                  src={proxyIconUri(agent.iconUri)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-contain p-[2px]"
                />
              ) : (
                <span className="text-xs font-semibold text-[#5C4334]" aria-hidden="true">
                  {iconMonogram(agent.name)}
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              {agent.isActive && <span className="w-2 h-2 rounded-full bg-teal-400" />}
              <span className="font-medium text-[#241813] text-[15px] leading-5">{agent.name}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[12px] text-[#A98C74]">by</span>
              <CreatorIdentity
                name={agent.creator}
                verified={agent.creatorVerified}
                size="sm"
                nameClassName="text-[12px] text-[#6F5A4C]"
              />
            </div>
            {agent.surfaceTag ? <AgentSurfaceTag tag={agent.surfaceTag} className="mt-1.5" /> : null}
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
            <span className="text-[#241813]">${agent.weeklyIncome.toLocaleString()}</span>
          ) : (
            <span className="text-[#A98C74]">-</span>
          )}
      </td>
      <td className="text-right">
        {!agent.isLoaded ? (
          <div className="flex justify-end">
            <Skeleton className="h-5 w-12" />
          </div>
        ) : agent.apy !== undefined ? (
            <span className="text-[#4E7A58]">{agent.apy}%</span>
          ) : (
            <span className="text-[#A98C74]">-</span>
          )}
      </td>
      <td className="text-right">
        {!agent.isLoaded ? (
          <div className="flex justify-end">
            <Skeleton className="h-5 w-12" />
          </div>
        ) : agent.users !== undefined ? (
            <span className="text-[#241813]">{agent.users.toLocaleString()}</span>
          ) : (
            <span className="text-[#A98C74]">-</span>
          )}
      </td>
      <td className="text-right">
        {!agent.isLoaded ? (
          <div className="flex justify-end">
            <Skeleton className="h-5 w-16" />
          </div>
        ) : agent.aum !== undefined ? (
            <span className="text-[#241813]">${agent.aum.toLocaleString()}</span>
          ) : (
            <span className="text-[#A98C74]">-</span>
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
                  ? 'bg-[#E6F1E8] text-[#4E7A58]'
                  : agent.pointsTrend === 'down'
                    ? 'bg-[#FCE6E4] text-[#B84C38]'
                    : 'bg-[#EFE4D7] text-[#8A6F58]'
              }`}
            >
              {agent.points}x
            </span>
          ) : agent.points !== undefined ? (
            <span className="text-[#241813]">{agent.points}</span>
          ) : (
            <span className="text-[#A98C74]">-</span>
          )}
        </div>
      </td>
      <td>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          className="p-1 hover:bg-[#F0E2D2] rounded transition-colors"
        >
          <MoreHorizontal className="w-4 h-4 text-[#A98C74]" />
        </button>
      </td>
    </tr>
  );
}
