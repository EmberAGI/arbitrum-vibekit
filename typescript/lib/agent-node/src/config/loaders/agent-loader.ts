import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

import matter from 'gray-matter';

import { AgentBaseFrontmatterSchema, type AgentBaseFrontmatter } from '../schemas/agent.schema.js';

export interface LoadedAgentBase {
  frontmatter: AgentBaseFrontmatter;
  body: string;
  path: string;
}

/**
 * Load agent base configuration from agent.md
 * @param agentPath - Path to agent.md file
 * @returns Loaded agent base with frontmatter and body
 */
export function loadAgentBase(agentPath: string): LoadedAgentBase {
  const fullPath = resolve(agentPath);

  if (!existsSync(fullPath)) {
    throw new Error(`Agent file not found: ${fullPath}`);
  }

  try {
    const fileContent = readFileSync(fullPath, 'utf-8');
    const { data, content } = matter(fileContent);

    // Validate frontmatter
    const frontmatter = AgentBaseFrontmatterSchema.parse(data);

    return {
      frontmatter,
      body: content.trim(),
      path: fullPath,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load agent base from ${fullPath}: ${error.message}`);
    }
    throw error;
  }
}
