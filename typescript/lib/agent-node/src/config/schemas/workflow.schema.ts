import { z } from 'zod';

/**
 * Workflow Registry Schema
 * Explicit allowlist of workflow plugins
 */

export const WorkflowEntrySchema = z.object({
  id: z.string(),
  from: z.string(),
  enabled: z.boolean().optional().default(true),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const WorkflowRegistrySchema = z.object({
  workflows: z.array(WorkflowEntrySchema).optional().default([]),
});

export type WorkflowEntry = z.infer<typeof WorkflowEntrySchema>;
export type WorkflowRegistry = z.infer<typeof WorkflowRegistrySchema>;
