/**
 * Card Inspector Utilities
 * Helpers for extracting guardrail and tool policy metadata from agent cards
 */

export interface CardWithExtensions {
  capabilities?: {
    extensions?: Array<{
      uri: string;
      params?: unknown;
    }>;
  };
}

export const TOOL_POLICIES_EXTENSION_URI = 'urn:agent:tool-policies';
export const GUARDRAILS_EXTENSION_URI = 'urn:agent:guardrails';

function extractExtensionParams(
  card: CardWithExtensions,
  uri: string,
): Record<string, unknown> | undefined {
  const extensions = card.capabilities?.extensions;
  if (!extensions) {
    return undefined;
  }

  const extension = extensions.find((candidate) => candidate.uri === uri);
  if (!extension) {
    return undefined;
  }

  const params = extension.params;
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return undefined;
  }

  return params as Record<string, unknown>;
}

export function extractToolPolicies(card: CardWithExtensions): string[] | undefined {
  const params = extractExtensionParams(card, TOOL_POLICIES_EXTENSION_URI);
  const policies = params ? params['policies'] : undefined;
  if (!Array.isArray(policies)) {
    return undefined;
  }
  return policies.filter((policy): policy is string => typeof policy === 'string');
}

export function extractGuardrails(card: CardWithExtensions): Record<string, unknown> | undefined {
  const params = extractExtensionParams(card, GUARDRAILS_EXTENSION_URI);
  const guardrails = params ? params['guardrails'] : undefined;
  if (!guardrails || typeof guardrails !== 'object' || Array.isArray(guardrails)) {
    return undefined;
  }
  return guardrails as Record<string, unknown>;
}
