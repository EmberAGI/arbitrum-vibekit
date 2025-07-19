/**
 * Health Monitoring Skill
 * 
 * Provides comprehensive health factor monitoring with automatic liquidation prevention.
 * Continuously tracks positions and automatically executes prevention strategies when needed.
 */

import { defineSkill } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { getUserPositionsTool } from '../tools/getUserPositions.js';
import { getWalletBalancesTool } from '../tools/getWalletBalances.js';
import { monitorHealthTool } from '../tools/monitorHealth.js';

// Input schema for the health monitoring skill
const HealthMonitoringInputSchema = z.object({
  instruction: z.string().describe('Health monitoring instruction with user preferences - e.g., "Monitor my position every 2 minutes and prevent liquidation if health factor goes below 1.5", "Prevent my liquidation automatically", "Set up automatic monitoring and prevention"'),
  userAddress: z.string().describe('The wallet address to monitor and protect from liquidation'),
});

export const healthMonitoringSkill = defineSkill({
  id: 'health-monitoring',
  name: 'Health Factor Monitoring & Auto-Prevention',
  description: 'Monitor Aave positions continuously and automatically prevent liquidations through intelligent strategy execution',
  tags: ['defi', 'aave', 'health-factor', 'monitoring', 'auto-prevention', 'liquidation-prevention'],
  examples: [
    'Monitor my position every 2 minutes and prevent liquidation if health factor goes below 1.5',
    'Prevent my liquidation automatically with default monitoring (15 min intervals, 1.1 threshold)',
    'Set up automatic liquidation prevention with health factor 1.3 threshold',
    'Monitor and protect my Aave positions with continuous prevention',
    'Automatically prevent liquidation by monitoring every 10 minutes',
    'Set up smart monitoring that prevents liquidation when health factor drops below 1.2',
    'Check my positions and automatically prevent liquidation if needed',
    'Monitor my wallet and execute prevention strategies when liquidation risk is detected',
  ],
  inputSchema: HealthMonitoringInputSchema,
  tools: [
    getUserPositionsTool,
    getWalletBalancesTool,
    monitorHealthTool,
  ],
}); 
