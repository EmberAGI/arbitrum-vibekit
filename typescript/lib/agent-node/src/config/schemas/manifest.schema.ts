import { z } from 'zod';

/**
 * Agent Manifest Schema
 * Defines skill ordering, registries, and merge policies
 */

export const MergePolicySchema = z.object({
  card: z
    .object({
      capabilities: z.enum(['union', 'intersect']).default('union'),
      toolPolicies: z.enum(['union', 'intersect']).default('intersect'),
      guardrails: z.enum(['tightest', 'loosest']).default('tightest'),
    })
    .optional(),
});

export const RegistriesConfigSchema = z.object({
  mcp: z.string().default('./mcp.json'),
  workflows: z.string().default('./workflow.json'),
});

export const AgentManifestSchema = z.object({
  version: z.number().int().positive().default(1),
  skills: z.array(z.string()).min(0),
  registries: RegistriesConfigSchema.optional(),
  merge: MergePolicySchema.optional(),
});

export type MergePolicy = z.infer<typeof MergePolicySchema>;
export type RegistriesConfig = z.infer<typeof RegistriesConfigSchema>;
export type AgentManifest = z.infer<typeof AgentManifestSchema>;
