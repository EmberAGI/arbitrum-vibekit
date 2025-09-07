/**
 * Schedule Assistant Skill
 * Helps users understand scheduling options and provides guidance
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { getScheduleGuidanceTool } from '../tools/getScheduleGuidance.js';

const ScheduleAssistantInputSchema = z.object({
  query: z.string().min(1).describe('User query about scheduling, automation, or TriggerX capabilities'),
  context: z.string().optional().describe("Additional context about the user's automation needs"),
});

export const scheduleAssistantSkill = defineSkill({
  id: 'schedule-assistant-skill',
  name: 'scheduleAssistant',
  description: 'Provides guidance and assistance with job scheduling, automation patterns, and TriggerX capabilities',

  tags: ['help', 'guidance', 'scheduling', 'automation', 'assistant'],
  examples: [
    'How do I create a time-based job?',
    'What types of triggers are available?',
    'Explain the difference between event and condition jobs',
    'What is a cron expression and how do I use it?',
    'How much does it cost to run automated jobs?',
    'Can I schedule a job to run when a specific event happens?',
  ],

  inputSchema: ScheduleAssistantInputSchema,

  tools: [getScheduleGuidanceTool],

  // Use LLM orchestration - no manual handler needed
});
