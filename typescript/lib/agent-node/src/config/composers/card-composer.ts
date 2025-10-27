/**
 * Agent Card Composer
 * Composes A2A-compliant agent card from base and skills
 */

import type { AgentCard } from '@a2a-js/sdk';

import type { LoadedAgentBase } from '../loaders/agent-loader.js';
import type { LoadedSkill } from '../loaders/skill-loader.js';
import type {
  AgentCapabilities,
  AgentExtension,
  AgentSkillRef,
  GuardrailConfig,
  GuardrailValue,
  ToolPolicyList,
} from '../schemas/agent.schema.js';
import type { MergePolicy } from '../schemas/manifest.schema.js';
import { validateAgentCard } from '../validators/a2a-validator.js';

type CapabilityMergeStrategy = 'union' | 'intersect';
type ToolPolicyMergeStrategy = 'union' | 'intersect';
type GuardrailMergeStrategy = 'tightest' | 'loosest';

const TOOL_POLICIES_EXTENSION_URI = 'urn:agent:tool-policies';
const GUARDRAILS_EXTENSION_URI = 'urn:agent:guardrails';

const GUARDRAIL_SEVERITY: Record<string, number> = {
  off: 0,
  disabled: 0,
  allow: 0,
  lenient: 1,
  monitor: 2,
  warn: 3,
  alert: 3,
  block: 4,
  enforce: 4,
  strict: 5,
  maximum: 6,
  max: 6,
};

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return value.map((item) => deepClone(item)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const clone: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      clone[key] = deepClone(val);
    }
    return clone as T;
  }

  return value;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (a === null || b === null) {
    return false;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aEntries = Object.entries(a as Record<string, unknown>);
    const bEntries = Object.entries(b as Record<string, unknown>);

    if (aEntries.length !== bEntries.length) {
      return false;
    }

    for (const [key, value] of aEntries) {
      if (!deepEqual(value, (b as Record<string, unknown>)[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function normalizeStringArray(values?: string[]): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function mergeBooleanField(
  baseValue: boolean | undefined,
  incomingValue: boolean | undefined,
  strategy: CapabilityMergeStrategy,
): boolean | undefined {
  if (baseValue === undefined) {
    return incomingValue;
  }
  if (incomingValue === undefined) {
    return baseValue;
  }
  return strategy === 'union' ? baseValue || incomingValue : baseValue && incomingValue;
}

function mergeExtensions(
  base: AgentExtension[] | undefined,
  incoming: AgentExtension[] | undefined,
  strategy: CapabilityMergeStrategy,
): AgentExtension[] | undefined {
  if (!base && !incoming) {
    return undefined;
  }

  if (!base || base.length === 0) {
    return incoming ? deepClone(incoming) : undefined;
  }

  if (!incoming || incoming.length === 0) {
    return strategy === 'union' ? deepClone(base) : [];
  }

  if (strategy === 'union') {
    const merged: AgentExtension[] = [];
    const byUri = new Map<string, AgentExtension>();

    for (const extension of base) {
      byUri.set(extension.uri, deepClone(extension));
    }

    for (const extension of incoming) {
      const existing = byUri.get(extension.uri);
      if (!existing) {
        byUri.set(extension.uri, deepClone(extension));
        continue;
      }
      if (!deepEqual(existing, extension)) {
        throw new Error(
          `Extension conflict for URI "${extension.uri}": definitions must match across skills`,
        );
      }
    }

    for (const value of byUri.values()) {
      merged.push(value);
    }
    return merged;
  }

  // Intersection
  const incomingByUri = new Map<string, AgentExtension>();
  for (const extension of incoming) {
    incomingByUri.set(extension.uri, extension);
  }

  const result: AgentExtension[] = [];
  for (const extension of base) {
    const candidate = incomingByUri.get(extension.uri);
    if (!candidate) {
      continue;
    }
    if (!deepEqual(extension, candidate)) {
      throw new Error(
        `Extension conflict for URI "${extension.uri}": differing definitions cannot be intersected`,
      );
    }
    result.push(deepClone(extension));
  }

  return result;
}

function mergeCapabilities(
  base: AgentCapabilities,
  incoming: AgentCapabilities | undefined,
  strategy: CapabilityMergeStrategy,
): AgentCapabilities {
  if (!incoming) {
    return deepClone(base);
  }

  const merged: AgentCapabilities = {
    ...deepClone(base),
  };

  merged.streaming = mergeBooleanField(base.streaming, incoming.streaming, strategy);
  merged.pushNotifications = mergeBooleanField(
    base.pushNotifications,
    incoming.pushNotifications,
    strategy,
  );
  merged.stateTransitionHistory = mergeBooleanField(
    base.stateTransitionHistory,
    incoming.stateTransitionHistory,
    strategy,
  );

  merged.extensions = mergeExtensions(base.extensions, incoming.extensions, strategy);

  if (merged.extensions && merged.extensions.length === 0) {
    delete merged.extensions;
  }

  return merged;
}

function mergeToolPolicies(
  base: ToolPolicyList | undefined,
  incoming: ToolPolicyList | undefined,
  strategy: ToolPolicyMergeStrategy,
): ToolPolicyList | undefined {
  const normalizedBase = normalizeStringArray(base);
  const normalizedIncoming = normalizeStringArray(incoming);

  if (normalizedBase.length === 0 && normalizedIncoming.length === 0) {
    return undefined;
  }

  if (strategy === 'union') {
    return normalizeStringArray([...normalizedBase, ...normalizedIncoming]);
  }

  if (normalizedBase.length === 0) {
    return normalizedIncoming.length > 0 ? normalizedIncoming : undefined;
  }

  if (normalizedIncoming.length === 0) {
    return normalizedBase.length > 0 ? normalizedBase : undefined;
  }

  const incomingSet = new Set(normalizedIncoming);
  const intersection = normalizedBase.filter((policy) => incomingSet.has(policy));
  return intersection.length > 0 ? intersection : [];
}

function normalizeGuardrailString(value: string): {
  original: string;
  normalized: string;
  severity?: number;
} {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  const severity = GUARDRAIL_SEVERITY[normalized];
  return { original: trimmed, normalized, severity };
}

function mergeGuardrailArrays(
  existing: string[],
  incoming: string[],
  strategy: GuardrailMergeStrategy,
): string[] {
  const baseValues = normalizeStringArray(existing);
  const incomingValues = normalizeStringArray(incoming);

  if (strategy === 'tightest') {
    const incomingSet = new Set(incomingValues);
    return baseValues.filter((value) => incomingSet.has(value));
  }

  return normalizeStringArray([...baseValues, ...incomingValues]);
}

function mergeGuardrailRecords(
  base: GuardrailConfig,
  incoming: GuardrailConfig,
  strategy: GuardrailMergeStrategy,
  skillId: string,
  path: string,
): GuardrailConfig {
  const result: GuardrailConfig = deepClone(base);

  for (const [key, incomingValue] of Object.entries(incoming)) {
    const currentKey = path ? `${path}.${key}` : key;
    const existingValue = result[key];

    if (existingValue === undefined) {
      result[key] = deepClone(incomingValue);
      continue;
    }

    result[key] = mergeGuardrailValue(existingValue, incomingValue, strategy, skillId, currentKey);
  }

  return result;
}

function mergeGuardrailValue(
  existing: GuardrailValue,
  incoming: GuardrailValue,
  strategy: GuardrailMergeStrategy,
  skillId: string,
  path: string,
): GuardrailValue {
  if (typeof existing === 'boolean' && typeof incoming === 'boolean') {
    return strategy === 'tightest' ? existing || incoming : existing && incoming;
  }

  if (typeof existing === 'number' && typeof incoming === 'number') {
    return strategy === 'tightest' ? Math.max(existing, incoming) : Math.min(existing, incoming);
  }

  if (typeof existing === 'string' && typeof incoming === 'string') {
    const existingInfo = normalizeGuardrailString(existing);
    const incomingInfo = normalizeGuardrailString(incoming);

    if (existingInfo.normalized === incomingInfo.normalized) {
      // Same semantic value; return whichever aligns with strategy (prefer more restrictive).
      if (existingInfo.severity !== undefined && incomingInfo.severity !== undefined) {
        return strategy === 'tightest'
          ? existingInfo.severity >= incomingInfo.severity
            ? existingInfo.original
            : incomingInfo.original
          : existingInfo.severity <= incomingInfo.severity
            ? existingInfo.original
            : incomingInfo.original;
      }
      return existingInfo.original;
    }

    if (existingInfo.severity !== undefined && incomingInfo.severity !== undefined) {
      return strategy === 'tightest'
        ? existingInfo.severity >= incomingInfo.severity
          ? existingInfo.original
          : incomingInfo.original
        : existingInfo.severity <= incomingInfo.severity
          ? existingInfo.original
          : incomingInfo.original;
    }

    throw new Error(
      `Conflicting guardrail "${path}" between skill "${skillId}" and base configuration: "${existingInfo.original}" vs "${incomingInfo.original}"`,
    );
  }

  if (Array.isArray(existing) && Array.isArray(incoming)) {
    if (
      existing.every((value) => typeof value === 'string') &&
      incoming.every((value) => typeof value === 'string')
    ) {
      return mergeGuardrailArrays(existing, incoming, strategy);
    }
    if (deepEqual(existing, incoming)) {
      return deepClone(existing);
    }
    throw new Error(
      `Conflicting guardrail array at "${path}" between skill "${skillId}" and base configuration`,
    );
  }

  if (
    existing &&
    typeof existing === 'object' &&
    incoming &&
    typeof incoming === 'object' &&
    !Array.isArray(existing) &&
    !Array.isArray(incoming)
  ) {
    return mergeGuardrailRecords(
      existing as GuardrailConfig,
      incoming as GuardrailConfig,
      strategy,
      skillId,
      path,
    );
  }

  if (deepEqual(existing, incoming)) {
    return deepClone(existing);
  }

  throw new Error(
    `Conflicting guardrail "${path}" between skill "${skillId}" and base configuration`,
  );
}

function mergeGuardrails(
  base: GuardrailConfig | undefined,
  incoming: GuardrailConfig | undefined,
  strategy: GuardrailMergeStrategy,
  skillId: string,
): GuardrailConfig | undefined {
  if (!incoming || Object.keys(incoming).length === 0) {
    return base ? deepClone(base) : undefined;
  }

  if (!base || Object.keys(base).length === 0) {
    return deepClone(incoming);
  }

  return mergeGuardrailRecords(base, incoming, strategy, skillId, '');
}

function attachPolicyExtensions(
  capabilities: AgentCapabilities,
  toolPolicies: ToolPolicyList | undefined,
  guardrails: GuardrailConfig | undefined,
): AgentCapabilities {
  const nextCapabilities: AgentCapabilities = deepClone(capabilities);
  const extensions = [...(nextCapabilities.extensions ?? [])];

  if (toolPolicies && toolPolicies.length > 0) {
    const existingIndex = extensions.findIndex(
      (extension) => extension.uri === TOOL_POLICIES_EXTENSION_URI,
    );
    const extension: AgentExtension = {
      uri: TOOL_POLICIES_EXTENSION_URI,
      params: {
        policies: toolPolicies,
      },
    };
    if (existingIndex >= 0) {
      extensions[existingIndex] = extension;
    } else {
      extensions.push(extension);
    }
  } else {
    const index = extensions.findIndex(
      (extension) => extension.uri === TOOL_POLICIES_EXTENSION_URI,
    );
    if (index >= 0) {
      extensions.splice(index, 1);
    }
  }

  if (guardrails && Object.keys(guardrails).length > 0) {
    const existingIndex = extensions.findIndex(
      (extension) => extension.uri === GUARDRAILS_EXTENSION_URI,
    );
    const extension: AgentExtension = {
      uri: GUARDRAILS_EXTENSION_URI,
      params: {
        guardrails,
      },
    };
    if (existingIndex >= 0) {
      extensions[existingIndex] = extension;
    } else {
      extensions.push(extension);
    }
  } else {
    const index = extensions.findIndex((extension) => extension.uri === GUARDRAILS_EXTENSION_URI);
    if (index >= 0) {
      extensions.splice(index, 1);
    }
  }

  if (extensions.length > 0) {
    nextCapabilities.extensions = extensions;
  } else {
    delete nextCapabilities.extensions;
  }

  return nextCapabilities;
}

function buildSkillRef(skill: LoadedSkill): AgentSkillRef {
  const data = skill.frontmatter.skill;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    tags: normalizeStringArray(data.tags),
    examples: normalizeStringArray(data.examples),
    inputModes: normalizeStringArray(data.inputModes),
    outputModes: normalizeStringArray(data.outputModes),
  };
}

function transformProvider(
  provider: LoadedAgentBase['frontmatter']['card']['provider'] | undefined,
): AgentCard['provider'] {
  if (!provider || !provider.url) {
    return undefined;
  }
  return {
    organization: provider.name,
    url: provider.url,
  };
}

/**
 * Compose agent card from base and skills
 * @param agentBase - Loaded agent base
 * @param skills - Array of loaded skills in manifest order
 * @param mergePolicy - Merge policy from manifest
 * @returns Composed agent card
 */
export function composeAgentCard(
  agentBase: LoadedAgentBase,
  skills: LoadedSkill[],
  mergePolicy: MergePolicy,
): AgentCard {
  const baseCard = agentBase.frontmatter.card;
  const capabilitiesStrategy: CapabilityMergeStrategy = mergePolicy.card?.capabilities ?? 'union';
  const toolPolicyStrategy: ToolPolicyMergeStrategy = mergePolicy.card?.toolPolicies ?? 'intersect';
  const guardrailStrategy: GuardrailMergeStrategy = mergePolicy.card?.guardrails ?? 'tightest';

  const baseCapabilities = baseCard.capabilities ? deepClone(baseCard.capabilities) : {};
  let mergedCapabilities = deepClone(baseCapabilities);
  let mergedToolPolicies = baseCard.toolPolicies
    ? normalizeStringArray(baseCard.toolPolicies)
    : undefined;
  let mergedGuardrails = baseCard.guardrails ? deepClone(baseCard.guardrails) : undefined;

  const skillRefs: AgentSkillRef[] = [];
  const defaultInputModes = new Set<string>(normalizeStringArray(baseCard.defaultInputModes));
  const defaultOutputModes = new Set<string>(normalizeStringArray(baseCard.defaultOutputModes));

  for (const skill of skills) {
    const skillData = skill.frontmatter.skill;
    skillRefs.push(buildSkillRef(skill));

    mergedCapabilities = mergeCapabilities(
      mergedCapabilities,
      skillData.capabilities,
      capabilitiesStrategy,
    );

    mergedToolPolicies = mergeToolPolicies(
      mergedToolPolicies,
      skillData.toolPolicies,
      toolPolicyStrategy,
    );

    mergedGuardrails = mergeGuardrails(
      mergedGuardrails,
      skillData.guardrails,
      guardrailStrategy,
      skillData.id,
    );

    for (const mode of normalizeStringArray(skillData.inputModes)) {
      defaultInputModes.add(mode);
    }

    for (const mode of normalizeStringArray(skillData.outputModes)) {
      defaultOutputModes.add(mode);
    }
  }

  const capabilitiesWithPolicies = attachPolicyExtensions(
    mergedCapabilities,
    mergedToolPolicies,
    mergedGuardrails,
  );

  const composedCard: AgentCard = {
    protocolVersion: baseCard.protocolVersion,
    name: baseCard.name,
    description: baseCard.description,
    url: baseCard.url,
    version: baseCard.version,
    capabilities: capabilitiesWithPolicies as AgentCard['capabilities'],
    provider: transformProvider(baseCard.provider),
    defaultInputModes: Array.from(defaultInputModes),
    defaultOutputModes: Array.from(defaultOutputModes),
    skills: skillRefs as AgentCard['skills'],
  };

  const validated = validateAgentCard(composedCard);
  return validated;
}
