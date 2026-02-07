export type InterruptType = string | null | undefined;

type ScheduleFn = (fn: () => void, ms: number) => unknown;

type Options = {
  interruptType: InterruptType;
  runCommand: (command: string) => boolean;
  schedule?: ScheduleFn;
  retryMs?: number;
  maxMs?: number;
  now?: () => number;
};

/**
 * Some interrupts are "ack-only" UI affordances, not true user input steps.
 * For these, we proactively trigger a new `cycle` run after resolution so the
 * agent can re-check external state (wallet balances, RPC state, etc).
 */
export function scheduleCycleAfterInterruptResolution(options: Options): void {
  if (options.interruptType !== 'pendle-fund-wallet-request') {
    return;
  }

  const schedule: ScheduleFn =
    options.schedule ??
    ((fn, ms) => {
      return setTimeout(fn, ms);
    });
  const retryMs = options.retryMs ?? 250;
  const maxMs = options.maxMs ?? 5_000;
  const now = options.now ?? (() => Date.now());
  const deadline = now() + maxMs;

  const tick = (): void => {
    if (options.runCommand('cycle')) {
      return;
    }
    if (now() >= deadline) {
      return;
    }
    schedule(tick, retryMs);
  };

  schedule(tick, retryMs);
}

