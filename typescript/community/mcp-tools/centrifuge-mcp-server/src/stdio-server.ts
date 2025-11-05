#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { discoverCentrifugePoolsTool, executeDiscoverCentrifugePools } from './tools/poolDiscovery.js';
import { getInvestmentStatusTool, executeGetInvestmentStatus } from './tools/investmentStatus.js';
import { analyzePoolDetailsTool, executeAnalyzePoolDetails } from './tools/analyzePoolDetails.js';
import { placeInvestmentOrderTool, executePlaceInvestmentOrder } from './tools/placeInvestmentOrder.js';
import { cancelInvestmentOrderTool, executeCancelInvestmentOrder } from './tools/cancelInvestmentOrder.js';
import { portfolioRebalancingTool, executePortfolioRebalancing } from './tools/portfolioRebalancing.js';
import { yieldOptimizationTool, executeYieldOptimization } from './tools/yieldOptimization.js';
import { advancedRiskAssessmentTool, executeAdvancedRiskAssessment } from './tools/advancedRiskAssessment.js';
import { transactionHistoryTool, executeTransactionHistory } from './tools/transactionHistory.js';
import { investmentPerformanceTrackingTool, executeInvestmentPerformanceTracking } from './tools/investmentPerformanceTracking.js';
import { automatedRebalancingExecutionTool, executeAutomatedRebalancingExecution } from './tools/automatedRebalancingExecution.js';
import { riskAlertSystemTool, executeRiskAlertSystem } from './tools/riskAlertSystem.js';
import { yieldComparisonTool, executeYieldComparisonTool } from './tools/yieldComparisonTool.js';

// Create MCP server
const server = new Server(
    {
        name: 'centrifuge-mcp-server',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            discoverCentrifugePoolsTool,
            getInvestmentStatusTool,
            analyzePoolDetailsTool,
            placeInvestmentOrderTool,
            cancelInvestmentOrderTool,
            portfolioRebalancingTool,
            yieldOptimizationTool,
            advancedRiskAssessmentTool,
            transactionHistoryTool,
            investmentPerformanceTrackingTool,
            automatedRebalancingExecutionTool,
            riskAlertSystemTool,
            yieldComparisonTool,
        ],
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'discover-centrifuge-pools':
                return await executeDiscoverCentrifugePools(args || {});

            case 'get-investment-status':
                return await executeGetInvestmentStatus(args || {});

            case 'analyze-pool-details':
                return await executeAnalyzePoolDetails(args || {});

            case 'place-investment-order':
                return await executePlaceInvestmentOrder(args || {});

            case 'cancel-investment-order':
                return await executeCancelInvestmentOrder(args || {});

            case 'portfolio-rebalancing':
                return await executePortfolioRebalancing(args || {});

            case 'yield-optimization':
                return await executeYieldOptimization(args || {});

            case 'advanced-risk-assessment':
                return await executeAdvancedRiskAssessment(args || {});

            case 'transaction-history':
                return await executeTransactionHistory(args || {});

            case 'investment-performance-tracking':
                return await executeInvestmentPerformanceTracking(args || {});

            case 'automated-rebalancing-execution':
                return await executeAutomatedRebalancingExecution(args || {});

            case 'risk-alert-system':
                return await executeRiskAlertSystem(args || {});

            case 'yield-comparison-tool':
                return await executeYieldComparisonTool(args || {});

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return {
            content: [
                {
                    type: 'text',
                    text: `❌ **Tool execution failed:** ${errorMessage}\n\n**Tool:** ${name}\n**Timestamp:** ${new Date().toISOString()}`,
                },
            ],
        };
    }
});

// Start the server with stdio transport only
async function main() {
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);

    // Exit when stdio is closed
    process.stdin.on('end', () => {
        process.exit(0);
    });
}

// Start the server
main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
