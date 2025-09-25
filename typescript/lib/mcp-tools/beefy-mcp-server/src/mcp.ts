import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  initializePublicRegistry,
  type ChainConfig,
  type EmberPlugin,
} from '@emberai/onchain-actions-registry';

// Chain configuration for Arbitrum
const ARBITRUM_CHAIN_CONFIG: ChainConfig = {
  chainId: 42161,
  name: 'Arbitrum One',
  rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
  wrappedNativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
};

export async function createServer() {
  const server = new McpServer({
    name: 'beefy-mcp-server',
    version: '1.0.0',
  });

  console.log('🥩 Initializing Beefy MCP Server...');

  // Initialize the plugin registry
  const registry = initializePublicRegistry([ARBITRUM_CHAIN_CONFIG]);

  // Load all plugins and find Beefy plugins
  const beefyPlugins: EmberPlugin<'lending'>[] = [];
  for await (const plugin of registry.getPlugins()) {
    if (plugin.name.toLowerCase().includes('beefy')) {
      beefyPlugins.push(plugin as EmberPlugin<'lending'>);
      console.log(`🥩 Found Beefy plugin: ${plugin.name} with ${plugin.actions.length} actions`);
    }
  }

  if (beefyPlugins.length === 0) {
    console.warn('⚠️ No Beefy plugins found in registry');
    return server;
  }

  // Create MCP tools for each Beefy plugin action
  for (const plugin of beefyPlugins) {
    for (const action of plugin.actions) {
      console.log(`🔧 Creating MCP tool for action: ${action.type} - ${action.name}`);

      if (action.type === 'lending-supply') {
        // Supply/Deposit tool
        const SupplySchema = z.object({
          walletAddress: z.string().describe('The wallet address to supply from'),
          tokenAddress: z.string().describe('The token contract address to supply'),
          amount: z
            .string()
            .describe('The amount to supply (in token units, e.g., "100" for 100 tokens)'),
        });

        server.tool(
          'beefy_supply',
          'Supply tokens to Beefy vaults to earn optimized yield. Deposits underlying tokens and receives mooTokens.',
          SupplySchema.shape,
          async ({ walletAddress, tokenAddress, amount }) => {
            try {
              console.log(
                `🥩 [Supply] Processing supply request: ${amount} of ${tokenAddress} from ${walletAddress}`
              );

              // Convert amount to BigInt (assuming 18 decimals for now)
              const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1e18));

              const result = await (action.callback as any)({
                walletAddress,
                supplyToken: {
                  tokenUid: {
                    chainId: ARBITRUM_CHAIN_CONFIG.chainId.toString(),
                    address: tokenAddress,
                  },
                  symbol: 'TOKEN', // We'll need to resolve this
                  name: 'Token',
                  decimals: 18,
                  isNative: false,
                  isVetted: true,
                  iconUri: null,
                },
                amount: amountBigInt,
              });

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        success: true,
                        action: 'beefy_supply',
                        transactions: result.transactions,
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            } catch (error) {
              console.error('🥩 [Supply] Error:', error);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        success: false,
                        error: `Failed to create supply transaction: ${(error as Error).message}`,
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }
          }
        );
      }

      if (action.type === 'lending-withdraw') {
        // Withdraw tool
        const WithdrawSchema = z.object({
          walletAddress: z.string().describe('The wallet address to withdraw to'),
          mooTokenAddress: z.string().describe('The mooToken contract address to withdraw'),
          amount: z.string().describe('The amount of mooTokens to withdraw (in token units)'),
        });

        server.tool(
          'beefy_withdraw',
          'Withdraw tokens from Beefy vaults. Redeems mooTokens for underlying tokens.',
          WithdrawSchema.shape,
          async ({ walletAddress, mooTokenAddress, amount }) => {
            try {
              console.log(
                `🥩 [Withdraw] Processing withdraw request: ${amount} mooTokens of ${mooTokenAddress} to ${walletAddress}`
              );

              // Convert amount to BigInt
              const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1e18));

              const result = await (action.callback as any)({
                walletAddress,
                tokenToWithdraw: {
                  tokenUid: {
                    chainId: ARBITRUM_CHAIN_CONFIG.chainId.toString(),
                    address: mooTokenAddress,
                  },
                  symbol: 'mooTOKEN',
                  name: 'Moo Token',
                  decimals: 18,
                  isNative: false,
                  isVetted: true,
                  iconUri: null,
                },
                amount: amountBigInt,
              });

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        success: true,
                        action: 'beefy_withdraw',
                        transactions: result.transactions,
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            } catch (error) {
              console.error('🥩 [Withdraw] Error:', error);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        success: false,
                        error: `Failed to create withdraw transaction: ${(error as Error).message}`,
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }
          }
        );
      }
    }

    // Note: Position queries will be added in a future version
    // The current plugin interface has some type mismatches that need to be resolved
  }

  // Add a tool to list available vaults
  const GetVaultsSchema = z.object({});

  server.tool(
    'beefy_get_vaults',
    'Get information about available Beefy vaults on Arbitrum.',
    GetVaultsSchema.shape,
    async () => {
      try {
        console.log('🥩 [Vaults] Getting available vaults...');

        const vaultInfo = [];
        for (const plugin of beefyPlugins) {
          for (const action of plugin.actions) {
            const inputTokens = await action.inputTokens();
            const outputTokens = (await action.outputTokens?.()) || [];

            vaultInfo.push({
              actionType: action.type,
              actionName: action.name,
              inputTokens,
              outputTokens,
            });
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  action: 'beefy_get_vaults',
                  vaults: vaultInfo,
                  chainId: ARBITRUM_CHAIN_CONFIG.chainId,
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        console.error('🥩 [Vaults] Error:', error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: `Failed to get vaults: ${(error as Error).message}`,
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  console.log(`🥩 Beefy MCP Server initialized with ${beefyPlugins.length} plugins`);
  return server;
}
