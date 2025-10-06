import dotenv from 'dotenv';
import { tools, type BridgeResponse, type SupportedChainId, type ToolFunction } from './simple-tools.js';

dotenv.config();

// Export the tools object as the main interface
export { tools };

// Export individual tool functions for direct access
export {
  bridgeEthToArbitrum,
  bridgeEthFromArbitrum,
  bridgeErc20ToArbitrum,
  bridgeErc20FromArbitrum,
  getBridgeStatus,
  estimateBridgeGas,
  listAvailableRoutes,
  processBridgeIntent
} from './simple-tools.js';

// Export types
export type {
  BridgeResponse,
  SupportedChainId,
  ToolFunction
} from './simple-tools.js';

// CLI interface for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Arbitrum Bridge Tools - EmberAGI Compatible');
  console.log('');
  console.log('Available tools:');
  Object.keys(tools).forEach((toolName, index) => {
    console.log(`  ${index + 1}. ${toolName}: ${(tools as any)[toolName].description}`);
  });
  console.log('');
  console.log('Usage:');
  console.log('  import { tools } from "./index.js";');
  console.log('  const result = await tools.bridgeEthToArbitrum.execute({ ... });');
  console.log('');
  console.log('Environment variables required:');
  console.log('  ARBITRUM_RPC_URL - Arbitrum RPC endpoint');
  console.log('  ETHEREUM_RPC_URL - Ethereum RPC endpoint (optional)');
}