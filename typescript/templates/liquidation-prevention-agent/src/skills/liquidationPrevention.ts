/**
 * Liquidation Prevention Skill
 * 
 * Provides intelligent liquidation prevention capabilities including
 * automatic strategy selection, collateral supply, debt repayment, and combined approaches.
 */

import { defineSkill } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { supplyCollateralTool } from '../tools/supplyCollateral.js';
import { repayDebtTool } from '../tools/repayDebt.js';
import { intelligentPreventionStrategyTool } from '../tools/intelligentPreventionStrategy.js';

// Input schema for the liquidation prevention skill
const LiquidationPreventionInputSchema = z.object({
  instruction: z.string().describe('Liquidation prevention instruction with user preferences - e.g., "Prevent liquidation with health factor 1.2, monitor every 15 minutes", "Supply more collateral with max $1000, conservative approach"'),
});

export const liquidationPreventionSkill = defineSkill({
  id: 'liquidation-prevention',
  name: 'Liquidation Prevention',
  description: 'Automatically prevent liquidations through intelligent strategy selection and execution including collateral supply, debt repayment, and combined approaches',
  tags: ['defi', 'aave', 'liquidation-prevention', 'automatic', 'strategy'],
  examples: [
    'Prevent my liquidation automatically with health factor 1.2',
    'Execute intelligent liquidation prevention strategy with conservative approach',
    'Supply collateral to improve my health factor, max $1000',
    'Repay debt to avoid liquidation, monitor every 15 minutes',
    'Choose the best strategy to prevent liquidation with 1.5% slippage',
    'Automatically manage my position to maintain health factor above 1.1, gas optimized',
    'Execute combined supply and repay strategy with moderate risk tolerance',
    'Analyze and execute optimal liquidation prevention with notifications enabled',
  ],
  inputSchema: LiquidationPreventionInputSchema,
  tools: [
    intelligentPreventionStrategyTool,
    supplyCollateralTool,
    repayDebtTool,
  ],
  // MCP servers this skill needs
  mcpServers: [
    {
      command: 'node',
      moduleName: 'ember-mcp-tool-server',
      env: {
        EMBER_ENDPOINT: process.env.EMBER_ENDPOINT ?? 'http://api.emberai.xyz/mcp',
      },
    },
  ],
}); 
