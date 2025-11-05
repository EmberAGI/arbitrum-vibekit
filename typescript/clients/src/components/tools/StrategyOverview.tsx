'use client';

import React from 'react';
import { StrategyDashboard } from './StrategyDashboard';
import { TransactionHistory } from './TransactionHistory';
import { StrategySettings } from './StrategySettings';
import { StrategyPolicies } from './StrategyPolicies';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

interface StrategyOverviewProps {
    artifacts: Record<string, any>;
    onToggleView?: () => void;
}

export function StrategyOverview({ artifacts, onToggleView }: StrategyOverviewProps) {
    // Extract data from artifacts
    const dashboardData = artifacts?.['strategy-dashboard-display']?.output || artifacts?.['strategy-dashboard-display']?.input;
    const transactionsArtifact = artifacts?.['transaction-history-display'];
    const settingsArtifact = artifacts?.['strategy-settings-display'];
    const policiesArtifact = artifacts?.['strategy-policies-display'];

    // Extract transactions (may be array due to streaming)
    let transactions: any[] = [];
    if (transactionsArtifact) {
        const data = transactionsArtifact.output || transactionsArtifact.input;
        if (Array.isArray(data)) {
            transactions = data;
        } else if (data && typeof data === 'object') {
            transactions = [data];
        }
    }

    // Extract settings (array of setting items)
    let settings: any[] = [];
    if (settingsArtifact) {
        const data = settingsArtifact.output || settingsArtifact.input;
        if (Array.isArray(data)) {
            settings = data;
        } else if (data && typeof data === 'object') {
            settings = [data];
        }
    }

    // Extract policies (array of policy items)
    let policies: any[] = [];
    if (policiesArtifact) {
        const data = policiesArtifact.output || policiesArtifact.input;
        if (Array.isArray(data)) {
            policies = data;
        } else if (data && typeof data === 'object') {
            policies = [data];
        }
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Toggle Button */}
            {onToggleView && (
                <div className="flex-shrink-0 px-8 pt-6 pb-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onToggleView}
                        className="text-gray-400 hover:text-gray-300 hover:bg-gray-800/50"
                    >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        View Chat History
                    </Button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-8 py-6">
                <div className="max-w-7xl mx-auto space-y-6">
                    {dashboardData && (
                        <StrategyDashboard {...dashboardData} />
                    )}

                    <TransactionHistory transactions={transactions} />

                    <StrategySettings settings={settings} />

                    <StrategyPolicies policies={policies} />
                </div>
            </div>
        </div>
    );
}

