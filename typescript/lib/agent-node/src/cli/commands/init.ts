/**
 * CLI Command: agent init
 * Scaffolds a new config workspace with sample files
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cliOutput } from '../output.js';

export interface InitOptions {
  target?: string;
  force?: boolean;
}

const SAMPLE_AGENT_MD = `---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'My Agent'
  description: 'An AI agent built with the config-driven composition system'
  url: 'http://localhost:3000/a2a'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'Ember AI'
    url: 'https://emberai.xyz/'
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json', 'text/plain']

# Agent-level model configuration (default for all skills)
model:
  provider: openrouter
  name: anthropic/claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1.0
    reasoning: low
---

You are a helpful AI agent with modular skills.

Your primary purpose is to assist users with their requests using the tools and capabilities available to you.

## Core Instructions

- Be helpful, accurate, and concise
- Use available tools when appropriate
- Maintain conversation context across messages
- Follow the specific instructions provided by activated skills
`;

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

# Optional: Uncomment to override model for this skill
# model:
#   provider: openrouter
#   name: anthropic/claude-sonnet-4.5
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
- Progress tracking and status updates
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
# Optional: Uncomment to override model for this skill
# model:
#   provider: openrouter
#   name: anthropic/claude-sonnet-4.5
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

const SAMPLE_WORKFLOW_TS = `import type { Artifact, Message } from '@a2a-js/sdk';
import { z } from 'zod';

import type { WorkflowPlugin, WorkflowContext, WorkflowState } from '../../src/workflows/types.js';

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
    const startMessage: Message = {
      kind: 'message',
      messageId: 'status-start',
      contextId: context.contextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Starting example workflow processing...' }],
    };

    yield {
      type: 'status',
      status: {
        state: 'working',
        message: startMessage,
      },
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

    // Simulate some work with progress updates
    for (let i = 0; i < (count as number); i++) {
      yield {
        type: 'progress',
        current: i + 1,
        total: count as number,
      };

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
    const pauseMessage: Message = {
      kind: 'message',
      messageId: 'pause-confirmation',
      contextId: context.contextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Please confirm to proceed with final step' }],
    };

    const userInput = (yield {
      type: 'pause',
      status: {
        state: 'input-required',
        message: pauseMessage,
      },
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
    const continueMessage: Message = {
      kind: 'message',
      messageId: 'status-continue',
      contextId: context.contextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Finalizing workflow...' }],
    };

    yield {
      type: 'status',
      status: {
        state: 'working',
        message: continueMessage,
      },
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
    const completeMessage: Message = {
      kind: 'message',
      messageId: 'status-complete',
      contextId: context.contextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Workflow completed successfully' }],
    };

    yield {
      type: 'status',
      status: {
        state: 'completed',
        message: completeMessage,
      },
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
pnpm agent print-config
\`\`\`

### Validate Configuration

Check for errors and conflicts:

\`\`\`bash
pnpm agent doctor
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
import type { WorkflowPlugin } from '../../src/workflows/types.js';
import { z } from 'zod';

const plugin: WorkflowPlugin = {
  id: 'my-workflow',
  name: 'My Workflow',
  description: 'What this workflow does',
  version: '1.0.0',
  inputSchema: z.object({ /* ... */ }),
  async *execute(context) {
    // Yield status updates, artifacts, and progress
    yield { type: 'status', status: { state: 'working', message: /* ... */ } };
    yield { type: 'artifact', artifact: /* ... */ };
    yield { type: 'progress', current: 1, total: 10 };

    // Optionally pause for user input
    const input = yield { type: 'pause', inputSchema: /* ... */ };

    return { success: true };
  },
};

export default plugin;
\`\`\`

The included \`example-workflow\` demonstrates:
- Status updates and lifecycle management
- Multiple artifact generation
- Progress tracking
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

export function initCommand(options: InitOptions = {}): Promise<void> {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    try {
      const targetDir = resolve(process.cwd(), options.target ?? 'config');

      // Check if target already exists
      if (existsSync(targetDir) && !options.force) {
        throw new Error(
          `Directory already exists: ${targetDir}\nUse --force to overwrite existing directory`,
        );
      }

      cliOutput.print(`Initializing config workspace at ${targetDir}`);

      // Create directory structure
      mkdirSync(targetDir, { recursive: true });
      mkdirSync(resolve(targetDir, 'skills'), { recursive: true });
      mkdirSync(resolve(targetDir, 'workflows'), { recursive: true });

      // Write sample files
      writeFileSync(resolve(targetDir, 'agent.md'), SAMPLE_AGENT_MD);
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

      cliOutput.blank();
      cliOutput.print('Config workspace initialized successfully!', 'cyan');
      cliOutput.blank();
      cliOutput.print('**Next steps:**');
      cliOutput.print('  1. Edit `config/agent.md` to customize your agent');
      cliOutput.print('  2. Customize `config/skills/general-assistant.md` or add more skills');
      cliOutput.print('  3. Run: `pnpm agent doctor`');
      cliOutput.print('  4. Run: `pnpm agent run --dev`');

      resolvePromise();
    } catch (error) {
      rejectPromise(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
