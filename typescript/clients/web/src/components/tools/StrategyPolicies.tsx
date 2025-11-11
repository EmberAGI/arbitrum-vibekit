'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Policy {
    delegationId: string;
    name: string;
    assets?: string[];
    amount?: string;
    protocols?: string[];
}

interface StrategyPoliciesProps {
    policies: Policy[];
}

export function StrategyPolicies({ policies = [] }: StrategyPoliciesProps) {
    const [expandedPolicies, setExpandedPolicies] = useState<Set<number>>(new Set());

    const togglePolicy = (index: number) => {
        setExpandedPolicies(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    return (
        <Card className="bg-[#2a2a2a] border-[#323232] rounded-xl">
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold text-white">
                    Policies
                </CardTitle>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                >
                    Revoke All
                </Button>
            </CardHeader>
            <CardContent className="space-y-2">
                {policies.map((policy, idx) => {
                    const isExpanded = expandedPolicies.has(idx);

                    return (
                        <div
                            key={idx}
                            className="bg-[#1a1a1a] rounded-lg overflow-hidden"
                        >
                            <div
                                className="cursor-pointer p-4 hover:bg-[#0a0a0a]/50 transition-colors"
                                onClick={() => togglePolicy(idx)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-400 flex-shrink-0">
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-medium text-white">
                                            {policy.name}
                                        </h4>
                                        {!isExpanded && (
                                            <div className="flex items-center gap-2 mt-1">
                                                {policy.assets && policy.assets.length > 0 && (
                                                    <span className="text-xs text-gray-500">
                                                        {policy.assets.join(', ')}
                                                    </span>
                                                )}
                                                {policy.protocols && policy.protocols.length > 0 && (
                                                    <>
                                                        <span className="text-gray-700">•</span>
                                                        <span className="text-xs text-gray-500">
                                                            {policy.protocols.join(', ')}
                                                        </span>
                                                    </>
                                                )}
                                                {policy.amount && (
                                                    <>
                                                        <span className="text-gray-700">•</span>
                                                        <span className="text-xs text-gray-400">
                                                            ${policy.amount}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <button className="text-gray-400 hover:text-gray-300 flex-shrink-0">
                                        {isExpanded ? (
                                            <ChevronDown className="w-5 h-5" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="px-4 pb-4 pt-2 border-t border-gray-800/30 bg-[#0a0a0a]/30">
                                    <div className="space-y-3">
                                        {policy.assets && policy.assets.length > 0 && (
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">Assets</p>
                                                <p className="text-sm text-white">
                                                    {policy.assets.join(', ')}
                                                </p>
                                            </div>
                                        )}
                                        {policy.protocols && policy.protocols.length > 0 && (
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">Protocols</p>
                                                <p className="text-sm text-white">
                                                    {policy.protocols.join(', ')}
                                                </p>
                                            </div>
                                        )}
                                        {policy.amount && (
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">Amount</p>
                                                <p className="text-sm text-white">
                                                    ${policy.amount}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}

