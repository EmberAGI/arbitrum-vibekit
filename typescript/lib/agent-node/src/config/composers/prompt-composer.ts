/**
 * Prompt Composer
 * Composes final system prompt from agent base and skills
 */

import type { LoadedAgentBase } from '../loaders/agent-loader.js';
import type { LoadedSkill } from '../loaders/skill-loader.js';

export interface ComposedPrompt {
  content: string;
  parts: {
    base: string;
    skills: Array<{
      skillId: string;
      content: string;
    }>;
  };
}

/**
 * Compose final system prompt from agent base and skills
 * Rule: finalPrompt = agent.md body + "\n\n" + each(skill.body) in manifest order
 * @param agentBase - Loaded agent base
 * @param skills - Array of loaded skills in manifest order
 * @returns Composed prompt
 */
export function composePrompt(agentBase: LoadedAgentBase, skills: LoadedSkill[]): ComposedPrompt {
  const parts: ComposedPrompt['parts'] = {
    base: agentBase.body,
    skills: [],
  };

  const promptSegments: string[] = [agentBase.body];

  for (const skill of skills) {
    const skillContent = skill.body;
    parts.skills.push({
      skillId: skill.frontmatter.skill.id,
      content: skillContent,
    });
    promptSegments.push(skillContent);
  }

  const content = promptSegments.join('\n\n');

  return {
    content,
    parts,
  };
}
