/**
 * Agent Card Validator
 * Ensures composed agent cards conform to A2A v0.3.0 requirements
 */

import type { AgentCard } from '@a2a-js/sdk';
import { z } from 'zod';

const AgentExtensionValidationSchema = z
  .object({
    uri: z.string().min(1),
    description: z.string().optional(),
    required: z.boolean().optional(),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const AgentCapabilitiesValidationSchema = z
  .object({
    streaming: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    stateTransitionHistory: z.boolean().optional(),
    extensions: z.array(AgentExtensionValidationSchema).optional(),
  })
  .strict();

const AgentSkillValidationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string()).default([]),
    examples: z.array(z.string()).optional(),
    inputModes: z.array(z.string()).optional(),
    outputModes: z.array(z.string()).optional(),
    security: z.array(z.record(z.string(), z.array(z.string()))).optional(),
  })
  .passthrough();

const AgentProviderValidationSchema = z
  .object({
    organization: z.string().min(1),
    url: z.string().url(),
  })
  .strict();

const AgentCardValidationSchema = z
  .object({
    protocolVersion: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    url: z.string().url(),
    version: z.string().min(1),
    capabilities: AgentCapabilitiesValidationSchema,
    defaultInputModes: z.array(z.string()),
    defaultOutputModes: z.array(z.string()),
    skills: z.array(AgentSkillValidationSchema),
    provider: AgentProviderValidationSchema.optional(),
    additionalInterfaces: z
      .array(
        z
          .object({
            url: z.string().url(),
            transport: z.string().min(1),
          })
          .passthrough(),
      )
      .optional(),
    security: z.array(z.record(z.string(), z.array(z.string()))).optional(),
    securitySchemes: z.any().optional(),
    documentationUrl: z.string().url().optional(),
    iconUrl: z.string().url().optional(),
    preferredTransport: z.string().min(1).optional(),
    signatures: z.any().optional(),
    supportsAuthenticatedExtendedCard: z.boolean().optional(),
  })
  .passthrough();

/**
 * Validate composed agent card
 * @param card - Agent card to validate
 * @throws Error if validation fails
 * @returns Validated agent card
 */
export function validateAgentCard(card: AgentCard): AgentCard {
  const result = AgentCardValidationSchema.safeParse(card);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')} ${issue.message}`)
      .join('\n');

    throw new Error(`Agent card validation failed:\n${issues}`);
  }

  return result.data;
}
