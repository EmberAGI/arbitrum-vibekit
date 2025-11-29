/**
 * Liquidation Prevention Skill
 *
 * Provides direct liquidation prevention actions including
 * collateral supply and debt repayment for immediate execution.
 *
 * Note: For continuous monitoring and automatic prevention, use the Health Monitoring skill.
 */

import { defineSkill } from '@emberai/arbitrum-vibekit-core';
import { z } from 'zod';
import { supplyCollateralTool } from '../tools/supplyCollateral.js';
import { repayDebtTool } from '../tools/repayDebt.js';

// Input schema for the liquidation prevention skill
const LiquidationPreventionInputSchema = z.object({
  instruction: z.string().describe('Direct liquidation prevention instruction - e.g., "Supply 100 USDC as collateral", "Repay 50 DAI debt", "Supply more collateral with max $1000"'),
  userAddress: z.string().describe('The wallet address to manage and protect from liquidation'),
});

export const liquidationPreventionSkill = defineSkill({
  id: 'liquidation-prevention',
  name: 'Liquidation Prevention',
  description: 'Execute direct liquidation prevention actions including collateral supply and debt repayment for immediate risk mitigation',
  tags: ['defi', 'aave', 'liquidation-prevention', 'supply', 'repay'],
  examples: [
    'Supply 100 USDC as collateral to improve my health factor',
    'Repay 50 DAI debt to reduce liquidation risk',
    'Supply more ETH collateral with max $1000',
    'Repay all available USDT debt',
    'Supply half of my WETH balance as collateral',
    'Repay 25% of my borrowed tokens',
    'Supply this amount of tokens to strengthen my position',
    'Execute immediate debt repayment to prevent liquidation',
  ],
  inputSchema: LiquidationPreventionInputSchema,
  tools: [
    supplyCollateralTool,
    repayDebtTool,
  ],
});
