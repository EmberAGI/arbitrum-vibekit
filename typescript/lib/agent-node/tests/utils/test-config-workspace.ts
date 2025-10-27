import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Creates a minimal config workspace for testing
 * @param options - Optional configuration
 * @returns Path to the created config workspace
 */
export function createTestConfigWorkspace(options?: {
  agentName?: string;
  agentUrl?: string;
  skills?: Array<{ id: string; name: string; mcpServers?: string[] }>;
  mcpServers?: Record<string, unknown>;
}): string {
  const testDir = join(
    tmpdir(),
    `test-config-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const configDir = join(testDir, 'config');
  const skillsDir = join(configDir, 'skills');

  // Create config directory
  mkdirSync(configDir, { recursive: true });

  // Create agent.md with minimal frontmatter
  // Note: 'id' field is NOT part of the official A2A specification v0.3.0
  const agentMd = `---
version: 1
card:
  protocolVersion: '0.3.0'
  name: '${options?.agentName ?? 'Test Agent'}'
  description: 'Test agent for e2e testing'
  url: '${options?.agentUrl ?? 'http://localhost:3000/a2a'}'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'Test Provider'
    url: 'https://example.com'
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json']

model:
  provider: openrouter
  name: anthropic/claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1.0
    reasoning: low
---

You are a test agent for e2e testing.
`;

  writeFileSync(join(configDir, 'agent.md'), agentMd, 'utf8');

  // Create skills if provided
  const skillPaths: string[] = [];
  if (options?.skills && options.skills.length > 0) {
    mkdirSync(skillsDir, { recursive: true });

    for (const skill of options.skills) {
      const skillMd = `---
skill:
  id: ${skill.id}
  name: ${skill.name}
  description: 'Test skill for e2e testing'
  tags: [test]

${skill.mcpServers ? `mcp:\n  servers:\n${skill.mcpServers.map((s) => `    - name: ${s}`).join('\n')}` : ''}
---

Test skill content for ${skill.name}.
`;
      const skillPath = `./skills/${skill.id}.md`;
      writeFileSync(join(configDir, skillPath), skillMd, 'utf8');
      skillPaths.push(skillPath);
    }
  }

  // Create agent.manifest.json
  const manifest = {
    version: 1,
    skills: skillPaths,
    registries: {
      mcp: './mcp.json',
      workflows: './workflow.json',
    },
    merge: {
      card: {
        capabilities: 'union',
        toolPolicies: 'intersect',
        guardrails: 'tightest',
      },
    },
  };

  writeFileSync(join(configDir, 'agent.manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // Create mcp.json with provided servers or empty
  const mcpRegistry = {
    mcpServers: options?.mcpServers ?? {},
  };

  writeFileSync(join(configDir, 'mcp.json'), JSON.stringify(mcpRegistry, null, 2), 'utf8');

  // Create workflow.json with empty workflows
  const workflowRegistry = {
    workflows: [],
  };

  writeFileSync(
    join(configDir, 'workflow.json'),
    JSON.stringify(workflowRegistry, null, 2),
    'utf8',
  );

  return configDir;
}
