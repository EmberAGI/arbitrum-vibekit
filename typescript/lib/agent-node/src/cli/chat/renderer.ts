/**
 * Streaming Renderer Module
 * Handles progressive rendering of chat messages and artifacts
 */

import pc from 'picocolors';

import type { ArtifactUpdateEvent, StatusUpdateEvent } from '../../client/index.js';
import { ArtifactAssembler } from '../../client/index.js';

export interface RendererOptions {
  /**
   * Enable colorized output (default: true)
   */
  colors?: boolean;

  /**
   * Enable verbose mode (stream reasoning, show artifact contents)
   */
  verbose?: boolean;

  /**
   * Enable inline artifact summaries with throttling
   * Interval in milliseconds (default: off)
   */
  inlineSummaryInterval?: number;
}

export class StreamRenderer {
  private assembler: ArtifactAssembler = new ArtifactAssembler();
  private options: Required<RendererOptions>;
  private lastInlineSummaryTime: Map<string, number> = new Map();
  private textResponseBuffer = '';
  private hasShownAgentPrefix = false;

  constructor(options: RendererOptions = {}) {
    this.options = {
      colors: options.colors ?? true,
      verbose: options.verbose ?? false,
      inlineSummaryInterval: options.inlineSummaryInterval ?? 0,
    };
  }

  /**
   * Process an artifact-update event
   */
  processArtifactUpdate(event: ArtifactUpdateEvent): void {
    const result = this.assembler.processUpdate(event);

    // Handle text-response: stream progressively
    if (result.name === 'text-response') {
      this.renderTextResponse(result.parts);
      return;
    }

    // Handle reasoning in verbose mode: stream like text-response
    if (result.name === 'reasoning' && this.options.verbose) {
      this.renderReasoning(result.parts);
      return;
    }

    // All other artifacts (including reasoning in normal mode): buffer for summary
    // Optionally show inline summary if throttle interval is set
    if (this.options.inlineSummaryInterval > 0) {
      this.maybeShowInlineSummary(result.artifactId, {
        artifactId: result.artifactId,
        name: result.name,
        updateCount: result.updateCount,
        totalParts: result.parts.length,
        complete: result.complete,
      });
    }

    // In verbose mode, show a compact preview of non-text artifacts
    if (this.options.verbose && result.name !== 'text-response' && result.parts.length > 0) {
      const preview = this.previewParts(result.parts, 200);
      if (preview) {
        const label = result.name ?? result.artifactId;
        const line = `[${label}] ${preview}`;
        const output = this.options.colors ? pc.dim(line) : line;
        process.stdout.write(output + '\n');
      }
    }
  }

  /**
   * Process a status-update event
   */
  processStatusUpdate(event: StatusUpdateEvent): void {
    if (event.final) {
      // End the text response line if buffered
      if (this.textResponseBuffer) {
        process.stdout.write('\n');
        this.textResponseBuffer = '';
      }

      // Show summaries for all non-text-response artifacts
      this.showFinalSummaries();
    }
  }

  /**
   * Render text-response artifact progressively
   */
  private renderTextResponse(parts: { kind: string; text?: string }[]): void {
    // Extract text from parts
    const text = parts
      .filter((p): p is { kind: 'text'; text: string } => p.kind === 'text' && 'text' in p)
      .map((p) => p.text)
      .join('');

    // Add agent prefix on first output
    if (!this.hasShownAgentPrefix && text) {
      process.stdout.write('⦿  ');
      this.hasShownAgentPrefix = true;
    }

    // Only render new content
    if (text.startsWith(this.textResponseBuffer)) {
      const newContent = text.slice(this.textResponseBuffer.length);
      if (newContent) {
        process.stdout.write(newContent);
        this.textResponseBuffer = text;
      }
    } else {
      // Full replacement (shouldn't happen with append, but handle it)
      process.stdout.write('\n' + text);
      this.textResponseBuffer = text;
    }
  }

  /**
   * Render reasoning artifact in verbose mode
   */
  private renderReasoning(parts: { kind: string; text?: string }[]): void {
    const text = parts
      .filter((p): p is { kind: 'text'; text: string } => p.kind === 'text' && 'text' in p)
      .map((p) => p.text)
      .join('');

    if (text) {
      const prefix = this.options.colors ? pc.yellow('[reasoning] ') : '[reasoning] ';
      const output = this.options.colors ? pc.dim(text) : text;
      process.stdout.write(prefix + output + '\n');
    }
  }

  /**
   * Maybe show inline summary with throttling
   */
  private maybeShowInlineSummary(
    artifactId: string,
    summary: {
      artifactId: string;
      name?: string;
      updateCount: number;
      totalParts: number;
      complete: boolean;
    },
  ): void {
    const now = Date.now();
    const lastTime = this.lastInlineSummaryTime.get(artifactId) ?? 0;

    if (now - lastTime >= this.options.inlineSummaryInterval) {
      this.showInlineSummary(summary);
      this.lastInlineSummaryTime.set(artifactId, now);
    }
  }

  /**
   * Show a single inline summary
   */
  private showInlineSummary(summary: {
    artifactId: string;
    name?: string;
    updateCount: number;
    totalParts: number;
    complete: boolean;
  }): void {
    const status = summary.complete ? 'complete' : 'updating';
    const line = `[${summary.name ?? summary.artifactId}] ${status} (${summary.updateCount} updates, ${summary.totalParts} parts)`;
    const output = this.options.colors ? pc.dim(line) : line;
    process.stdout.write(output + '\n');
  }

  /**
   * Show final summaries for all non-text-response artifacts
   */
  private showFinalSummaries(): void {
    const summaries = this.assembler.getSummaries().filter((s) => s.name !== 'text-response'); // Exclude text-response

    if (summaries.length === 0) {
      return;
    }

    process.stdout.write('\n');

    for (const summary of summaries) {
      const completionMark = summary.complete ? '✓' : '…';
      const line = `${completionMark} ${summary.name ?? summary.artifactId}: ${summary.updateCount} updates, ${summary.totalParts} parts`;

      const output = this.options.colors ? pc.dim(line) : line;
      process.stdout.write(output + '\n');
    }
  }

  /**
   * Reset the renderer state (e.g., between messages)
   */
  reset(): void {
    this.assembler.reset();
    this.lastInlineSummaryTime.clear();
    this.textResponseBuffer = '';
    this.hasShownAgentPrefix = false;
  }

  /**
   * Build a compact preview string from parts (text-only, truncated)
   */
  private previewParts(parts: { kind: string; text?: string }[], maxLen: number): string {
    const combined = parts
      .filter(
        (p): p is { kind: 'text'; text: string } => p.kind === 'text' && typeof p.text === 'string',
      )
      .map((p) => p.text)
      .join('');
    if (!combined) return '';
    const clean = combined.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, Math.max(0, maxLen - 1)) + '…';
  }
}
