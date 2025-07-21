/**
 * Health Monitoring Skill
 * 
 * Provides comprehensive health factor monitoring with automatic liquidation prevention.
 * Continuously tracks positions and automatically executes prevention strategies when needed.
 * 
 * For immediate status checks without monitoring, use Position Status skill instead.
 */

import { defineSkill } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { monitorHealthTool } from '../tools/monitorHealth.js';

// Input schema for the health monitoring skill
const HealthMonitoringInputSchema = z.object({
  instruction: z.string().describe('Continuous monitoring instruction with automation preferences - e.g., "Monitor continuously and prevent liquidation", "Set up automatic monitoring", "Start monitoring with prevention"'),
  userAddress: z.string().describe('The wallet address to monitor and protect from liquidation'),
});

export const healthMonitoringSkill = defineSkill({
  id: 'health-monitoring',
  name: 'Health Factor Monitoring & Auto-Prevention',
  description: 'Set up continuous monitoring and automatic liquidation prevention with configurable intervals and thresholds. For one-time status checks, use position lookup instead.',
  tags: ['defi', 'aave', 'health-factor', 'monitoring', 'auto-prevention', 'continuous', 'automation'],
  examples: [
    'Monitor my position every 2 minutes and prevent liquidation if health factor goes below 1.5',
    'Start automatic liquidation prevention with default settings (15 min intervals, 1.1 threshold)',
    'Set up continuous monitoring with health factor 1.3 threshold',
    'Begin automatic monitoring and protection of my Aave positions',
    'Start monitoring every 10 minutes and prevent liquidation automatically',
    'Enable smart monitoring that executes prevention when health factor drops below 1.2',
    'Set up background monitoring with automatic liquidation prevention',
    'Begin continuous health tracking and execute prevention strategies when needed',
  ],
  inputSchema: HealthMonitoringInputSchema,
  tools: [
    monitorHealthTool,           // ✅ ONLY continuous monitoring + automatic prevention
  ],
}); 
