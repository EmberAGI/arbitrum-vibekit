import type { AgentConfig } from 'arbitrum-vibekit-core';
import { healthMonitoringSkill } from './skills/healthMonitoring.js';
import { liquidationPreventionSkill } from './skills/liquidationPrevention.js';
import { positionStatusSkill } from './skills/positionStatus.js';

export const agentConfig: AgentConfig = {
    name: process.env.AGENT_NAME || 'Liquidation Prevention Agent',
    version: process.env.AGENT_VERSION || '1.0.0',
    description: process.env.AGENT_DESCRIPTION || 'Intelligent Aave liquidation prevention agent with immediate status checks, continuous monitoring, and automatic risk mitigation',
    skills: [
        positionStatusSkill,           // ✅ Immediate status checks and health factor queries
        healthMonitoringSkill,         // ✅ Continuous monitoring + automatic prevention
        liquidationPreventionSkill,    // ✅ Direct supply/repay actions
    ],
    url: process.env.AGENT_URL || 'localhost',
    capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
}; 
