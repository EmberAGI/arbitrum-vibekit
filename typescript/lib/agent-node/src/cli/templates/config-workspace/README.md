# Agent Configuration

This directory contains the config workspace for your agent.

## Structure

- `agent.md` - Agent base with A2A card and system prompt
- `agent.manifest.json` - Skill ordering and merge policies
- `skills/` - Individual skill markdown files
- `mcp.json` - MCP server registry
- `workflow.json` - Workflow plugin registry
- `workflows/` - Custom workflow plugin implementations

## Usage

### Development

Start the server with hot reload:

```bash
NODE_ENV=development pnpm start
```

### Print Configuration

View the composed configuration:

```bash
npx -y @emberai/agent-node print-config
```

### Validate Configuration

Check for errors and conflicts:

```bash
npx -y @emberai/agent-node doctor
```

## Environment Variables

MCP servers may reference environment variables using the `$env:VAR_NAME` syntax in their configuration. For example:

```json
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
```

Add required variables to your `.env` file:

```bash
MY_API_KEY=your-api-key-here
```

## Adding Skills

1. Create a new skill file in `skills/` directory
2. Add the skill path to `agent.manifest.json` skills array
3. The skill will be automatically composed into the agent

Example skill structure:

```yaml
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
```

## Adding MCP Servers

1. Add server configuration to `mcp.json`
2. Reference the server in skill frontmatter MCP config
3. Allowed tools can be scoped per skill

Supported transport types:

- **stdio**: Local process communication (e.g., `npx mcp-fetch-server`)
- **http**: Remote HTTP servers (e.g., `https://api.emberai.xyz/mcp`)

## Adding Workflows

1. Create a workflow plugin in `workflows/` directory
2. Add workflow entry to `workflow.json`
3. Reference the workflow in skill frontmatter workflow config

Example workflow plugin (TypeScript ESM):

```typescript
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
```

The included `example-workflow` demonstrates:

- Status updates and lifecycle management
- Multiple artifact generation
- User confirmation pauses with schema validation

## Tool Naming Convention

All MCP tools follow the canonical naming format:

- **Format**: `server_name__tool_name` (double underscore separator)
- **Allowed characters**: lowercase letters (a-z), digits (0-9), underscores (\_)
- **Example**: `fetch__fetch_json`, `ember_onchain_actions__swap_tokens`

Tool names must be unique across all MCP servers.

## Troubleshooting

### Hot Reload Not Working

- Ensure you started with `NODE_ENV=development pnpm start`
- Check file watcher permissions
- Verify no syntax errors in modified files

### MCP Server Connection Failed

- Check server command is installed (`npx` packages)
- Verify environment variables are set
- Check server logs for errors
- For HTTP servers, verify URL is accessible

### Workflow Not Found

- Ensure workflow is listed in `workflow.json`
- Verify `enabled: true` in workflow entry
- Check skill includes workflow ID in `workflows.include`
- Verify workflow plugin exports default
