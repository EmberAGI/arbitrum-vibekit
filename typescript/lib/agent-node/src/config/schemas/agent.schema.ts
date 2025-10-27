import { z } from 'zod';

import { AIConfigSchema } from '../../ai/ai-config.js';

/**
 * A2A Agent Card Schema
 * Based on A2A v0.3.0 specification with agent-level model defaults
 */

export const AgentExtensionSchema = z.object({
  uri: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  params: z.unknown().optional(),
});

export const AgentCapabilitiesSchema = z.object({
  streaming: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  stateTransitionHistory: z.boolean().optional(),
  extensions: z.array(AgentExtensionSchema).optional(),
});

export const GuardrailValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.array(z.string()),
  z.record(z.string(), z.unknown()),
]);

export const GuardrailConfigSchema = z.record(z.string(), GuardrailValueSchema);

export const ToolPolicyListSchema = z.array(z.string());

export const AgentProviderSchema = z.object({
  name: z.string(),
  url: z.string().url().optional(),
});

export const AgentSkillRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).optional(),
  examples: z.array(z.string()).optional(),
  inputModes: z.array(z.string()).optional(),
  outputModes: z.array(z.string()).optional(),
});

export const ModelParamsSchema = z.object({
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().int().positive().optional().default(4096),
  topP: z.number().min(0).max(1).optional().default(1.0),
  reasoning: z.enum(['none', 'low', 'medium', 'high']).optional().default('low'),
});

export const ModelConfigSchema = z.object({
  provider: AIConfigSchema.shape.provider.default('openrouter'),
  name: z.string().default('anthropic/claude-sonnet-4.5'),
  params: ModelParamsSchema.optional(),
});

export const AgentCardBaseSchema = z.object({
  protocolVersion: z.string().default('0.3.0'),
  name: z.string(),
  description: z.string(),
  url: z.string().url(),
  version: z.string().default('1.0.0'),
  capabilities: AgentCapabilitiesSchema.default({}),
  provider: AgentProviderSchema.optional(),
  defaultInputModes: z.array(z.string()).optional().default([]),
  defaultOutputModes: z.array(z.string()).optional().default([]),
  skills: z.array(AgentSkillRefSchema).optional().default([]),
  toolPolicies: ToolPolicyListSchema.optional(),
  guardrails: GuardrailConfigSchema.optional(),
});

/**
 * Agent Base Frontmatter Schema
 * Contains A2A card base + agent-level model configuration
 */
export const AgentBaseFrontmatterSchema = z.object({
  version: z.number().int().positive().default(1),
  card: AgentCardBaseSchema,
  model: ModelConfigSchema.optional(),
});

export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;
export type AgentExtension = z.infer<typeof AgentExtensionSchema>;
export type AgentProvider = z.infer<typeof AgentProviderSchema>;
export type AgentSkillRef = z.infer<typeof AgentSkillRefSchema>;
export type ModelParams = z.infer<typeof ModelParamsSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AgentCardBase = z.infer<typeof AgentCardBaseSchema>;
export type GuardrailValue = z.infer<typeof GuardrailValueSchema>;
export type GuardrailConfig = z.infer<typeof GuardrailConfigSchema>;
export type ToolPolicyList = z.infer<typeof ToolPolicyListSchema>;
export type AgentBaseFrontmatter = z.infer<typeof AgentBaseFrontmatterSchema>;
