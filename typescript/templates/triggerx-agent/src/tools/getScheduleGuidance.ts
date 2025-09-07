/**
 * Get Schedule Guidance Tool
 * Provides scheduling guidance and help
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask } from 'arbitrum-vibekit-core';
import type { TriggerXContext } from '../context/types.js';

const GetScheduleGuidanceInputSchema = z.object({
  query: z.string().min(1).describe('User query about scheduling, automation, or TriggerX capabilities'),
  context: z.string().optional().describe("Additional context about the user's automation needs"),
});

export const getScheduleGuidanceTool: VibkitToolDefinition<
  typeof GetScheduleGuidanceInputSchema,
  any,
  TriggerXContext,
  any
> = {
  name: 'getScheduleGuidance',
  description: 'Get guidance and help with TriggerX automation and scheduling',
  parameters: GetScheduleGuidanceInputSchema,
  execute: async (input, context) => {
    const { query, context: userContext } = input;

    // Provide comprehensive guidance based on common scheduling scenarios
    const guidance = `
Based on your query "${query}", here's what you need to know about TriggerX automation:

## Available Job Types

### 1. Time-based Jobs
- **Interval**: Repeat every X seconds/minutes/hours
- **Cron**: Use cron expressions for complex scheduling (e.g., "0 9 * * 1-5" for weekdays at 9 AM)
- **Specific**: One-time execution at a specific datetime

### 2. Event-based Jobs
- Monitor smart contract events on any EVM chain
- Automatically execute when events are emitted
- Perfect for responding to on-chain activities

### 3. Condition-based Jobs
- Execute when API values meet conditions (greater/less than, equal)
- Monitor external data sources
- Ideal for price alerts or threshold-based automation

## Cost Structure
- Time jobs: ~0.1 ETH per execution
- Event jobs: ~0.2 ETH per execution  
- Condition jobs: ~0.3 ETH per execution

## Best Practices
1. Use recurring jobs for ongoing automation
2. Set appropriate timeframes (default: 36 hours)
3. Consider gas costs on target chains
4. Use dynamic arguments for complex scenarios

${userContext ? `\nFor your specific use case: ${userContext}` : ''}

Would you like me to help you create a specific type of job or need more details about any aspect?
`;

    const result = {
      guidance,
      timestamp: new Date().toISOString(),
      supportedChains: ['421614'], 
      recommendedActions: [
        'Start with a simple time-based job',
        'Test with small amounts first',
        'Monitor job execution status',
        'Consider dynamic arguments for flexibility',
      ],
    };

    return createSuccessTask('getScheduleGuidance', undefined, 'Schedule guidance provided');
  },
};
