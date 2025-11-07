/**
 * CLI Command: agent init
 * Scaffolds a new config workspace with sample files
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import prompts, { type PromptObject } from 'prompts';

import { cliOutput } from '../output.js';

const envExamplePath = fileURLToPath(new URL('../../../.env.example', import.meta.url));

export interface InitOptions {
  target?: string;
  force?: boolean;
  yes?: boolean;
  nonInteractive?: boolean;
}

// AI Provider configurations with model suggestions
const AI_PROVIDERS = {
  openrouter: {
    label: 'OpenRouter (recommended)',
    defaultModel: 'openai/gpt-5',
    envKey: 'OPENROUTER_API_KEY',
    models: [
      'openai/gpt-5',
      'anthropic/claude-opus-4',
      'google/gemini-2.5-flash',
      'x-ai/grok-4-fast',
    ],
  },
  anthropic: {
    label: 'Anthropic',
    defaultModel: 'claude-sonnet-4.5',
    envKey: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-4.5', 'claude-opus-4-1', 'claude-haiku-4-5'],
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'],
  },
} as const;

const DEFAULT_MODEL_PARAMS = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1.0,
  reasoning: 'low',
} as const;

const DEFAULT_AGENT_VERSION = '1.0.0';

// Chain configurations
const CHAINS = {
  1: { name: 'Ethereum Mainnet', shortName: 'Ethereum' },
  8453: { name: 'Base', shortName: 'Base' },
  11155111: { name: 'Ethereum Sepolia', shortName: 'Sepolia' },
  42161: { name: 'Arbitrum One', shortName: 'Arbitrum' },
} as const;

type ProviderKey = keyof typeof AI_PROVIDERS;

/**
 * Interface for collected init configuration
 */
interface InitConfig {
  agentName: string;
  agentDescription: string;
  agentVersion: string;
  providerName?: string;
  providerUrl?: string;
  agentBaseUrl: string;
  aiProvider: ProviderKey;
  aiModel: string;
  enableErc8004: boolean;
  canonicalChain: number;
  mirrorChains: number[];
  operatorAddress?: string;
  secrets: Record<string, string>;
}

interface InitPromptResponses {
  agentName?: string;
  agentDescription?: string;
  providerName?: string;
  providerUrl?: string;
  agentBaseUrl?: string;
  aiProvider?: ProviderKey;
  aiModel?: string;
  providerApiKey?: string;
  enableErc8004?: boolean;
  canonicalChain?: number;
  mirrorChains?: number[];
  operatorAddress?: string;
  pinataJwt?: string;
  pinataGateway?: string;
}

/**
 * Render `agent.md` template with placeholders and ERC-8004 toggle.
 */
export function renderAgentMdTemplate(tpl: string, config: InitConfig): string {
  // Basic replacements
  const baseMap: Record<string, string> = {
    __AGENT_NAME__: config.agentName,
    __AGENT_DESCRIPTION__: config.agentDescription,
    __AGENT_VERSION__: config.agentVersion,
    __AGENT_BASE_URL__: config.agentBaseUrl,
    __AI_PROVIDER__: String(config.aiProvider),
    __AI_MODEL__: String(config.aiModel),
    __PROVIDER_NAME__: config.providerName ?? '',
    __PROVIDER_URL__: config.providerUrl ?? '',
  };
  let rendered = tpl.replace(/__([A-Z0-9_]+)__/g, (_m, key) => {
    const v = baseMap[`__${key}__`];
    return v !== undefined ? v : `__${key}__`;
  });

  // Provider block toggle
  {
    const PROVIDER_BLOCK =
      /^[ \t]*#\s*PROVIDER:START[^\n]*\n([\s\S]*?)^[ \t]*#\s*PROVIDER:END[^\n]*\n?/m;
    if (config.providerName) {
      rendered = rendered.replace(PROVIDER_BLOCK, (_m, inner) => {
        let block = inner;
        if (!config.providerUrl) {
          block = block.replace(/^[ \t]*url:\s*['"].*?['"].*\n/m, '');
        }
        return block;
      });
    } else {
      rendered = rendered.replace(PROVIDER_BLOCK, '');
    }
  }

  // ERC-8004 block handling
  if (config.enableErc8004) {
    const mirrors =
      config.mirrorChains.length > 0
        ? config.mirrorChains.map((c) => `- { chainId: ${c} }`).join('\n    ')
        : '[]';

    const operatorLine = config.operatorAddress
      ? `operatorAddress: '${config.operatorAddress}'`
      : `## operatorAddress: '0x...' # optional, used to compute canonicalCaip10`;

    // Fill ERC placeholders inside commented block
    rendered = rendered
      .replace(/__ERC8004_CANONICAL_CHAIN__/g, String(config.canonicalChain))
      .replace(/__ERC8004_MIRRORS__/g, mirrors)
      .replace(/__OPERATOR_ADDRESS_LINE__/g, operatorLine);

    // Uncomment lines within ERC8004 block by removing a single leading "# " or "#"
    rendered = rendered.replace(
      /^[ \t]*#\s*ERC8004:START[^\n]*\n([\s\S]*?)^[ \t]*#\s*ERC8004:END[^\n]*\n?/m,
      (_m, inner) => {
        const uncommented = inner
          .split('\n')
          .map((line: string) => line.replace(/^[ \t]*# ?/, ''))
          .join('\n');
        return `${uncommented}`;
      },
    );
  } else {
    // Leave the commented block for discoverability
  }

  return rendered;
}

/**
 * Remove TypeScript suppression comments from template content.
 */
function stripTsSuppressions(content: string): string {
  return content
    .replace(/^[ \t]*\/\/[ \t]*@ts-ignore.*\n/gm, '')
    .replace(/^[ \t]*\/\/[ \t]*@ts-expect-error.*\n/gm, '');
}

/**
 * Helper to load template files relative to this module URL.
 */
function loadTemplate(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  try {
    const targetDir = resolve(process.cwd(), options.target ?? 'config');

    // Check if target already exists
    if (existsSync(targetDir) && !options.force) {
      throw new Error(
        `Directory already exists: ${targetDir}\nUse --force to overwrite existing directory`,
      );
    }

    const isInteractive =
      !options.yes && !options.nonInteractive && process.stdin.isTTY && process.stdout.isTTY;

    let config: InitConfig;

    if (isInteractive) {
      // Interactive mode - collect configuration via prompts
      cliOutput.print('\n🚀 Welcome to Agent Node Setup!\n', 'cyan');
      cliOutput.print("Let's configure your agent step by step.\n");

      const questions: Array<PromptObject<InitPromptResponses>> = [
        // Agent basics
        {
          type: 'text',
          name: 'agentName',
          message: 'Agent name:',
          initial: 'My Agent',
        },
        {
          type: 'text',
          name: 'agentDescription',
          message: 'Agent description:',
          initial: 'An AI agent built with the config-driven composition system',
        },
        {
          type: 'text',
          name: 'providerName',
          message: 'Provider name (optional):',
          initial: 'Ember AI',
        },
        {
          type: 'text',
          name: 'providerUrl',
          message: 'Provider URL (optional):',
          initial: 'https://emberai.xyz/',
        },
        {
          type: 'text',
          name: 'agentBaseUrl',
          message: 'Public base URL:',
          initial: 'http://localhost:3000',
        },

        // AI configuration
        {
          type: 'select',
          name: 'aiProvider',
          message: 'AI provider:',
          choices: Object.entries(AI_PROVIDERS).map(([key, value]) => ({
            title: value.label,
            value: key,
          })),
          initial: 0, // openrouter
        },
        {
          type: 'autocomplete',
          name: 'aiModel',
          message: 'AI model:',
          choices: (prev: ProviderKey) =>
            AI_PROVIDERS[prev].models.map((model) => ({ title: model, value: model })),
          initial: (prev: ProviderKey) => AI_PROVIDERS[prev].defaultModel,
        },

        // API keys
        {
          type: (_prev, _values) => 'password',
          name: 'providerApiKey',
          message: (_prev, values: InitPromptResponses) =>
            `${AI_PROVIDERS[values?.aiProvider ?? 'openrouter'].envKey} (press Enter to skip):`,
        },

        // ERC-8004 configuration
        {
          type: 'confirm',
          name: 'enableErc8004',
          message: 'Enable ERC-8004 agent registration?',
          initial: true,
        },
        {
          type: (prev) => (prev ? 'select' : null),
          name: 'canonicalChain',
          message: 'Canonical chain for ERC-8004:',
          choices: Object.entries(CHAINS).map(([id, info]) => ({
            title: info.name,
            value: parseInt(id, 10),
          })),
          initial: 3, // Arbitrum One
        },
        {
          type: (_prev, values: InitPromptResponses) =>
            values?.enableErc8004 ? 'multiselect' : null,
          name: 'mirrorChains',
          message: 'Mirror chains (use Space to select, Enter to confirm):',
          choices: (_prev, values: InitPromptResponses) =>
            Object.entries(CHAINS)
              .filter(([id]) => {
                const canonical = values?.canonicalChain;
                return canonical === undefined || parseInt(id, 10) !== canonical;
              })
              .map(([id, info]) => ({
                title: info.name,
                value: parseInt(id, 10),
                selected: parseInt(id, 10) === 1 || parseInt(id, 10) === 8453, // Default: Ethereum + Base
              })),
        },
        {
          type: (_prev, values: InitPromptResponses) => (values?.enableErc8004 ? 'text' : null),
          name: 'operatorAddress',
          message:
            "Operator address (wallet that controls the agent's identity, optional for CAIP-10):",
          validate: (value: string) => {
            if (!value) return true;
            return /^0x[a-fA-F0-9]{40}$/.test(value) ? true : 'Must be a valid Ethereum address';
          },
        },
        {
          type: (_prev, values: InitPromptResponses) => (values?.enableErc8004 ? 'password' : null),
          name: 'pinataJwt',
          message: 'PINATA_JWT (for IPFS uploads, press Enter to skip):',
        },
        {
          type: (_prev, values: InitPromptResponses) => (values?.enableErc8004 ? 'text' : null),
          name: 'pinataGateway',
          message: 'PINATA_GATEWAY (press Enter to skip):',
        },
      ];

      const responses: InitPromptResponses = await prompts<InitPromptResponses>(questions);

      // Handle user cancellation (Ctrl+C)
      if (Object.keys(responses).length === 0) {
        cliOutput.print('\n❌ Setup cancelled by user\n');
        return;
      }

      // Build config from responses
      const {
        agentName,
        agentDescription,
        providerName,
        providerUrl,
        agentBaseUrl,
        aiProvider,
        aiModel,
        providerApiKey,
        enableErc8004,
        canonicalChain,
        mirrorChains,
        operatorAddress,
        pinataJwt,
        pinataGateway,
      } = responses;

      const selectedProvider = aiProvider ?? 'openrouter';
      config = {
        agentName: agentName || 'My Agent',
        agentDescription:
          agentDescription || 'An AI agent built with the config-driven composition system',
        agentVersion: DEFAULT_AGENT_VERSION,
        providerName: providerName || undefined,
        providerUrl: providerUrl || undefined,
        agentBaseUrl: agentBaseUrl || 'http://localhost:3000',
        aiProvider: selectedProvider,
        aiModel: aiModel || AI_PROVIDERS[selectedProvider].defaultModel,
        enableErc8004: enableErc8004 ?? true,
        canonicalChain: canonicalChain ?? 42161,
        mirrorChains: mirrorChains ?? [],
        operatorAddress: operatorAddress || undefined,
        secrets: {},
      };

      // Collect secrets
      if (providerApiKey) {
        config.secrets[AI_PROVIDERS[config.aiProvider].envKey] = providerApiKey;
      }
      if (config.enableErc8004) {
        if (pinataJwt) {
          config.secrets['PINATA_JWT'] = pinataJwt;
        }
        if (pinataGateway) {
          config.secrets['PINATA_GATEWAY'] = pinataGateway;
        }
      }
    } else {
      // Non-interactive mode - use defaults
      config = {
        agentName: 'My Agent',
        agentDescription: 'An AI agent built with the config-driven composition system',
        agentVersion: DEFAULT_AGENT_VERSION,
        providerName: 'Ember AI',
        providerUrl: 'https://emberai.xyz/',
        agentBaseUrl: 'http://localhost:3000',
        aiProvider: 'openrouter',
        aiModel: 'openai/gpt-5',
        enableErc8004: true,
        canonicalChain: 42161,
        mirrorChains: [1, 8453],
        operatorAddress: undefined,
        secrets: {},
      };
    }

    cliOutput.print(`\n📁 Initializing config workspace at ${targetDir}\n`);

    // Create directory structure
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(resolve(targetDir, 'skills'), { recursive: true });
    mkdirSync(resolve(targetDir, 'workflows'), { recursive: true });

    // Write files from templates
    const agentTemplate = loadTemplate('../templates/config-workspace/agent.md');
    const agentMd = renderAgentMdTemplate(agentTemplate, config);
    writeFileSync(resolve(targetDir, 'agent.md'), agentMd);

    writeFileSync(
      resolve(targetDir, 'agent.manifest.json'),
      loadTemplate('../templates/config-workspace/agent.manifest.json'),
    );
    writeFileSync(
      resolve(targetDir, 'mcp.json'),
      loadTemplate('../templates/config-workspace/mcp.json'),
    );
    writeFileSync(
      resolve(targetDir, 'workflow.json'),
      loadTemplate('../templates/config-workspace/workflow.json'),
    );
    writeFileSync(
      resolve(targetDir, 'README.md'),
      loadTemplate('../templates/config-workspace/README.md'),
    );
    writeFileSync(
      resolve(targetDir, 'skills', 'general-assistant.md'),
      loadTemplate('../templates/config-workspace/skills/general-assistant.md'),
    );
    writeFileSync(
      resolve(targetDir, 'skills', 'ember-onchain-actions.md'),
      loadTemplate('../templates/config-workspace/skills/ember-onchain-actions.md'),
    );
    // Workflow samples
    mkdirSync(resolve(targetDir, 'workflows', 'sample-package', 'src'), { recursive: true });
    mkdirSync(resolve(targetDir, 'workflows', 'simple-script'), { recursive: true });
    writeFileSync(
      resolve(targetDir, 'workflows', 'sample-package', 'package.json'),
      loadTemplate('../templates/config-workspace/workflows/sample-package/package.json'),
    );
    {
      const sampleIndex = loadTemplate(
        '../templates/config-workspace/workflows/sample-package/src/index.ts',
      );
      writeFileSync(
        resolve(targetDir, 'workflows', 'sample-package', 'src', 'index.ts'),
        stripTsSuppressions(sampleIndex),
      );
    }
    writeFileSync(
      resolve(targetDir, 'workflows', 'simple-script', 'hello.js'),
      loadTemplate('../templates/config-workspace/workflows/simple-script/hello.js'),
    );

    cliOutput.success('Created `agent.md`');
    cliOutput.success('Created `agent.manifest.json`');
    cliOutput.success('Created `mcp.json`');
    cliOutput.success('Created `workflow.json`');
    cliOutput.success('Created `README.md`');
    cliOutput.success('Created `skills/` directory');
    cliOutput.success('Created `skills/general-assistant.md`');
    cliOutput.success('Created `skills/ember-onchain-actions.md`');
    cliOutput.success('Created `workflows/` directory');
    cliOutput.success('Created `workflows/sample-package/` TypeScript workflow');
    cliOutput.success('Created `workflows/simple-script/` JavaScript workflow');

    // Handle .env file
    const envPath = resolve(dirname(targetDir), '.env');
    let existingEnv = '';

    if (existsSync(envPath)) {
      if (!options.force) {
        cliOutput.info('`.env` already exists, updating with new secrets...');
        existingEnv = readFileSync(envPath, 'utf-8');
      } else {
        copyFileSync(envExamplePath, envPath);
        existingEnv = readFileSync(envPath, 'utf-8');
        cliOutput.success('Created `.env` (overwritten with --force)');
      }
    } else {
      copyFileSync(envExamplePath, envPath);
      existingEnv = readFileSync(envPath, 'utf-8');
      cliOutput.success('Created `.env`');
    }

    // Parse existing env to identify keys with values
    const existingKeys = new Map<string, string>();
    const envLines = existingEnv.split('\n');
    for (const line of envLines) {
      const match = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
      if (match && match[1]) {
        const key = match[1];
        const value = match[2] || '';
        existingKeys.set(key, value);
      }
    }

    // Build updated env content
    const updatedLines: string[] = [];
    const processedKeys = new Set<string>();
    let hasUpdates = false;

    // Process existing lines, updating empty values with wizard inputs
    for (const line of envLines) {
      const match = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
      if (match && match[1]) {
        const key = match[1];
        const existingValue = match[2] || '';
        processedKeys.add(key);

        // Check if we have a new value from the wizard for this key
        if (config.secrets[key] && (!existingValue || existingValue.trim() === '')) {
          // Replace empty value with wizard input
          updatedLines.push(`${key}=${config.secrets[key]}`);
          hasUpdates = true;
        } else {
          // Keep existing line as-is (preserves non-empty values)
          updatedLines.push(line);
        }
      } else {
        // Keep non-key lines (comments, empty lines) as-is
        updatedLines.push(line);
      }
    }

    // Add new keys from wizard that don't exist in file
    const newKeys: string[] = [];
    for (const [key, value] of Object.entries(config.secrets)) {
      if (!processedKeys.has(key)) {
        newKeys.push(`${key}=${value}`);
        hasUpdates = true;
      }
    }

    // Add placeholders for missing keys
    const placeholders = [
      'OPENROUTER_API_KEY',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'PINATA_JWT',
      'PINATA_GATEWAY',
    ];

    for (const placeholder of placeholders) {
      if (!processedKeys.has(placeholder) && !config.secrets[placeholder]) {
        newKeys.push(`${placeholder}=`);
        hasUpdates = true;
      }
    }

    if (hasUpdates) {
      // Combine updated lines with new keys
      let finalContent = updatedLines.join('\n');
      if (newKeys.length > 0) {
        // Ensure proper line ending before appending new keys
        if (!finalContent.endsWith('\n')) {
          finalContent += '\n';
        }
        finalContent += newKeys.join('\n') + '\n';
      }

      writeFileSync(envPath, finalContent);

      // Count what was actually updated/added
      const updatedCount = Object.entries(config.secrets).filter(
        ([key, value]) => value && existingKeys.has(key) && !existingKeys.get(key),
      ).length;
      const addedCount = Object.entries(config.secrets).filter(
        ([key, value]) => value && !existingKeys.has(key),
      ).length;
      const placeholderCount = placeholders.filter(
        (p) => !processedKeys.has(p) && !config.secrets[p],
      ).length;

      if (updatedCount > 0 || addedCount > 0 || placeholderCount > 0) {
        const parts: string[] = [];
        if (updatedCount > 0) parts.push(`${updatedCount} updated`);
        if (addedCount > 0) parts.push(`${addedCount} added`);
        if (placeholderCount > 0) parts.push(`${placeholderCount} placeholder(s)`);
        cliOutput.success(`Updated \`.env\` (${parts.join(', ')})`);
      }
    }

    cliOutput.blank();
    cliOutput.print('✅ Config workspace initialized successfully!', 'cyan');
    cliOutput.blank();
    cliOutput.print('**Next steps:**');
    if (Object.keys(config.secrets).length < placeholders.length) {
      cliOutput.print('  1. Review `.env` and add any missing API keys');
    } else {
      cliOutput.print('  1. Review `config/agent.md` to verify your configuration');
    }
    cliOutput.print('  2. Customize `config/skills/general-assistant.md` or add more skills');
    cliOutput.print('  3. Run: `npx -y @emberai/agent-node doctor`');
    cliOutput.print('  4. Run: `npx -y @emberai/agent-node`');
    cliOutput.blank();
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}
