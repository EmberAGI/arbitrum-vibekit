import { Star, MoreHorizontal, ChevronDown } from 'lucide-react';

export interface AgentTableItem {
  id: string;
  rank: number;
  name: string;
  creator: string;
  creatorVerified?: boolean;
  rating: number;
  weeklyIncome: number;
  apy: number;
  users: number;
  aum: number;
  points: number;
  pointsTrend?: 'up' | 'down' | 'neutral';
  avatar: string;
  avatarBg: string;
  isActive?: boolean;
}

interface AgentsTableProps {
  agents: AgentTableItem[];
  onAgentClick: (agentId: string) => void;
  onAgentAction: (agentId: string) => void;
}

export function AgentsTable({ agents, onAgentClick, onAgentAction }: AgentsTableProps) {
  return (
    <div className="rounded-xl border border-[#2a2a2a] overflow-hidden">
      <table className="agent-table">
        <thead className="bg-[#1a1a1a]">
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
  return (
    <tr className="hover:bg-[#1a1a1a] transition-colors cursor-pointer" onClick={onClick}>
      <td className="text-center">
        <span className="text-sm text-gray-500">#{agent.rank}</span>
      </td>
      <td>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
            style={{ background: agent.avatarBg }}
          >
            {agent.avatar}
          </div>
          <div>
            <div className="flex items-center gap-2">
              {agent.isActive && <span className="w-2 h-2 rounded-full bg-teal-400" />}
              <span className="font-medium text-white">{agent.name}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs text-gray-500">by</span>
              <span className="text-xs text-[#fd6731]">{agent.creator}</span>
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
        <span className="text-white">${agent.weeklyIncome.toLocaleString()}</span>
      </td>
      <td className="text-right">
        <span className="text-teal-400">{agent.apy}%</span>
      </td>
      <td className="text-right">
        <span className="text-white">{agent.users.toLocaleString()}</span>
      </td>
      <td className="text-right">
        <span className="text-white">${agent.aum.toLocaleString()}</span>
      </td>
      <td className="text-right">
        <div className="flex items-center justify-end gap-2">
          {agent.pointsTrend && (
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
          )}
          {!agent.pointsTrend && <span className="text-white">{agent.points}</span>}
        </div>
      </td>
      <td>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          className="p-1 hover:bg-[#2a2a2a] rounded transition-colors"
        >
          <MoreHorizontal className="w-4 h-4 text-gray-500" />
        </button>
      </td>
    </tr>
  );
}
