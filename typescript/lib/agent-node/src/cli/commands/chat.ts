/**
 * CLI Command: agent chat
 * Client-only chat mode - connects to a running agent and enters interactive chat
 */

import process from 'node:process';

import { Logger } from '../../utils/logger.js';
import { ChatClient } from '../chat/client.js';
import { StreamRenderer } from '../chat/renderer.js';
import { ChatRepl } from '../chat/repl.js';
import { cliOutput } from '../output.js';

export interface ChatOptions {
  /**
   * Agent URL (default: http://127.0.0.1:3000)
   */
  url?: string;

  /**
   * Enable verbose mode (stream reasoning, show artifact contents)
   */
  verbose?: boolean;

  /**
   * Enable inline artifact summaries with throttling (milliseconds)
   */
  inlineSummaryInterval?: number;

  /**
   * Log directory for file logging (optional, daily JSONL)
   */
  logDir?: string;

  /**
   * Respect existing LOG_LEVEL from env (opt-out forcing ERROR)
   */
  respectLogLevel?: boolean;
}

export async function chatCommand(options: ChatOptions = {}): Promise<void> {
  const baseUrl = options.url ?? 'http://127.0.0.1:3000';

  try {
    // Force ERROR by default unless user explicitly opts to respect env
    if (!options.respectLogLevel) {
      process.env['LOG_LEVEL'] = 'ERROR';
    }

    // Setup file logging if requested
    if (options.logDir) {
      try {
        await Logger.setFileSink(options.logDir);
        // Prefer structured for file clarity
        process.env['LOG_STRUCTURED'] = 'true';
        // Suppress console logs entirely for clean chat output
        Logger.setConsoleEnabled(false);
      } catch {
        // If file sink fails, continue without file logging
      }
    }

    cliOutput.print('Connecting to agent...');

    // Create chat client
    const client = await ChatClient.fromUrl(baseUrl);

    cliOutput.success(`Connected to agent at \`${baseUrl}\``);

    // Create renderer
    const renderer = new StreamRenderer({
      colors: true,
      verbose: options.verbose ?? false,
      inlineSummaryInterval: options.inlineSummaryInterval,
    });

    // Create and start REPL
    const repl = new ChatRepl({
      client,
      renderer,
      showConnectionInfo: false, // Already shown above
    });

    const exitCode = await repl.start();

    process.exit(exitCode);
  } catch (error) {
    cliOutput.error('Failed to connect to agent');

    if (error instanceof Error) {
      cliOutput.error(error.message);

      // Check for common connection errors
      if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
        cliOutput.blank();
        cliOutput.info(
          `No agent is running at \`${baseUrl}\`. Try starting one with \`agent run\` first.`,
        );
      }
    }

    process.exit(1);
  }
}
