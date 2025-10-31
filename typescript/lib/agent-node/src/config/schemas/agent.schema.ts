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

/**
 * AI Configuration Schema (replaces ModelConfigSchema)
 * New naming convention per PRD: ai.modelProvider, ai.model, ai.params
 * Strict mode: rejects unknown keys (e.g., deprecated 'provider', 'name')
 */
export const AIModelConfigSchema = z
  .object({
    modelProvider: AIConfigSchema.shape.provider.default('openrouter'),
    model: z.string().default('anthropic/claude-sonnet-4.5'),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/**
 * Routing Configuration Schema
 * Controls Agent Card hosting and path configuration
 * Strict mode: rejects unknown keys
 */
export const RoutingConfigSchema = z
  .object({
    agentCardPath: z.string().optional(),
    agentCardOrigin: z.string().optional(),
  })
  .strict();

/**
 * ERC-8004 Canonical Chain Configuration
 * Strict mode: rejects unknown keys
 */
export const ERC8004CanonicalConfigSchema = z
  .object({
    chainId: z.number().int().positive(),
    operatorAddress: z.string().optional(),
  })
  .strict();

/**
 * ERC-8004 Mirror Chain Configuration
 * Strict mode: rejects unknown keys
 */
export const ERC8004MirrorConfigSchema = z
  .object({
    chainId: z.number().int().positive(),
  })
  .strict();

/**
 * ERC-8004 Registration Entry
 * Stores per-chain registration data (agentId, registrationUri)
 * Strict mode: rejects unknown keys
 */
export const ERC8004RegistrationEntrySchema = z
  .object({
    agentId: z.number().int().positive().optional(),
    registrationUri: z.string().optional(),
  })
  .strict();

/**
 * ERC-8004 Configuration Schema
 * Agent registration and identity configuration
 * Strict mode: rejects unknown keys
 */
export const ERC8004ConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    canonical: ERC8004CanonicalConfigSchema.optional(),
    mirrors: z.array(ERC8004MirrorConfigSchema).optional().default([]),
    identityRegistries: z.record(z.string(), z.string()).optional().default({}),
    registrations: z.record(z.string(), ERC8004RegistrationEntrySchema).optional().default({}),
    supportedTrust: z.array(z.string()).optional().default([]),
    image: z.string().optional(),
    version: z.string().optional(),
  })
  .strict();

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
 * Contains A2A card base + agent-level AI configuration + routing + ERC-8004
 * Strict mode: rejects unknown keys (e.g., deprecated 'model')
 */
export const AgentBaseFrontmatterSchema = z
  .object({
    version: z.number().int().positive().default(1),
    card: AgentCardBaseSchema,
    ai: AIModelConfigSchema.optional(),
    routing: RoutingConfigSchema.optional(),
    erc8004: ERC8004ConfigSchema.optional(),
  })
  .strict();

export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;
export type AgentExtension = z.infer<typeof AgentExtensionSchema>;
export type AgentProvider = z.infer<typeof AgentProviderSchema>;
export type AgentSkillRef = z.infer<typeof AgentSkillRefSchema>;
export type ModelParams = z.infer<typeof ModelParamsSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AIModelConfig = z.infer<typeof AIModelConfigSchema>;
export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;
export type ERC8004CanonicalConfig = z.infer<typeof ERC8004CanonicalConfigSchema>;
export type ERC8004MirrorConfig = z.infer<typeof ERC8004MirrorConfigSchema>;
export type ERC8004RegistrationEntry = z.infer<typeof ERC8004RegistrationEntrySchema>;
export type ERC8004Config = z.infer<typeof ERC8004ConfigSchema>;
export type AgentCardBase = z.infer<typeof AgentCardBaseSchema>;
export type GuardrailValue = z.infer<typeof GuardrailValueSchema>;
export type GuardrailConfig = z.infer<typeof GuardrailConfigSchema>;
export type ToolPolicyList = z.infer<typeof ToolPolicyListSchema>;
export type AgentBaseFrontmatter = z.infer<typeof AgentBaseFrontmatterSchema>;
