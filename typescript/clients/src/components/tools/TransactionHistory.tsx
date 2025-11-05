'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

interface Transaction {
    type: string;
    timestamp: string;
    token: string;
    amount: string;
    protocol?: string;
    receiptHash: string;
    delegationsUsed?: string[];
}

interface TransactionHistoryProps {
    transactions: Transaction[];
}

export function TransactionHistory({ transactions = [] }: TransactionHistoryProps) {
    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return date.toLocaleDateString();
    };

    const getTypeColor = (type: string) => {
        switch (type.toLowerCase()) {
            case 'approval':
                return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
            case 'supply liquidity':
                return 'bg-green-500/10 text-green-300 border-green-500/20';
            case 'swap':
                return 'bg-purple-500/10 text-purple-300 border-purple-500/20';
            default:
                return 'bg-gray-500/10 text-gray-300 border-gray-500/20';
        }
    };

    return (
        <Card className="bg-[#2a2a2a] border-[#323232] rounded-xl">
            <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-white">
                    Transaction History
                </CardTitle>
            </CardHeader>
            <CardContent>
                {transactions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <p className="text-sm">Chains Active</p>
                    </div>
                ) : (
                    <div className="relative">
                        <div className="space-y-3 overflow-y-auto pr-2 max-h-[250px]">
                        {transactions.map((tx, idx) => (
                            <div
                                key={idx}
                                className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg hover:bg-[#1a1a1a]/80 transition-colors"
                            >
                                <div className="flex items-center gap-3 flex-1">
                                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-400">
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge
                                                variant="secondary"
                                                className={`text-xs ${getTypeColor(tx.type)}`}
                                            >
                                                {tx.type}
                                            </Badge>
                                            {tx.protocol && (
                                                <span className="text-xs text-gray-500">
                                                    via {tx.protocol}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-white font-medium">
                                                {tx.amount} {tx.token}
                                            </span>
                                            <span className="text-gray-500">•</span>
                                            <span className="text-gray-400 text-xs">
                                                {formatTimestamp(tx.timestamp)}
                                            </span>
                                        </div>
                                        {tx.delegationsUsed && tx.delegationsUsed.length > 0 && (
                                            <div className="flex items-center gap-1 mt-1">
                                                <span className="text-xs text-gray-500">
                                                    Used: {tx.delegationsUsed.join(', ')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <a
                                    href={`https://etherscan.io/tx/${tx.receiptHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                                >
                                    <span>View</span>
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                        ))}
                        </div>
                        {/* Fade-out gradient overlay */}
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#2a2a2a] to-transparent pointer-events-none" />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

