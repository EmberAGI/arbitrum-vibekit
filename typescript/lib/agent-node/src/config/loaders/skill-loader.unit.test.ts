/**
 * Unit tests for skill-loader
 * Tests loading and validation of skill markdown files with YAML frontmatter
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { loadSkill, loadSkills } from './skill-loader.js';

describe('loadSkill', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `skill-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should load valid skill with minimal frontmatter', () => {
    // Given a skill file with minimal required frontmatter
    const skillPath = join(testDir, 'swap.md');
    const skillContent = `---
skill:
  id: swap-skill
  name: Token Swap
  description: Swap tokens across chains
---

You are a token swap assistant.`;

    writeFileSync(skillPath, skillContent);

    // When loading
    const result = loadSkill(skillPath);

    // Then should parse frontmatter and body
    expect(result.frontmatter.skill.id).toBe('swap-skill');
    expect(result.frontmatter.skill.name).toBe('Token Swap');
    expect(result.frontmatter.skill.description).toBe('Swap tokens across chains');
    expect(result.body).toBe('You are a token swap assistant.');
    expect(result.path).toBe(skillPath);
  });

  it('should load skill with MCP server selections', () => {
    // Given a skill with MCP configuration
    const skillPath = join(testDir, 'skill.md');
    const skillContent = `---
skill:
  id: test-skill
  name: Test Skill
  description: Test
mcp:
  servers:
    - name: squid
      allowedTools: [get_route, execute_swap]
    - name: dune
---

Test prompt`;

    writeFileSync(skillPath, skillContent);

    // When loading
    const result = loadSkill(skillPath);

    // Then should include MCP servers
    expect(result.frontmatter.mcp?.servers).toHaveLength(2);
    expect(result.frontmatter.mcp?.servers?.[0]?.name).toBe('squid');
    expect(result.frontmatter.mcp?.servers?.[0]?.allowedTools).toEqual([
      'get_route',
      'execute_swap',
    ]);
    expect(result.frontmatter.mcp?.servers?.[1]?.name).toBe('dune');
  });

  it('should load skill with workflow configuration', () => {
    // Given a skill with workflow configuration
    const skillPath = join(testDir, 'skill.md');
    const skillContent = `---
skill:
  id: test-skill
  name: Test Skill
  description: Test
workflows:
  include:
    - workflow-a
    - workflow-b
  overrides:
    workflow-a:
      enabled: true
      config:
        timeout: 5000
---

Test prompt`;

    writeFileSync(skillPath, skillContent);

    // When loading
    const result = loadSkill(skillPath);

    // Then should include workflows
    expect(result.frontmatter.workflows?.include).toEqual(['workflow-a', 'workflow-b']);
    expect(result.frontmatter.workflows?.overrides?.['workflow-a']?.enabled).toBe(true);
    expect(result.frontmatter.workflows?.overrides?.['workflow-a']?.config?.timeout).toBe(5000);
  });

  it('should load skill with model override', () => {
    // Given a skill with model override
    const skillPath = join(testDir, 'skill.md');
    const skillContent = `---
skill:
  id: test-skill
  name: Test Skill
  description: Test
model:
  provider: anthropic
  name: claude-opus-4
  params:
    temperature: 0.7
    reasoning: high
---

Test prompt`;

    writeFileSync(skillPath, skillContent);

    // When loading
    const result = loadSkill(skillPath);

    // Then should include model override
    expect(result.frontmatter.model?.provider).toBe('anthropic');
    expect(result.frontmatter.model?.name).toBe('claude-opus-4');
    expect(result.frontmatter.model?.params?.temperature).toBe(0.7);
    expect(result.frontmatter.model?.params?.reasoning).toBe('high');
  });

  it('should load skill with A2A fields (tags, examples, modes)', () => {
    // Given a skill with extended A2A fields
    const skillPath = join(testDir, 'skill.md');
    const skillContent = `---
skill:
  id: test-skill
  name: Test Skill
  description: Test
  tags: [swap, defi, cross-chain]
  examples:
    - Swap 100 USDC to ETH
    - Bridge tokens to Arbitrum
  inputModes: [text, structured]
  outputModes: [text, json]
---

Test prompt`;

    writeFileSync(skillPath, skillContent);

    // When loading
    const result = loadSkill(skillPath);

    // Then should include A2A fields
    expect(result.frontmatter.skill.tags).toEqual(['swap', 'defi', 'cross-chain']);
    expect(result.frontmatter.skill.examples).toHaveLength(2);
    expect(result.frontmatter.skill.inputModes).toEqual(['text', 'structured']);
    expect(result.frontmatter.skill.outputModes).toEqual(['text', 'json']);
  });

  it('should apply defaults for optional fields', () => {
    // Given a skill with minimal frontmatter
    const skillPath = join(testDir, 'skill.md');
    const skillContent = `---
skill:
  id: test-skill
  name: Test Skill
  description: Test
---

Test prompt`;

    writeFileSync(skillPath, skillContent);

    // When loading
    const result = loadSkill(skillPath);

    // Then should apply defaults for skill fields
    expect(result.frontmatter.skill.tags).toEqual([]);
    expect(result.frontmatter.skill.examples).toEqual([]);
    expect(result.frontmatter.skill.inputModes).toEqual([]);
    expect(result.frontmatter.skill.outputModes).toEqual([]);
    // mcp and workflows are undefined when not specified
    expect(result.frontmatter.mcp).toBeUndefined();
    expect(result.frontmatter.workflows).toBeUndefined();
  });

  it('should trim whitespace from body', () => {
    // Given a skill with leading/trailing whitespace
    const skillPath = join(testDir, 'skill.md');
    const skillContent = `---
skill:
  id: test-skill
  name: Test Skill
  description: Test
---


Test prompt with whitespace


   `;

    writeFileSync(skillPath, skillContent);

    // When loading
    const result = loadSkill(skillPath);

    // Then should trim whitespace
    expect(result.body).toBe('Test prompt with whitespace');
  });

  it('should resolve relative paths with basePath', () => {
    // Given a skill file and a base path
    const skillsDir = join(testDir, 'skills');
    mkdirSync(skillsDir);
    const skillContent = `---
skill:
  id: test-skill
  name: Test Skill
  description: Test
---

Test`;

    writeFileSync(join(skillsDir, 'test.md'), skillContent);

    // When loading with relative path and basePath
    const result = loadSkill('test.md', skillsDir);

    // Then should resolve correctly
    expect(result.path).toBe(join(skillsDir, 'test.md'));
  });

  it('should throw error for non-existent file', () => {
    // Given a non-existent file path
    const skillPath = join(testDir, 'does-not-exist.md');

    // When loading
    // Then should throw error
    expect(() => loadSkill(skillPath)).toThrow(/Skill file not found/);
  });

  it('should throw error for invalid YAML frontmatter', () => {
    // Given a file with invalid YAML
    const skillPath = join(testDir, 'skill.md');
    const skillContent = `---
skill:
  id: test
  invalid yaml: [unclosed bracket
---

Test`;

    writeFileSync(skillPath, skillContent);

    // When loading
    // Then should throw error
    expect(() => loadSkill(skillPath)).toThrow(/Failed to load skill/);
  });

  it('should throw error for missing required frontmatter fields', () => {
    // Given a skill missing required field (id)
    const skillPath = join(testDir, 'skill.md');
    const skillContent = `---
skill:
  name: Test Skill
  description: Test
---

Test`;

    writeFileSync(skillPath, skillContent);

    // When loading
    // Then should throw validation error
    expect(() => loadSkill(skillPath)).toThrow(/Failed to load skill/);
  });

  it('should throw error for invalid field types', () => {
    // Given a skill with wrong type for tags
    const skillPath = join(testDir, 'skill.md');
    const skillContent = `---
skill:
  id: test-skill
  name: Test Skill
  description: Test
  tags: not-an-array
---

Test`;

    writeFileSync(skillPath, skillContent);

    // When loading
    // Then should throw validation error
    expect(() => loadSkill(skillPath)).toThrow(/Failed to load skill/);
  });

  it('should throw error for invalid model reasoning value', () => {
    // Given a skill with invalid reasoning value
    const skillPath = join(testDir, 'skill.md');
    const skillContent = `---
skill:
  id: test-skill
  name: Test Skill
  description: Test
model:
  params:
    reasoning: invalid-value
---

Test`;

    writeFileSync(skillPath, skillContent);

    // When loading
    // Then should throw validation error
    expect(() => loadSkill(skillPath)).toThrow(/Failed to load skill/);
  });

  it('should throw error for temperature out of range', () => {
    // Given a skill with temperature > 2
    const skillPath = join(testDir, 'skill.md');
    const skillContent = `---
skill:
  id: test-skill
  name: Test Skill
  description: Test
model:
  params:
    temperature: 3.0
---

Test`;

    writeFileSync(skillPath, skillContent);

    // When loading
    // Then should throw validation error
    expect(() => loadSkill(skillPath)).toThrow(/Failed to load skill/);
  });
});

describe('loadSkills', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skills-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should load multiple skills in order', () => {
    // Given multiple skill files
    const skill1 = `---
skill:
  id: skill-1
  name: Skill 1
  description: First
---
Skill 1 prompt`;

    const skill2 = `---
skill:
  id: skill-2
  name: Skill 2
  description: Second
---
Skill 2 prompt`;

    writeFileSync(join(testDir, 'skill1.md'), skill1);
    writeFileSync(join(testDir, 'skill2.md'), skill2);

    // When loading
    const result = loadSkills(['skill1.md', 'skill2.md'], testDir);

    // Then should load in order
    expect(result).toHaveLength(2);
    expect(result[0]?.frontmatter.skill.id).toBe('skill-1');
    expect(result[1]?.frontmatter.skill.id).toBe('skill-2');
  });

  it('should handle empty skill list', () => {
    // Given an empty list
    const result = loadSkills([], testDir);

    // When loading
    // Then should return empty array
    expect(result).toEqual([]);
  });

  it('should throw error if any skill fails to load', () => {
    // Given one valid and one non-existent skill
    const skill1 = `---
skill:
  id: skill-1
  name: Skill 1
  description: Test
---
Test`;

    writeFileSync(join(testDir, 'skill1.md'), skill1);

    // When loading with non-existent file
    // Then should throw error
    expect(() => loadSkills(['skill1.md', 'missing.md'], testDir)).toThrow(
      /Failed to load skill missing.md/,
    );
  });

  it('should propagate validation errors from individual skills', () => {
    // Given one valid and one invalid skill
    const skill1 = `---
skill:
  id: skill-1
  name: Skill 1
  description: Test
---
Test`;

    const skill2Invalid = `---
skill:
  name: Skill 2
  description: Test
---
Test`;

    writeFileSync(join(testDir, 'skill1.md'), skill1);
    writeFileSync(join(testDir, 'skill2.md'), skill2Invalid);

    // When loading
    // Then should throw validation error
    expect(() => loadSkills(['skill1.md', 'skill2.md'], testDir)).toThrow(
      /Failed to load skill skill2.md/,
    );
  });
});
