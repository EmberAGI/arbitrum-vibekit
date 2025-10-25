/**
 * REPL Interface Module
 * Terminal readline interface for chat interactions
 */

import process from 'node:process';
import * as readline from 'node:readline';

import pc from 'picocolors';

import { isArtifactUpdateEvent, isStatusUpdateEvent } from '../../client/index.js';

import type { ChatClient } from './client.js';
import type { StreamRenderer } from './renderer.js';

export interface ReplOptions {
  /**
   * Chat client instance
   */
  client: ChatClient;

  /**
   * Stream renderer instance
   */
  renderer: StreamRenderer;

  /**
   * Show connection info on start
   */
  showConnectionInfo?: boolean;

  /**
   * Callback when REPL exits normally
   */
  onExit?: () => void | Promise<void>;
}

export class ChatRepl {
  private client: ChatClient;
  private renderer: StreamRenderer;
  private rl: readline.Interface | undefined;
  private options: Required<ReplOptions>;

  constructor(options: ReplOptions) {
    this.client = options.client;
    this.renderer = options.renderer;
    this.options = {
      ...options,
      showConnectionInfo: options.showConnectionInfo ?? true,
      onExit: options.onExit ?? ((): void => {}),
    };
  }

  /**
   * Start the REPL
   * @throws Error if stdin is not a TTY
   * @returns Promise that resolves with exit code (0 on success, non-zero on error)
   */
  async start(): Promise<number> {
    // TTY detection
    if (!process.stdin.isTTY) {
      console.error(
        pc.red(
          'Error: Chat mode requires an interactive terminal (TTY).\n' +
            'Chat is not supported in non-interactive environments like CI/CD pipelines or Docker without a TTY.\n' +
            'To run the agent in non-interactive mode, use `agent run` instead.',
        ),
      );
      return 1;
    }

    // Show connection info
    if (this.options.showConnectionInfo) {
      const baseUrl = this.client.getBaseUrl();
      console.log(pc.cyan('Connected to agent:'), baseUrl);
      console.log(pc.dim('Type your message and press Enter. Press Ctrl+C or Ctrl+D to exit.\n'));
    }

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: pc.cyan('> '),
      terminal: true,
    });

    // Handle exit signals
    let exitRequested = false;
    const handleExit = async (): Promise<void> => {
      if (exitRequested) return;
      exitRequested = true;

      console.log('\n' + pc.dim('Exiting chat...'));
      this.rl?.close();

      try {
        await this.options.onExit();
      } catch (error) {
        console.error(pc.red('Error during exit:'), error);
      }
    };

    this.rl.on('SIGINT', () => {
      void handleExit();
    });

    this.rl.on('close', () => {
      void handleExit();
    });

    // Main REPL loop
    return new Promise<number>((resolve) => {
      if (!this.rl) {
        resolve(1);
        return;
      }

      this.rl.on('line', async (input: string) => {
        const trimmedInput = input.trim();

        // Skip empty input
        if (!trimmedInput) {
          this.rl?.prompt();
          return;
        }

        try {
          // Reset renderer for new message
          this.renderer.reset();

          // Send message and process stream
          const stream = this.client.sendMessage(trimmedInput);

          for await (const event of stream) {
            if (event.kind === 'artifact-update' && isArtifactUpdateEvent(event.data)) {
              this.renderer.processArtifactUpdate(event.data);
            } else if (event.kind === 'status-update' && isStatusUpdateEvent(event.data)) {
              this.renderer.processStatusUpdate(event.data);
            }
            // Filter out tool events and unknown events (don't pollute main chat)
          }

          // Ensure newline after response
          console.log();
        } catch (error) {
          console.error(pc.red('Error:'), error);
        }

        // Show prompt for next input
        this.rl?.prompt();
      });

      this.rl.on('close', () => {
        resolve(0); // Normal exit
      });

      // Show initial prompt
      this.rl.prompt();
    });
  }

  /**
   * Stop the REPL
   */
  stop(): void {
    this.rl?.close();
  }
}

/**
 * Check if the current environment supports TTY (for testing purposes)
 */
export function isTTYSupported(): boolean {
  return process.stdin.isTTY === true;
}
