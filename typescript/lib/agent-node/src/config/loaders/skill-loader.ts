import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

import matter from 'gray-matter';

import { SkillFrontmatterSchema, type SkillFrontmatter } from '../schemas/skill.schema.js';

export interface LoadedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  path: string;
}

/**
 * Load a single skill from markdown file
 * @param skillPath - Path to skill .md file
 * @param basePath - Base path for resolving relative paths
 * @returns Loaded skill with frontmatter and body
 */
export function loadSkill(skillPath: string, basePath?: string): LoadedSkill {
  const fullPath = basePath ? resolve(basePath, skillPath) : resolve(skillPath);

  if (!existsSync(fullPath)) {
    throw new Error(`Skill file not found: ${fullPath}`);
  }

  try {
    const fileContent = readFileSync(fullPath, 'utf-8');
    const { data, content } = matter(fileContent);

    // Validate frontmatter
    const frontmatter = SkillFrontmatterSchema.parse(data);

    return {
      frontmatter,
      body: content.trim(),
      path: fullPath,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load skill from ${fullPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Load multiple skills from manifest paths
 * @param skillPaths - Array of skill paths from manifest
 * @param basePath - Base path for resolving relative paths
 * @returns Array of loaded skills
 */
export function loadSkills(skillPaths: string[], basePath: string): LoadedSkill[] {
  const skills: LoadedSkill[] = [];

  for (const skillPath of skillPaths) {
    try {
      const skill = loadSkill(skillPath, basePath);
      skills.push(skill);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load skill ${skillPath}: ${error.message}`);
      }
      throw error;
    }
  }

  return skills;
}
