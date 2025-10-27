/**
 * CLI Command: agent print-config
 * Displays composed agent configuration with redacted secrets
 */

import { resolve } from 'node:path';
import { URL } from 'node:url';

import { loadAgentConfig } from '../../config/orchestrator.js';
import {
  extractGuardrails,
  extractToolPolicies,
  type CardWithExtensions,
} from '../../config/utils/card-inspector.js';
import { serviceConfig } from '../../config.js';
import { cliOutput } from '../output.js';

export interface PrintConfigOptions {
  configDir?: string;
  format?: 'json' | 'yaml';
  redact?: boolean;
  prompt?: 'summary' | 'full';
}

/**
 * Redact sensitive values from configuration
 */
function redactSecrets(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSecrets);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('key') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('password') ||
      lowerKey.includes('authorization')
    ) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSecrets(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function printConfigCommand(options: PrintConfigOptions = {}): Promise<void> {
  const configDir = resolve(process.cwd(), options.configDir ?? 'config');
  const manifestPath = resolve(configDir, 'agent.manifest.json');
  const promptMode = options.prompt ?? 'summary';

  cliOutput.print(`Loading configuration from ${configDir}`);

  try {
    const composedConfig = await loadAgentConfig(manifestPath);

    const sanitizedAgentCard =
      options.redact !== false
        ? (redactSecrets(composedConfig.card) as typeof composedConfig.card)
        : composedConfig.card;
    const toolPolicies = extractToolPolicies(sanitizedAgentCard as CardWithExtensions) ?? [];
    const guardrails = extractGuardrails(sanitizedAgentCard as CardWithExtensions);

    const promptOutput: {
      mode: 'summary' | 'full';
      length: number;
      content?: string;
      parts: {
        base: { length: number; content?: string };
        skills: Array<{ skillId: string; length: number; content?: string }>;
      };
    } = {
      mode: promptMode,
      length: composedConfig.prompt.content.length,
      parts: {
        base: {
          length: composedConfig.prompt.parts.base.length,
          ...(promptMode === 'full' ? { content: composedConfig.prompt.parts.base } : {}),
        },
        skills: composedConfig.prompt.parts.skills.map((skillPart) => ({
          skillId: skillPart.skillId,
          length: skillPart.content.length,
          ...(promptMode === 'full' ? { content: skillPart.content } : {}),
        })),
      },
      ...(promptMode === 'full' ? { content: composedConfig.prompt.content } : {}),
    };

    const output = {
      summary: {
        skills: sanitizedAgentCard.skills?.length ?? 0,
        mcpServers: composedConfig.mcpServers.length,
        workflows: composedConfig.workflows.length,
        promptMode,
      },
      agentCard: {
        protocolVersion: sanitizedAgentCard.protocolVersion,
        name: sanitizedAgentCard.name,
        description: sanitizedAgentCard.description,
        url: sanitizedAgentCard.url,
        version: sanitizedAgentCard.version,
        defaultInputModes: sanitizedAgentCard.defaultInputModes,
        defaultOutputModes: sanitizedAgentCard.defaultOutputModes,
        provider: sanitizedAgentCard.provider,
        capabilities: sanitizedAgentCard.capabilities,
        toolPolicies,
        ...(guardrails ? { guardrails } : {}),
        skills: sanitizedAgentCard.skills ?? [],
      },
      prompt: promptOutput,
      mcpServers: composedConfig.mcpServers.map((server) => ({
        id: server.id,
        namespace: server.namespace,
        config: options.redact !== false ? redactSecrets(server.config) : server.config,
        allowedTools: server.allowedTools,
        allowedToolsCsv:
          server.allowedTools && server.allowedTools.length > 0
            ? server.allowedTools.join(', ')
            : undefined,
        usedBySkills: server.usedBySkills,
      })),
      namespaces: composedConfig.mcpServers.map((server) => ({
        id: server.id,
        namespace: server.namespace,
      })),
      workflows: composedConfig.workflows.map((workflow) => ({
        id: workflow.id,
        config:
          options.redact !== false ? redactSecrets(workflow.entry.config) : workflow.entry.config,
        enabled: workflow.entry.enabled,
        overrides:
          options.redact !== false ? redactSecrets(workflow.overrides) : workflow.overrides,
        usedBySkills: workflow.usedBySkills,
      })),
    };

    // Compute effective URL and sources (card.url is canonical, serviceConfig.a2a.path is optional override)
    try {
      const cardUrl = new URL(sanitizedAgentCard.url);
      const servicePath = serviceConfig.a2a.path;
      const cardPath = cardUrl.pathname && cardUrl.pathname !== '' ? cardUrl.pathname : '/a2a';

      const origin = cardUrl.origin;
      const path = servicePath ?? cardPath;
      const effectiveUrl = `${origin}${path}`;

      const pathSource = servicePath ? 'serviceConfig' : 'card';

      // Attach URL diagnostics without altering core output shape
      Object.assign(output, {
        urlDiagnostics: {
          configuredCardUrl: sanitizedAgentCard.url,
          effectiveUrl,
          sources: { origin: 'card', path: pathSource },
        },
      });
    } catch {
      // ignore URL parse issues in diagnostics
    }

    if (options.format === 'yaml') {
      // Simple YAML output (could use yaml package for better formatting)
      cliOutput.blank();
      cliOutput.print('=== Composed Configuration ===');
      cliOutput.blank();
      console.log(JSON.stringify(output, null, 2).replace(/"/g, '').replace(/,/g, ''));
    } else {
      // JSON output
      console.log(JSON.stringify(output, null, 2));
    }

    cliOutput.blank();
    cliOutput.success('Configuration loaded successfully');
  } catch (error) {
    cliOutput.error('Failed to load configuration');
    if (error instanceof Error) {
      cliOutput.error(error.message);
    }
    throw error;
  }
}
