#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { discoverCentrifugePoolsTool, executeDiscoverCentrifugePools } from './tools/poolDiscovery.js';
import { getInvestmentStatusTool, executeGetInvestmentStatus } from './tools/investmentStatus.js';
import { analyzePoolDetailsTool, executeAnalyzePoolDetails } from './tools/analyzePoolDetails.js';
import { placeInvestmentOrderTool, executePlaceInvestmentOrder } from './tools/placeInvestmentOrder.js';
import { cancelInvestmentOrderTool, executeCancelInvestmentOrder } from './tools/cancelInvestmentOrder.js';
import { portfolioRebalancingTool, executePortfolioRebalancing } from './tools/portfolioRebalancing.js';
import { yieldOptimizationTool, executeYieldOptimization } from './tools/yieldOptimization.js';
// import { advancedRiskAssessmentTool, executeAdvancedRiskAssessment } from './tools/advancedRiskAssessment.js'; // REMOVED - Has code bugs
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
            // advancedRiskAssessmentTool, // REMOVED - Has code bugs
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

            // case 'advanced-risk-assessment':
            //     return await executeAdvancedRiskAssessment(args || {}); // REMOVED - Has code bugs

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
        console.error(`❌ [MCP Server] Tool ${name} failed:`, errorMessage);

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

// Start the server
async function main() {
    console.log('🚀 [Centrifuge MCP Server] Starting with StreamableHTTP transport...');

    const app = express();

    // Add JSON parsing middleware
    app.use(express.json());

    app.use(function (req: Request, _res: Response, next: NextFunction) {
        console.log(`${req.method} ${req.url}`);
        next();
    });

    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // MCP POST endpoint for StreamableHTTP
    const mcpPostHandler = async (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string;
        if (sessionId) {
            console.log(`📡 [MCP] Received request for session: ${sessionId}`);
        }

        try {
            let transport: StreamableHTTPServerTransport;
            if (sessionId && transports[sessionId]) {
                // Reuse existing transport
                transport = transports[sessionId];
            } else if (!sessionId && isInitializeRequest(req.body)) {
                // New initialization request
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sessionId) => {
                        // console.log(`✅ [MCP] Session initialized: ${sessionId}`);
                        transports[sessionId] = transport;
                    }
                });

                // Set up onclose handler to clean up transport when closed
                transport.onclose = () => {
                    const sid = transport.sessionId;
                    if (sid && transports[sid]) {
                        console.log(`🛑 [MCP] Transport closed for session ${sid}`);
                        delete transports[sid];
                    }
                };

                // Connect the transport to the MCP server
                await server.connect(transport);
                await transport.handleRequest(req, res, req.body);
                return;
            } else {
                // Invalid request
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Bad Request: No valid session ID provided',
                    },
                    id: null,
                });
                return;
            }

            // Handle the request with existing transport
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            console.error('❌ [MCP] Error handling request:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                    },
                    id: null,
                });
            }
        }
    };

    app.post('/mcp', mcpPostHandler);

    // Handle GET requests for SSE streams (backwards compatibility)
    const mcpGetHandler = async (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string;
        if (!sessionId || !transports[sessionId]) {
            res.status(400).send('Invalid or missing session ID');
            return;
        }

        console.log(`🌐 [MCP] Establishing SSE stream for session ${sessionId}`);
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
    };

    app.get('/mcp', mcpGetHandler);

    // Handle DELETE requests for session termination
    const mcpDeleteHandler = async (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string;
        if (!sessionId || !transports[sessionId]) {
            res.status(400).send('Invalid or missing session ID');
            return;
        }

        console.log(`🗑️ [MCP] Session termination for ${sessionId}`);
        try {
            const transport = transports[sessionId];
            await transport.handleRequest(req, res);
        } catch (error) {
            console.error('❌ [MCP] Error handling session termination:', error);
            if (!res.headersSent) {
                res.status(500).send('Error processing session termination');
            }
        }
    };

    app.delete('/mcp', mcpDeleteHandler);

    const PORT = 3001;
    app.listen(PORT, () => {
        // console.log('✅ [Centrifuge MCP Server] HTTP server started successfully');
        // console.log(`📡 [Centrifuge MCP Server] Listening on port ${PORT}`);
        // console.log(`🌐 [Centrifuge MCP Server] MCP endpoint: http://localhost:${PORT}/mcp`);
        // console.log('💡 [Centrifuge MCP Server] Ready for web client and MCP Inspector');
    });

    // Start stdio transport for backwards compatibility
    const stdioTransport = new StdioServerTransport();
    // console.log('🔧 [MCP] Initializing stdio transport...');
    await server.connect(stdioTransport);
    // console.log('✅ [Centrifuge MCP Server] Stdio transport connected');
    // console.log('📡 [Centrifuge MCP Server] Ready to receive stdio requests');

    // Exit when stdio is closed
    process.stdin.on('end', () => {
        // console.log('🛑 [MCP] Stdio connection closed, exiting...');
        process.exit(0);
    });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    // console.log('\n🛑 [Centrifuge MCP Server] Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    // console.log('\n🛑 [Centrifuge MCP Server] Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// Start the server
main().catch((error) => {
    console.error('❌ [Centrifuge MCP Server] Failed to start server:', error);
    process.exit(1);
});
