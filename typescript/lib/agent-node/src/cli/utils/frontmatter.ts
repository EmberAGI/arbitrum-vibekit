import { readFileSync, writeFileSync } from 'node:fs';

import matter from 'gray-matter';

import {
  AgentBaseFrontmatterSchema,
  type AgentBaseFrontmatter,
} from '../../config/schemas/agent.schema.js';

export const createDefaultErc8004Config = (): NonNullable<AgentBaseFrontmatter['erc8004']> => ({
  enabled: false,
  mirrors: [],
  identityRegistries: {},
  registrations: {},
  supportedTrust: [],
});

export const ensureErc8004Config = (
  draft: AgentBaseFrontmatter,
): NonNullable<AgentBaseFrontmatter['erc8004']> => {
  if (!draft.erc8004) {
    draft.erc8004 = createDefaultErc8004Config();
  } else {
    draft.erc8004.mirrors = draft.erc8004.mirrors ?? [];
    draft.erc8004.identityRegistries = draft.erc8004.identityRegistries ?? {};
    draft.erc8004.registrations = draft.erc8004.registrations ?? {};
    draft.erc8004.supportedTrust = draft.erc8004.supportedTrust ?? [];
  }
  return draft.erc8004;
};

export function updateAgentFrontmatter(
  agentPath: string,
  updater: (frontmatter: AgentBaseFrontmatter) => AgentBaseFrontmatter,
): AgentBaseFrontmatter {
  const agentRaw = readFileSync(agentPath, 'utf-8');
  const parsed = matter(agentRaw);
  const current = AgentBaseFrontmatterSchema.parse(parsed.data);
  const next = updater(structuredClone(current));
  const updatedFile = matter.stringify(parsed.content, next);
  writeFileSync(agentPath, updatedFile, 'utf-8');
  return next;
}

export function tryReadAgentFrontmatter(agentPath: string): AgentBaseFrontmatter | undefined {
  try {
    const agentRaw = readFileSync(agentPath, 'utf-8');
    const parsed = matter(agentRaw);
    return AgentBaseFrontmatterSchema.parse(parsed.data);
  } catch {
    return undefined;
  }
}
