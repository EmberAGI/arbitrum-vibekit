import type { AgentConfig } from '@emberai/arbitrum-vibekit-core';
import { swappingSkill } from './skills/swapping.js';
import { documentationSkill } from './skills/documentation.js';

export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'Ember Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description:
    process.env.AGENT_DESCRIPTION ||
    'Unified multi-skill DeFi agent supporting swapping, lending, liquidity, and yield trading operations on Arbitrum',
  skills: [
    // Skills implemented so far
    swappingSkill,
    documentationSkill,
    // lendingSkill,
    // liquiditySkill,
    // yieldTradingSkill,
  ],
  url: process.env.AGENT_URL || 'localhost',
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};
