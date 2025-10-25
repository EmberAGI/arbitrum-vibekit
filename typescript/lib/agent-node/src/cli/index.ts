#!/usr/bin/env node
/**
 * Agent CLI
 * Command-line interface for agent configuration management
 *
 * Note: Environment variables should be loaded via loader.ts entry point
 * or by using Node.js --env-file flag
 */

import process from 'node:process';

import { Logger } from '../utils/logger.js';

import {
  initCommand,
  printConfigCommand,
  doctorCommand,
  runCommand,
  bundleCommand,
  registerCommand,
  updateRegistryCommand,
  chatCommand,
} from './commands/index.js';

interface CliArgs {
  command?: string;
  args: string[];
  options: Record<string, string | boolean>;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const command = args[0];
  const options: Record<string, string | boolean> = {};
  const remaining: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg && arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg) {
      remaining.push(arg);
    }
  }

  return { command, args: remaining, options };
}

function printHelp(): void {
  console.log(`
Agent Configuration CLI

Usage:
  agent [command] [options]

Default Behavior (no command):
  Smart-start chat mode: If an agent is reachable at --url (or default),
  attach to it. Otherwise, start a local server and attach to it.
  In chat mode, default LOG_LEVEL=ERROR. Use --log-dir to write JSONL logs.

Commands:
  chat                    Connect to a running agent (client-only, never starts server)
    --url <url>           Agent URL (default: http://127.0.0.1:3000)
    --verbose             Stream reasoning and show artifact contents
    --inline-summary <ms> Enable inline artifact summaries (throttle interval)
    --log-dir <dir>       Write structured logs to daily JSONL files in <dir>
    --respect-log-level   Respect LOG_LEVEL from env (do not force ERROR)

  init                    Initialize a new config workspace
    --target <dir>        Target directory (default: ./config)
    --force               Overwrite existing directory

  print-config            Display composed configuration
    --config-dir <dir>    Config directory (default: ./config)
    --format <json|yaml>  Output format (default: json)
    --no-redact           Show sensitive values
    --prompt <mode>       Prompt detail: summary (default) or full

  doctor                  Validate configuration and detect issues
    --config-dir <dir>    Config directory (default: ./config)
    --verbose             Show detailed diagnostics

  run                     Run the agent server (headless by default)
    --config-dir <dir>    Config directory (default: ./config)
    --dev                 Enable hot reload
    --port <number>       Server port (default: 3000)
    --host <string>       Server host (default: 0.0.0.0)
    --attach              Start server then enter chat mode (alias: --chat)
    --chat                Alias for --attach
    --log-dir <dir>       When used with --attach, write logs to <dir> as JSONL
    --respect-log-level   Respect LOG_LEVEL from env (do not force ERROR in chat)

  bundle                  Export deployment bundle
    --config-dir <dir>    Config directory (default: ./config)
    --output <file>       Output file (default: ./agent-bundle.json)
    --format <json|yaml>  Output format (default: json)

  register                Register agent on-chain using EIP-8004
    --name <name>         Agent name (required)
    --description <desc>  Agent description (required)
    --url <url>           Agent URL (required)
    --chain-id <id>       Chain ID (required, e.g., 11155111 for Sepolia)
    --version <version>   Agent version (default: 1.0.0)
    --image <url>         Agent image URL

  update-registry         Update agent registry on-chain using EIP-8004
    --agent-id <id>       Agent ID (required)
    --name <name>         Agent name (required)
    --description <desc>  Agent description (required)
    --url <url>           Agent URL (required)
    --chain-id <id>       Chain ID (required, e.g., 11155111 for Sepolia)
    --version <version>   Agent version (default: 1.0.0)
    --image <url>         Agent image URL

  help                    Show this help message

Environment:
  Create a .env file from .env.example for local development.
  Required variables depend on your AI provider:
    - OPENROUTER_API_KEY  OpenRouter API key
    - OPENAI_API_KEY      OpenAI API key
    - XAI_API_KEY         xAI API key
    - HYPERBOLIC_API_KEY  Hyperbolic API key

Examples:
  agent init
  agent doctor
  agent run --dev
  agent print-config --format json
  agent bundle --output my-agent.json
  agent register --name "My Agent" --description "An awesome agent" --url "https://myagent.com" --chain-id 11155111
  agent update-registry --agent-id 123 --name "My Agent" --description "Updated agent" --url "https://myagent.com" --chain-id 11155111
`);
}

async function main(): Promise<void> {
  const { command, options } = parseArgs();
  const logger = Logger.getInstance('CLI');

  // Handle global --help and -h flags
  if (command === '--help' || command === '-h' || options['help'] || options['h']) {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case 'chat':
        await chatCommand({
          url: options['url'] as string | undefined,
          verbose: options['verbose'] as boolean | undefined,
          inlineSummaryInterval: options['inline-summary']
            ? Number(options['inline-summary'])
            : undefined,
          logDir: options['log-dir'] as string | undefined,
          respectLogLevel: options['respect-log-level'] as boolean | undefined,
        });
        break;

      case 'init':
        await initCommand({
          target: options['target'] as string | undefined,
          force: options['force'] as boolean | undefined,
        });
        break;

      case 'print-config': {
        const promptOption = options['prompt'];
        const promptMode =
          typeof promptOption === 'string' && promptOption.toLowerCase() === 'full'
            ? 'full'
            : 'summary';

        await printConfigCommand({
          configDir: options['config-dir'] as string | undefined,
          format: (options['format'] as 'json' | 'yaml') ?? 'json',
          redact: options['no-redact'] ? false : true,
          prompt: promptMode,
        });
        break;
      }

      case 'doctor':
        await doctorCommand({
          configDir: options['config-dir'] as string | undefined,
          verbose: options['verbose'] as boolean | undefined,
        });
        break;

      case 'run':
        await runCommand({
          configDir: options['config-dir'] as string | undefined,
          dev: options['dev'] as boolean | undefined,
          port: options['port'] ? Number(options['port']) : undefined,
          host: options['host'] as string | undefined,
          attach: options['attach'] as boolean | undefined,
          chat: options['chat'] as boolean | undefined,
          logDir: options['log-dir'] as string | undefined,
          respectLogLevel: options['respect-log-level'] as boolean | undefined,
        });
        break;

      case 'bundle':
        await bundleCommand({
          configDir: options['config-dir'] as string | undefined,
          output: options['output'] as string | undefined,
          format: (options['format'] as 'json' | 'yaml') ?? 'json',
        });
        break;

      case 'register':
        await registerCommand({
          name: options['name'] as string | undefined,
          description: options['description'] as string | undefined,
          url: options['url'] as string | undefined,
          chainId: options['chain-id'] as string | undefined,
          version: options['version'] as string | undefined,
          image: options['image'] as string | undefined,
        });
        break;

      case 'update-registry':
        await updateRegistryCommand({
          agentId: options['agent-id'] as string | undefined,
          name: options['name'] as string | undefined,
          description: options['description'] as string | undefined,
          url: options['url'] as string | undefined,
          chainId: options['chain-id'] as string | undefined,
          version: options['version'] as string | undefined,
          image: options['image'] as string | undefined,
        });
        break;

      case 'help':
        printHelp();
        break;

      case undefined: {
        // Smart-start: attach if reachable, else start then attach
        const { isAgentReachable } = await import('./chat/utils.js');
        const baseUrl = (options['url'] as string | undefined) ?? 'http://127.0.0.1:3000';

        const reachable = await isAgentReachable(baseUrl);

        if (reachable) {
          // Agent is reachable: attach chat mode (client-only)
          await chatCommand({
            url: baseUrl,
            verbose: options['verbose'] as boolean | undefined,
            inlineSummaryInterval: options['inline-summary']
              ? Number(options['inline-summary'])
              : undefined,
            logDir: options['log-dir'] as string | undefined,
            respectLogLevel: options['respect-log-level'] as boolean | undefined,
          });
        } else {
          // Agent not reachable: start local server then attach
          await runCommand({
            configDir: options['config-dir'] as string | undefined,
            dev: options['dev'] as boolean | undefined,
            port: options['port'] ? Number(options['port']) : undefined,
            host: options['host'] as string | undefined,
            attach: true, // Enable attach mode
          });
        }
        break;
      }

      default:
        logger.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    logger.error('Command failed', error);
    process.exit(1);
  }
}

void main();
