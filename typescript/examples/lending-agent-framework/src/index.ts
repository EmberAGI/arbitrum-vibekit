import { Agent } from 'arbitrum-vibekit-core';
import type { AgentRuntimeOptions } from 'arbitrum-vibekit-core';
import { agentConfig } from './agent.js';

const agent = Agent.create(agentConfig);

agent.start();
