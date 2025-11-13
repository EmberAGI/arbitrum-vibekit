import { beforeEach, vi } from 'vitest';

const LEVELS = {
  silent: [] as const,
  error: ['log', 'info', 'warn', 'debug'] as const,
  warn: ['log', 'info', 'debug'] as const,
  debug: [] as const,
} as const;

type LogLevel = keyof typeof LEVELS;

const level = (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'silent';
const suppressed = LEVELS[level] ?? LEVELS.silent;

const noop = () => undefined;
const originalConsole = { ...console };

for (const method of suppressed) {
  console[method] = noop;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

process.on('beforeExit', () => {
  Object.assign(console, originalConsole);
});
