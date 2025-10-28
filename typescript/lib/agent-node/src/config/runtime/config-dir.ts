import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';

interface EphemeralWorkspace {
  baseDir: string;
  configDir: string;
}

interface ResolveConfigDirResult {
  configDir: string;
  isEphemeral: boolean;
}

let cachedEphemeralWorkspace: EphemeralWorkspace | undefined;
let cleanupRegistered = false;

function resolvePath(target: string): string {
  return isAbsolute(target) ? target : resolve(process.cwd(), target);
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function createEphemeralWorkspace(): EphemeralWorkspace {
  const baseDir = mkdtempSync(join(tmpdir(), 'agent-config-'));
  const configDir = join(baseDir, 'config');

  mkdirSync(configDir, { recursive: true });
  mkdirSync(join(configDir, 'skills'), { recursive: true });
  mkdirSync(join(configDir, 'workflows'), { recursive: true });

  const agentMarkdown = `---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'Ephemeral Test Agent'
  description: 'Ephemeral workspace generated for automated tests'
  url: 'http://127.0.0.1:3000/a2a'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'Ephemeral'
    url: 'https://example.test'
  defaultInputModes: ['text/plain']
  defaultOutputModes: ['application/json']

model:
  provider: openrouter
  name: anthropic/claude-sonnet-3.5
  params:
    temperature: 0.7
    maxTokens: 2048
    topP: 1
---

You are an ephemeral test agent used for automated verification.
`;

  writeFileSync(join(configDir, 'agent.md'), agentMarkdown, 'utf8');

  const manifest = {
    version: 1,
    skills: [] as string[],
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

  const mcpRegistry = {
    mcpServers: {},
  };
  writeFileSync(join(configDir, 'mcp.json'), JSON.stringify(mcpRegistry, null, 2), 'utf8');

  const workflowRegistry = {
    workflows: [],
  };
  writeFileSync(
    join(configDir, 'workflow.json'),
    JSON.stringify(workflowRegistry, null, 2),
    'utf8',
  );

  return { baseDir, configDir };
}

function ensureEphemeralWorkspace(): EphemeralWorkspace {
  if (!cachedEphemeralWorkspace) {
    cachedEphemeralWorkspace = createEphemeralWorkspace();

    if (!process.env['AGENT_CONFIG_DIR']) {
      process.env['AGENT_CONFIG_DIR'] = cachedEphemeralWorkspace.configDir;
    }

    if (!cleanupRegistered) {
      cleanupRegistered = true;
      process.once('exit', () => {
        try {
          if (cachedEphemeralWorkspace) {
            rmSync(cachedEphemeralWorkspace.baseDir, { recursive: true, force: true });
          }
        } catch {
          // best-effort cleanup
        }
      });
    }
  }

  return cachedEphemeralWorkspace;
}

export function resolveConfigDirectory(explicit?: string): ResolveConfigDirResult {
  if (explicit) {
    return {
      configDir: resolvePath(explicit),
      isEphemeral: false,
    };
  }

  const envOverride = process.env['AGENT_CONFIG_DIR'];
  if (envOverride) {
    return {
      configDir: resolvePath(envOverride),
      isEphemeral: false,
    };
  }

  const forceEphemeral = isTruthyEnv(process.env['AGENT_EPHEMERAL_CONFIG']);
  const forceRealConfig = isTruthyEnv(process.env['AGENT_USE_REAL_CONFIG']);
  const runningTests =
    process.env['VITEST'] === 'true' || process.env['NODE_ENV']?.toLowerCase() === 'test';

  if (!forceRealConfig && (forceEphemeral || runningTests)) {
    const workspace = ensureEphemeralWorkspace();
    return {
      configDir: workspace.configDir,
      isEphemeral: true,
    };
  }

  return {
    configDir: resolvePath('config'),
    isEphemeral: false,
  };
}
