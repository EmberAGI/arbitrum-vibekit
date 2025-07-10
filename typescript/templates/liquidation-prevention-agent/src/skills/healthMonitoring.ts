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
  instruction: z.string().describe('Health monitoring instruction - e.g., "Monitor my health factor", "Check my positions", "Start continuous monitoring"'),
});

export const healthMonitoringSkill = defineSkill({
  id: 'health-monitoring',
  name: 'Health Factor Monitoring',
  description: 'Monitor Aave positions, health factors, and liquidation risks with real-time tracking and alerts',
  tags: ['defi', 'aave', 'health-factor', 'monitoring', 'liquidation-prevention'],
  examples: [
    'Monitor my health factor for liquidation risk',
    'Check my current Aave positions and health status',
    'Start continuous monitoring of my positions',
    'Analyze my wallet balances for liquidation prevention',
    'What is my current health factor?',
    'Set up alerts for my liquidation risk',
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
        EMBER_ENDPOINT: process.env.EMBER_ENDPOINT ?? 'grpc.api.emberai.xyz:50051',
      },
    },
  ],
}); 
