import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CLMM_FAILURE_LOG_DEFAULT_PATH = './.logs/clmm-failures.ndjson';

let hasWarnedFailureLogWrite = false;

export type ClmmFailureLogEntry = {
  timestamp: string;
  iteration: number;
  action: string;
  threadId?: string;
  retainedError: string;
  fullError: string;
  emberError?: {
    status?: number;
    upstreamStatus?: number;
    path?: string;
  };
};

function warnFailureLogWrite(error: unknown): void {
  if (hasWarnedFailureLogWrite) {
    return;
  }
  hasWarnedFailureLogWrite = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn('[CamelotCLMM] Failed to write failure log', { message });
}

export function writeClmmFailureLog(
  entry: ClmmFailureLogEntry,
  logPath: string = CLMM_FAILURE_LOG_DEFAULT_PATH,
): void {
  const resolvedPath = resolve(logPath);
  try {
    mkdirSync(dirname(resolvedPath), { recursive: true });
    appendFileSync(resolvedPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error: unknown) {
    warnFailureLogWrite(error);
  }
}
