/**
 * Health Monitoring Skill
 * 
 * Provides comprehensive health factor monitoring capabilities including
 * real-time position tracking, continuous monitoring, and threshold alerts.
 */

import { defineSkill } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { getUserPositionsTool } from '../tools/getUserPositions.js';
import { getWalletBalancesTool } from '../tools/getWalletBalances.js';
import { monitorHealthTool } from '../tools/monitorHealth.js';

// Input schema for the health monitoring skill
const HealthMonitoringInputSchema = z.object({
  instruction: z.string().describe('Health monitoring instruction with user preferences - e.g., "Monitor my health factor with warning at 1.5", "Check my positions every 30 minutes", "Start continuous monitoring with notifications"'),
});

export const healthMonitoringSkill = defineSkill({
  id: 'health-monitoring',
  name: 'Health Factor Monitoring',
  description: 'Monitor Aave positions, health factors, and liquidation risks with real-time tracking and alerts',
  tags: ['defi', 'aave', 'health-factor', 'monitoring', 'liquidation-prevention'],
  examples: [
    'Monitor my health factor for liquidation risk with warning at 1.5',
    'Check my current Aave positions and health status every 30 minutes',
    'Start continuous monitoring of my positions with notifications',
    'Analyze my wallet balances for liquidation prevention, conservative approach',
    'What is my current health factor? Set alerts for danger threshold 1.2',
    'Set up alerts for my liquidation risk with 15-minute intervals',
  ],
  inputSchema: HealthMonitoringInputSchema,
  tools: [
    getUserPositionsTool,
    getWalletBalancesTool,
    monitorHealthTool,
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
