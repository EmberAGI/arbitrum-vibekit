import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createPregenWalletTool } from './tools/createPregenWallet.js';
import { listPregenWalletsTool } from './tools/listPregenWallets.js';
import { claimPregenWalletTool } from './tools/claimPregenWallet.js';
import { requestFaucetTool } from './tools/requestFaucet.js';
import { transferEthTool } from './tools/transferEth.js';
import { checkBalanceTool } from './tools/checkBalance.js';


export async function createServer() {
    const server = new McpServer({
        name: 'para-mcp-server',
        version: '1.0.0'
    });

    //
    // Tool definitions
    //

    server.tool(
        'create_pregen_wallet',
        createPregenWalletTool.parameters.shape,
        async (args: unknown) => {
            try {
                const result = await createPregenWalletTool.execute(args as any, { custom: {} });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error (create_pregen_wallet):', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: 'ExecutionError',
                                message: `Failed to create pregenerated wallet: ${(error as Error).message}`
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    server.tool(
        'list_pregen_wallets',
        listPregenWalletsTool.parameters.shape,
        async (args: unknown) => {
            try {
                const result = await listPregenWalletsTool.execute({} as any, { custom: {} });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error (list_pregen_wallets):', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: 'ExecutionError',
                                message: `Failed to list pregenerated wallets: ${(error as Error).message}`
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    server.tool(
        'claim_pregen_wallet',
        claimPregenWalletTool.parameters.shape,
        async (args: unknown) => {
            try {
                const result = await claimPregenWalletTool.execute(args as any, { custom: {} });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error (claim_pregen_wallet):', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: 'ExecutionError',
                                message: `Failed to claim pregenerated wallet: ${(error as Error).message}`
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    server.tool(
        'request_faucet',
        requestFaucetTool.parameters.shape,
        async (args: unknown) => {
            try {
                const result = await requestFaucetTool.execute(args as any, { custom: {} });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error (request_faucet):', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: 'ExecutionError',
                                message: `Failed to request faucet: ${(error as Error).message}`
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    server.tool(
        'transfer_eth',
        transferEthTool.parameters.shape,
        async (args: unknown) => {
            try {
                const result = await transferEthTool.execute(args as any, { custom: {} });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error (transfer_eth):', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: 'ExecutionError',
                                message: `Failed to transfer ETH: ${(error as Error).message}`
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    server.tool(
        'check_balance',
        checkBalanceTool.parameters.shape,
        async (args: unknown) => {
            try {
                const result = await checkBalanceTool.execute(args as any, { custom: {} });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('MCP server error (check_balance):', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: 'ExecutionError',
                                message: `Failed to check balance: ${(error as Error).message}`
                            }, null, 2),
                        },
                    ],
                };
            }
        },
    );

    

    return server;
}