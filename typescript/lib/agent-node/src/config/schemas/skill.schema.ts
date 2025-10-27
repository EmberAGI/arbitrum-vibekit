import { z } from 'zod';

import {
  AgentCapabilitiesSchema,
  GuardrailConfigSchema,
  ToolPolicyListSchema,
} from './agent.schema.js';
import type { AgentCapabilities, GuardrailConfig, ToolPolicyList } from './agent.schema.js';

/**
 * Skill Schema
 * A2A fragment with sub-prompt, MCP/workflow selections, and optional overrides
 */

export const SkillMCPServerSelectionSchema = z.object({
  name: z.string(),
  allowedTools: z.array(z.string()).optional(),
});

export const SkillWorkflowOverrideSchema = z.record(
  z.string(),
  z.object({
    config: z.record(z.string(), z.unknown()).optional(),
    enabled: z.boolean().optional(),
  }),
);

export const SkillWorkflowsConfigSchema = z.object({
  include: z.array(z.string()).optional().default([]),
  overrides: SkillWorkflowOverrideSchema.optional(),
});

export const SkillMCPConfigSchema = z.object({
  servers: z.array(SkillMCPServerSelectionSchema).optional().default([]),
});

export const SkillModelOverrideSchema = z.object({
  provider: z.string().optional(),
  name: z.string().optional(),
  params: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      reasoning: z.enum(['none', 'low', 'medium', 'high']).optional(),
    })
    .optional(),
});

export const SkillA2AFieldsSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).optional().default([]),
  examples: z.array(z.string()).optional().default([]),
  inputModes: z.array(z.string()).optional().default([]),
  outputModes: z.array(z.string()).optional().default([]),
  capabilities: AgentCapabilitiesSchema.optional(),
  toolPolicies: ToolPolicyListSchema.optional(),
  guardrails: GuardrailConfigSchema.optional(),
});

export const SkillFrontmatterSchema = z.object({
  skill: SkillA2AFieldsSchema,
  model: SkillModelOverrideSchema.optional(),
  mcp: SkillMCPConfigSchema.optional(),
  workflows: SkillWorkflowsConfigSchema.optional(),
});

export type SkillMCPServerSelection = z.infer<typeof SkillMCPServerSelectionSchema>;
export type SkillWorkflowOverride = z.infer<typeof SkillWorkflowOverrideSchema>;
export type SkillWorkflowsConfig = z.infer<typeof SkillWorkflowsConfigSchema>;
export type SkillMCPConfig = z.infer<typeof SkillMCPConfigSchema>;
export type SkillModelOverride = z.infer<typeof SkillModelOverrideSchema>;
export type SkillA2AFields = z.infer<typeof SkillA2AFieldsSchema>;
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
export type SkillCapabilities = AgentCapabilities;
export type SkillToolPolicies = ToolPolicyList;
export type SkillGuardrailConfig = GuardrailConfig;
