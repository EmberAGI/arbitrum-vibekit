/**
 * CLI Command: agent init
 * Scaffolds a new config workspace with sample files
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import prompts from 'prompts';

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

/**
 * Generate agent.md content from collected configuration
 */
function generateAgentMd(config: InitConfig): string {
  const erc8004Block = config.enableErc8004
    ? `
# ERC-8004 configuration
erc8004:
  enabled: true
  canonical:
    chainId: ${config.canonicalChain}${config.operatorAddress ? `\n    operatorAddress: '${config.operatorAddress}'` : "\n    # operatorAddress: '0x...' # optional, used to compute canonicalCaip10"}
  mirrors:${
    config.mirrorChains.length > 0
      ? config.mirrorChains.map((chain) => `\n    - { chainId: ${chain} }`).join('')
      : ' []'
  }
  identityRegistries:
    '1': '0x0000000000000000000000000000000000000000'
    '8453': '0x0000000000000000000000000000000000000000'
    '11155111': '0x8004a6090Cd10A7288092483047B097295Fb8847'
    '42161': '0x0000000000000000000000000000000000000000'
`
    : '';

  return `---
version: 1
card:
  protocolVersion: '0.3.0'
  name: '${config.agentName}'
  description: '${config.agentDescription}'
  url: '${config.agentBaseUrl}/a2a'
  version: '${config.agentVersion}'
  capabilities:
    streaming: true
    pushNotifications: false${config.providerName ? `\n  provider:\n    name: '${config.providerName}'${config.providerUrl ? `\n    url: '${config.providerUrl}'` : ''}` : ''}
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json', 'text/plain']

# Agent-level AI configuration (default for all skills)
ai:
  modelProvider: ${config.aiProvider}
  model: ${config.aiModel}
  params:
    temperature: ${DEFAULT_MODEL_PARAMS.temperature}
    maxTokens: ${DEFAULT_MODEL_PARAMS.maxTokens}
    topP: ${DEFAULT_MODEL_PARAMS.topP}
    reasoning: ${DEFAULT_MODEL_PARAMS.reasoning}

# Agent Card hosting configuration
routing:
  agentCardPath: '/.well-known/agent-card.json'
  # agentCardOrigin: 'https://example.com' # optional origin override
${erc8004Block}---

You are a helpful AI agent with modular skills.

Your primary purpose is to assist users with their requests using the tools and capabilities available to you.

## Core Instructions

- Be helpful, accurate, and concise
- Use available tools when appropriate
- Maintain conversation context across messages
- Follow the specific instructions provided by activated skills
`;
}

const SAMPLE_GENERAL_SKILL = `---
skill:
  id: general-assistant
  name: General Assistant
  description: 'A general-purpose skill for helping users with common tasks'
  tags: [general, assistant]
  examples:
    - 'Help me with a task'
    - 'Answer my questions'
    - 'Execute example workflow'
  inputModes: ['text/plain']
  outputModes: ['text/plain', 'application/json']

# MCP server integration
mcp:
  servers:
    - name: fetch
      allowedTools: [fetch_json, fetch_txt, fetch_markdown]

# Workflow integration
workflows:
  include: ['example-workflow']

# Optional: Uncomment to override AI model for this skill
# ai:
#   modelProvider: openrouter
#   model: openai/gpt-5
#   params:
#     temperature: 0.7
#     reasoning: low

---

You are a general-purpose assistant skill. Your role is to help users accomplish their goals by:

- Answering questions clearly and accurately
- Breaking down complex tasks into manageable steps
- Providing helpful suggestions and guidance
- Using available tools and resources effectively
- Executing workflows for multi-step operations

When a task requires multiple coordinated steps, you can leverage the example workflow which demonstrates:
- Status updates and lifecycle management
- Artifact generation for structured outputs
- User interaction and confirmation flows
- Structured result aggregation

Always be helpful, clear, and professional in your responses.
`;

const SAMPLE_EMBER_SKILL = `---
skill:
  id: ember-onchain-actions
  name: Ember Onchain Actions
  description: 'Execute blockchain transactions and queries using Ember AI'
  tags: [blockchain, web3, transactions]
  examples:
    - 'Swap tokens on Arbitrum'
    - 'Check my wallet balance'
    - 'Bridge assets across chains'
  inputModes: ['text/plain', 'application/json']
  outputModes: ['text/plain', 'application/json']

# MCP server integration
mcp:
  servers:
    - name: ember_onchain_actions
      allowedTools: [createSwap, possibleSwaps]
# Optional: Uncomment to override AI model for this skill
# ai:
#   modelProvider: openrouter
#   model: openai/gpt-5
#   params:
#     temperature: 0.7
#     reasoning: low

---

You are the Ember Onchain Actions skill. Your role is to help users interact with blockchain networks by:

- Executing token swaps and transfers
- Querying wallet balances and transaction history
- Bridging assets across different blockchain networks
- Providing real-time blockchain data and insights

Use the Ember AI MCP server tools to perform blockchain operations safely and efficiently.

When executing transactions:
- Always confirm transaction details with the user before execution
- Provide clear explanations of gas fees and expected outcomes
- Monitor transaction status and provide updates
- Handle errors gracefully and suggest alternatives when needed

Be precise, security-conscious, and user-friendly in all blockchain interactions.
`;

const SAMPLE_WORKFLOW_TS = `import {
  z,
  type Artifact,
  type WorkflowContext,
  type WorkflowPlugin,
  type WorkflowState,
} from '@emberai/agent-node/workflow';

const plugin: WorkflowPlugin = {
  id: 'example-workflow',
  name: 'Example Workflow',
  description:
    'A comprehensive workflow example demonstrating A2A patterns, pause/resume, multiple artifacts, and lifecycle management',
  version: '1.0.0',

  inputSchema: z.object({
    message: z.string().optional(),
    count: z.number().int().positive().optional().default(1),
  }),

  async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
    const { message = 'Hello from example workflow!', count = 1 } = context.parameters ?? {};

    // Status: Starting workflow
    yield {
      type: 'status-update',
      message: 'Starting example workflow processing...',
    };

    // Artifact 1: Initial configuration summary
    const configArtifact: Artifact = {
      artifactId: 'config-summary',
      name: 'config-summary.json',
      description: 'Workflow configuration and parameters',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify({
            workflowId: context.taskId,
            message,
            count,
            startedAt: new Date().toISOString(),
          }),
        },
      ],
    };
    yield { type: 'artifact', artifact: configArtifact };

    // Simulate some work
    for (let i = 0; i < (count as number); i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Artifact 2: Processing result
    const processingArtifact: Artifact = {
      artifactId: 'processing-result',
      name: 'processing-result.json',
      description: 'Intermediate processing results',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify({
            status: 'processed',
            iterations: count,
            processedAt: new Date().toISOString(),
          }),
        },
      ],
    };
    yield { type: 'artifact', artifact: processingArtifact };

    // Pause for user confirmation
    const userInput = (yield {
      type: 'interrupted',
      reason: 'input-required',
      message: 'Please confirm to proceed with final step',
      inputSchema: z.object({
        confirmed: z.boolean(),
        notes: z.string().optional(),
        timestamp: z
          .string()
          .regex(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}/, 'Must be ISO 8601 timestamp format')
          .optional(),
      }),
    }) as { confirmed?: boolean; notes?: string; timestamp?: string } | undefined;

    // Continue after confirmation
    yield {
      type: 'status-update',
      message: 'Finalizing workflow...',
    };

    // Artifact 3: Final result with user confirmation
    const finalArtifact: Artifact = {
      artifactId: 'final-result',
      name: 'final-result.json',
      description: 'Final workflow result including user confirmation',
      parts: [
        {
          kind: 'text',
          text: JSON.stringify({
            message,
            count,
            confirmed: userInput?.confirmed ?? false,
            userNotes: userInput?.notes,
            userTimestamp: userInput?.timestamp,
            completedAt: new Date().toISOString(),
          }),
        },
      ],
    };
    yield { type: 'artifact', artifact: finalArtifact };

    // Final status
    yield {
      type: 'status-update',
      message: 'Workflow completed successfully',
    };

    // Return structured result
    return {
      success: true,
      workflowId: context.taskId,
      message,
      count,
      userConfirmed: userInput?.confirmed ?? false,
      artifactsGenerated: 3,
      completedAt: new Date().toISOString(),
    };
  },
};

export default plugin;
`;

const SAMPLE_MANIFEST = `{
  "version": 1,
  "skills": [
    "./skills/general-assistant.md",
    "./skills/ember-onchain-actions.md"
  ],
  "registries": {
    "mcp": "./mcp.json",
    "workflows": "./workflow.json"
  },
  "merge": {
    "card": {
      "capabilities": "union",
      "toolPolicies": "intersect",
      "guardrails": "tightest"
    }
  }
}
`;

const SAMPLE_MCP_JSON = `{
  "mcpServers": {
    "fetch": {
      "type": "stdio",
      "command": "npx",
      "args": ["mcp-fetch-server"],
      "env": {
        "DEFAULT_LIMIT": "50000"
      }
    },
    "ember_onchain_actions": {
      "type": "http",
      "url": "https://api.emberai.xyz/mcp",
      "headers": {
        "X-Ember-Api-Version": "current"
      }
    }
  }
}
`;

const SAMPLE_WORKFLOW_JSON = `{
  "workflows": [
    {
      "id": "example-workflow",
      "from": "./workflows/example-workflow.ts",
      "enabled": true,
      "config": {
        "mode": "default"
      }
    }
  ]
}
`;

const SAMPLE_README = `# Agent Configuration

This directory contains the config workspace for your agent.

## Structure

- \`agent.md\` - Agent base with A2A card and system prompt
- \`agent.manifest.json\` - Skill ordering and merge policies
- \`skills/\` - Individual skill markdown files
- \`mcp.json\` - MCP server registry
- \`workflow.json\` - Workflow plugin registry
- \`workflows/\` - Custom workflow plugin implementations

## Usage

### Development

Start the server with hot reload:

\`\`\`bash
NODE_ENV=development pnpm start
\`\`\`

### Print Configuration

View the composed configuration:

\`\`\`bash
npx -y @emberai/agent-node print-config
\`\`\`

### Validate Configuration

Check for errors and conflicts:

\`\`\`bash
npx -y @emberai/agent-node doctor
\`\`\`

## Environment Variables

MCP servers may reference environment variables using the \`$env:VAR_NAME\` syntax in their configuration. For example:

\`\`\`json
{
  "mcpServers": {
    "my_server": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer $env:MY_API_KEY"
      }
    }
  }
}
\`\`\`

Add required variables to your \`.env\` file:

\`\`\`bash
MY_API_KEY=your-api-key-here
\`\`\`

## Adding Skills

1. Create a new skill file in \`skills/\` directory
2. Add the skill path to \`agent.manifest.json\` skills array
3. The skill will be automatically composed into the agent

Example skill structure:

\`\`\`yaml
---
skill:
  id: my-skill
  name: My Skill
  description: 'What this skill does'
  mcp:
    servers:
      - name: fetch
        allowedTools: [fetch__fetch_json]
  workflows:
    include: ['example-workflow']
---

You are the My Skill. You specialize in...
\`\`\`

## Adding MCP Servers

1. Add server configuration to \`mcp.json\`
2. Reference the server in skill frontmatter MCP config
3. Allowed tools can be scoped per skill

Supported transport types:

- **stdio**: Local process communication (e.g., \`npx mcp-fetch-server\`)
- **http**: Remote HTTP servers (e.g., \`https://api.emberai.xyz/mcp\`)

## Adding Workflows

1. Create a workflow plugin in \`workflows/\` directory
2. Add workflow entry to \`workflow.json\`
3. Reference the workflow in skill frontmatter workflow config

Example workflow plugin (TypeScript ESM):

\`\`\`typescript
import { z, type WorkflowPlugin } from '@emberai/agent-node/workflow';

const plugin: WorkflowPlugin = {
  id: 'my-workflow',
  name: 'My Workflow',
  description: 'What this workflow does',
  version: '1.0.0',
  inputSchema: z.object({ /* ... */ }),
  async *execute(context) {
    // Yield status updates and artifacts
    yield { type: 'status-update', message: 'Processing...' };
    yield { type: 'artifact', artifact: /* ... */ };

    // Optionally pause for user input
    const input = yield { type: 'interrupted', reason: 'input-required', message: /* ... */, inputSchema: /* ... */ };

    return { success: true };
  },
};

export default plugin;
\`\`\`

The included \`example-workflow\` demonstrates:
- Status updates and lifecycle management
- Multiple artifact generation
- User confirmation pauses with schema validation

## Tool Naming Convention

All MCP tools follow the canonical naming format:

- **Format**: \`server_name__tool_name\` (double underscore separator)
- **Allowed characters**: lowercase letters (a-z), digits (0-9), underscores (_)
- **Example**: \`fetch__fetch_json\`, \`ember_onchain_actions__swap_tokens\`

Tool names must be unique across all MCP servers.

## Troubleshooting

### Hot Reload Not Working

- Ensure you started with \`NODE_ENV=development pnpm start\`
- Check file watcher permissions
- Verify no syntax errors in modified files

### MCP Server Connection Failed

- Check server command is installed (\`npx\` packages)
- Verify environment variables are set
- Check server logs for errors
- For HTTP servers, verify URL is accessible

### Workflow Not Found

- Ensure workflow is listed in \`workflow.json\`
- Verify \`enabled: true\` in workflow entry
- Check skill includes workflow ID in \`workflows.include\`
- Verify workflow plugin exports default
`;

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

      const responses = await prompts([
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
          message: (_prev, values) =>
            `${AI_PROVIDERS[values['aiProvider'] as ProviderKey].envKey} (press Enter to skip):`,
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
            value: parseInt(id),
          })),
          initial: 3, // Arbitrum One
        },
        {
          type: (_prev, values) => (values['enableErc8004'] ? 'multiselect' : null),
          name: 'mirrorChains',
          message: 'Mirror chains (use Space to select, Enter to confirm):',
          choices: (_prev, values) =>
            Object.entries(CHAINS)
              .filter(([id]) => parseInt(id) !== values['canonicalChain'])
              .map(([id, info]) => ({
                title: info.name,
                value: parseInt(id),
                selected: parseInt(id) === 1 || parseInt(id) === 8453, // Default: Ethereum + Base
              })),
        },
        {
          type: (_prev, values) => (values['enableErc8004'] ? 'text' : null),
          name: 'operatorAddress',
          message:
            "Operator address (wallet that controls the agent's identity, optional for CAIP-10):",
          validate: (value: string) => {
            if (!value) return true;
            return /^0x[a-fA-F0-9]{40}$/.test(value) ? true : 'Must be a valid Ethereum address';
          },
        },
        {
          type: (_prev, values) => (values['enableErc8004'] ? 'password' : null),
          name: 'pinataJwt',
          message: 'PINATA_JWT (for IPFS uploads, press Enter to skip):',
        },
        {
          type: (_prev, values) => (values['enableErc8004'] ? 'text' : null),
          name: 'pinataGateway',
          message: 'PINATA_GATEWAY (press Enter to skip):',
        },
      ]);

      // Handle user cancellation (Ctrl+C)
      if (Object.keys(responses).length === 0) {
        cliOutput.print('\n❌ Setup cancelled by user\n');
        return;
      }

      // Build config from responses
      const selectedProvider = (responses['aiProvider'] as ProviderKey) || 'openrouter';
      config = {
        agentName: responses['agentName'] || 'My Agent',
        agentDescription:
          responses['agentDescription'] ||
          'An AI agent built with the config-driven composition system',
        agentVersion: DEFAULT_AGENT_VERSION,
        providerName: responses['providerName'] || undefined,
        providerUrl: responses['providerUrl'] || undefined,
        agentBaseUrl: responses['agentBaseUrl'] || 'http://localhost:3000',
        aiProvider: selectedProvider,
        aiModel: responses['aiModel'] || AI_PROVIDERS[selectedProvider].defaultModel,
        enableErc8004: responses['enableErc8004'] ?? true,
        canonicalChain: responses['canonicalChain'] || 42161,
        mirrorChains: responses['mirrorChains'] || [],
        operatorAddress: responses['operatorAddress'] || undefined,
        secrets: {},
      };

      // Collect secrets
      if (responses['providerApiKey']) {
        config.secrets[AI_PROVIDERS[config.aiProvider].envKey] = responses['providerApiKey'];
      }
      if (config.enableErc8004) {
        if (responses['pinataJwt']) {
          config.secrets['PINATA_JWT'] = responses['pinataJwt'];
        }
        if (responses['pinataGateway']) {
          config.secrets['PINATA_GATEWAY'] = responses['pinataGateway'];
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

    // Write files using generated content
    writeFileSync(resolve(targetDir, 'agent.md'), generateAgentMd(config));
    writeFileSync(resolve(targetDir, 'agent.manifest.json'), SAMPLE_MANIFEST);
    writeFileSync(resolve(targetDir, 'mcp.json'), SAMPLE_MCP_JSON);
    writeFileSync(resolve(targetDir, 'workflow.json'), SAMPLE_WORKFLOW_JSON);
    writeFileSync(resolve(targetDir, 'README.md'), SAMPLE_README);
    writeFileSync(resolve(targetDir, 'skills', 'general-assistant.md'), SAMPLE_GENERAL_SKILL);
    writeFileSync(resolve(targetDir, 'skills', 'ember-onchain-actions.md'), SAMPLE_EMBER_SKILL);
    writeFileSync(resolve(targetDir, 'workflows', 'example-workflow.ts'), SAMPLE_WORKFLOW_TS);

    cliOutput.success('Created `agent.md`');
    cliOutput.success('Created `agent.manifest.json`');
    cliOutput.success('Created `mcp.json`');
    cliOutput.success('Created `workflow.json`');
    cliOutput.success('Created `README.md`');
    cliOutput.success('Created `skills/` directory');
    cliOutput.success('Created `skills/general-assistant.md`');
    cliOutput.success('Created `skills/ember-onchain-actions.md`');
    cliOutput.success('Created `workflows/` directory');
    cliOutput.success('Created `workflows/example-workflow.ts`');

    // Handle .env file
    const envPath = resolve(dirname(targetDir), '.env');
    let existingEnv = '';

    if (existsSync(envPath)) {
      if (!options.force) {
        cliOutput.info('`.env` already exists, appending new secrets...');
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

    // Append secrets and placeholders
    const secretsToWrite: string[] = [];

    // Add collected secrets
    for (const [key, value] of Object.entries(config.secrets)) {
      if (!existingEnv.includes(`${key}=`)) {
        secretsToWrite.push(`${key}=${value}`);
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
      if (!existingEnv.includes(`${placeholder}=`) && !config.secrets[placeholder]) {
        secretsToWrite.push(`${placeholder}=`);
      }
    }

    if (secretsToWrite.length > 0) {
      const updated =
        existingEnv && !existingEnv.endsWith('\n')
          ? `${existingEnv}\n${secretsToWrite.join('\n')}\n`
          : `${existingEnv}${secretsToWrite.join('\n')}\n`;
      writeFileSync(envPath, updated);
      cliOutput.success(
        `Updated \`.env\` with ${Object.keys(config.secrets).length} secret(s) and ${secretsToWrite.length - Object.keys(config.secrets).length} placeholder(s)`,
      );
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
