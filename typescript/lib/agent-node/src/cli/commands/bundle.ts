/**
 * CLI Command: agent bundle
 * Exports composed configuration as deployment monofile
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadAgentConfig } from '../../config/orchestrator.js';
import { cliOutput } from '../output.js';

export interface BundleOptions {
  configDir?: string;
  output?: string;
  format?: 'json' | 'yaml';
}

/**
 * Redact sensitive environment variable references
 */
function redactEnvRefs(obj: unknown): unknown {
  if (typeof obj === 'string') {
    // Redact $env:* references
    return obj.replace(/\$env:[A-Z_][A-Z0-9_]*/g, '[ENV_REF_REDACTED]');
  }

  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactEnvRefs);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = redactEnvRefs(value);
  }
  return result;
}

export async function bundleCommand(options: BundleOptions = {}): Promise<void> {
  const configDir = resolve(process.cwd(), options.configDir ?? 'config');
  const manifestPath = resolve(configDir, 'agent.manifest.json');
  const outputPath = resolve(process.cwd(), options.output ?? 'agent-bundle.json');

  cliOutput.print(`Bundling configuration from ${configDir}`);

  try {
    const composedConfig = await loadAgentConfig(manifestPath);

    const bundle = {
      version: 1,
      bundledAt: new Date().toISOString(),
      agentCard: composedConfig.card,
      systemPrompt: composedConfig.prompt.content,
      promptParts: composedConfig.prompt.parts,
      mcpServers: composedConfig.mcpServers.map((server) => ({
        id: server.id,
        namespace: server.namespace,
        config: redactEnvRefs(server.config),
        allowedTools: server.allowedTools,
        usedBySkills: server.usedBySkills,
      })),
      workflows: composedConfig.workflows.map((workflow) => ({
        id: workflow.id,
        entry: {
          ...workflow.entry,
          config: redactEnvRefs(workflow.entry.config),
        },
        overrides: redactEnvRefs(workflow.overrides),
        usedBySkills: workflow.usedBySkills,
      })),
    };

    if (options.format === 'yaml') {
      // Simple YAML-like output (could use yaml package for better formatting)
      const yamlContent = JSON.stringify(bundle, null, 2).replace(/"/g, '').replace(/,/g, '');
      writeFileSync(outputPath.replace('.json', '.yaml'), yamlContent);
      cliOutput.success(`Bundle written to ${outputPath.replace('.json', '.yaml')}`);
    } else {
      // JSON output
      writeFileSync(outputPath, JSON.stringify(bundle, null, 2));
      cliOutput.success(`Bundle written to ${outputPath}`);
    }

    cliOutput.blank();
    cliOutput.print('**Bundle contents:**');
    cliOutput.print(`  Agent: **${bundle.agentCard.name}**`);
    cliOutput.print(`  Prompt length: ${bundle.systemPrompt.length} characters`);
    cliOutput.print(`  MCP servers: ${bundle.mcpServers.length}`);
    cliOutput.print(`  Workflows: ${bundle.workflows.length}`);

    cliOutput.blank();
    cliOutput.warn('Note: Environment variable references have been redacted');
    cliOutput.print('  You must resolve these manually in your deployment environment');
  } catch (error) {
    cliOutput.error('Failed to bundle configuration');
    if (error instanceof Error) {
      cliOutput.error(error.message);
    }
    throw error;
  }
}
