'use client';

import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface MarketRelationship {
  id: string;
  type: 'IMPLIES' | 'REQUIRES' | 'MUTUAL_EXCLUSION' | 'EQUIVALENCE';
  parentMarket: {
    id: string;
    title: string;
    yesPrice: number;
  };
  childMarket: {
    id: string;
    title: string;
    yesPrice: number;
  };
  detectedAt: string;
  confidence?: 'high' | 'medium' | 'low';
  reasoning?: string;
}

interface RelationshipsTableProps {
  relationships: MarketRelationship[];
}

export function RelationshipsTable({ relationships }: RelationshipsTableProps) {
  const getRelationshipSymbol = (type: string) => {
    switch (type) {
      case 'IMPLIES':
        return '→';
      case 'REQUIRES':
        return '←';
      case 'MUTUAL_EXCLUSION':
        return '⊕';
      case 'EQUIVALENCE':
        return '↔';
      default:
        return '?';
    }
  };

  const getRelationshipColor = (type: string) => {
    switch (type) {
      case 'IMPLIES':
        return 'text-blue-400';
      case 'REQUIRES':
        return 'text-purple-400';
      case 'MUTUAL_EXCLUSION':
        return 'text-orange-400';
      case 'EQUIVALENCE':
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };

  const getConfidenceBadge = (confidence?: string) => {
    switch (confidence) {
      case 'high':
        return <span className="px-2 py-1 rounded text-xs font-semibold bg-green-600/20 text-green-400">High</span>;
      case 'medium':
        return <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-600/20 text-yellow-400">Medium</span>;
      case 'low':
        return <span className="px-2 py-1 rounded text-xs font-semibold bg-red-600/20 text-red-400">Low</span>;
      default:
        return <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-600/20 text-gray-400">Unknown</span>;
    }
  };

  const checkPriceValidity = (relationship: MarketRelationship) => {
    const { type, parentMarket, childMarket } = relationship;

    if (type === 'IMPLIES' || type === 'REQUIRES') {
      // P(parent) should be <= P(child)
      const isValid = parentMarket.yesPrice <= childMarket.yesPrice + 0.01;
      return {
        valid: isValid,
        icon: isValid ? (
          <CheckCircle className="w-4 h-4 text-green-400" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400" />
        ),
        label: isValid ? 'Valid' : 'Violation',
      };
    } else if (type === 'MUTUAL_EXCLUSION') {
      // P(A) + P(B) should be <= 1.00
      const sum = parentMarket.yesPrice + childMarket.yesPrice;
      const isValid = sum <= 1.005;
      return {
        valid: isValid,
        icon: isValid ? (
          <CheckCircle className="w-4 h-4 text-green-400" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400" />
        ),
        label: isValid ? 'Valid' : 'Violation',
      };
    } else if (type === 'EQUIVALENCE') {
      // P(A) should ≈ P(B)
      const diff = Math.abs(parentMarket.yesPrice - childMarket.yesPrice);
      const isValid = diff <= 0.05;
      return {
        valid: isValid,
        icon: isValid ? (
          <CheckCircle className="w-4 h-4 text-green-400" />
        ) : (
          <AlertCircle className="w-4 h-4 text-yellow-400" />
        ),
        label: isValid ? 'Valid' : 'Diverged',
      };
    }

    return {
      valid: true,
      icon: <CheckCircle className="w-4 h-4 text-gray-400" />,
      label: 'Unknown',
    };
  };

  if (relationships.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No market relationships detected yet. Agent will scan for logical relationships between
        markets.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#2a2a2a] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#121212] border-b border-[#2a2a2a]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-16">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Parent Market</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">Price</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide w-12">→</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Child Market</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">Price</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">Confidence</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {relationships.map((rel) => {
              const validity = checkPriceValidity(rel);
              return (
                <tr key={rel.id} className="hover:bg-[#252525] transition-colors">
                  <td className="px-4 py-3">
                    <span
                      className={`text-2xl font-bold ${getRelationshipColor(rel.type)}`}
                      title={rel.type}
                    >
                      {getRelationshipSymbol(rel.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="truncate text-sm text-white" title={rel.parentMarket.title}>
                      {rel.parentMarket.title}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-300">
                    ${rel.parentMarket.yesPrice.toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-400">→</td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="truncate text-sm text-white" title={rel.childMarket.title}>
                      {rel.childMarket.title}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-300">
                    ${rel.childMarket.yesPrice.toFixed(3)}
                  </td>
                  <td className="px-4 py-3">{getConfidenceBadge(rel.confidence)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {validity.icon}
                      <span className={`text-sm ${validity.valid ? 'text-green-400' : 'text-red-400'}`}>
                        {validity.label}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {relationships.length > 0 && (
        <div className="p-3 bg-[#121212] border-t border-[#2a2a2a] text-xs text-gray-400">
          <div className="font-semibold mb-2">Legend:</div>
          <div className="space-y-1">
            <div>
              <span className="text-blue-400 font-bold">→</span> IMPLIES: If parent happens, child
              must happen
            </div>
            <div>
              <span className="text-purple-400 font-bold">←</span> REQUIRES: Parent requires child
            </div>
            <div>
              <span className="text-orange-400 font-bold">⊕</span> MUTUAL_EXCLUSION: Both cannot
              happen
            </div>
            <div>
              <span className="text-green-400 font-bold">↔</span> EQUIVALENCE: Same event, different
              phrasing
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
