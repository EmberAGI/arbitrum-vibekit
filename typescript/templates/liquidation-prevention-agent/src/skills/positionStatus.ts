/**
 * Position Status Skill
 * 
 * Provides immediate position status checks and health factor queries.
 * Returns current information without setting up monitoring or automation.
 * 
 * For continuous monitoring and automatic prevention, use Health Monitoring skill.
 */

import { defineSkill } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { getUserPositionsTool } from '../tools/getUserPositions.js';
import { getWalletBalancesTool } from '../tools/getWalletBalances.js';

// Input schema for the position status skill
const PositionStatusInputSchema = z.object({
  instruction: z.string().describe('Immediate status check instruction - e.g., "Check my health factor", "Show my current positions", "What is my liquidation risk"'),
  userAddress: z.string().describe('The wallet address to check positions and health factor'),
});

export const positionStatusSkill = defineSkill({
  id: 'position-status',
  name: 'Position Status & Health Check',
  description: 'Get immediate status of Aave positions and current health factor without monitoring or automation',
  tags: ['defi', 'aave', 'health-factor', 'status', 'positions', 'immediate', 'check'],
  examples: [
    'Check my liquidation risk and health factor',
    'Show my current Aave positions',
    'What is my health factor right now?',
    'Display my current lending positions and risk level',
    'Check my position status and liquidation risk',
    'Show me my current health factor and position details',
    'Get my current Aave position information',
    'What are my current positions and how safe am I from liquidation?',
  ],
  inputSchema: PositionStatusInputSchema,
  tools: [
    getUserPositionsTool,        // ✅ Immediate position lookup and health status
    getWalletBalancesTool,       // ✅ Current wallet balance information
  ],
}); 
