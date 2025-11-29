/**
 * CLI Command: agent chat
 * Client-only chat mode - connects to a running agent and enters interactive chat
 */

import process from 'node:process';

import { Logger } from '../../utils/logger.js';
import { ChatClient } from '../chat/client.js';
import { StreamRenderer } from '../chat/renderer.js';
import { ChatRepl } from '../chat/repl.js';
import { cliOutput, showStartupEffect } from '../output.js';

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

  // Show startup effect when CLI starts
  await showStartupEffect();

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

    // Create renderer (allow tests to spy on constructor)
    const StreamRendererCtor =
      (StreamRenderer.prototype.constructor as typeof StreamRenderer | undefined) ?? StreamRenderer;
    const renderer = new StreamRendererCtor({
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

    const message =
      error instanceof Error
        ? error.message || error.toString()
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);
    cliOutput.error(message);

    const normalizedMessage = message.toLowerCase();
    if (
      normalizedMessage.includes('fetch') ||
      normalizedMessage.includes('econnrefused') ||
      normalizedMessage.includes('timeout') ||
      normalizedMessage.includes('connection')
    ) {
      cliOutput.error(
        `No agent is running at ${baseUrl}. Try starting one with agent run before reconnecting.`,
      );
    }

    process.exit(1);
  }
}
