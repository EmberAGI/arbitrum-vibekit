const COPILOT_RUNTIME_DEBUG_PREFIXES = [
  '[LangGraphAgent.',
  '[AbstractAgent.',
  '[CopilotRuntime.',
  '[TelemetryAgentRunner.',
] as const;

const DEBUG_FILTER_INSTALLED_KEY = Symbol.for('forge.copilotRuntimeDebugFilterInstalled');
const DEBUG_FILTER_ORIGINAL_KEY = Symbol.for('forge.copilotRuntimeDebugFilterOriginal');

type GlobalWithDebugFilter = typeof globalThis & {
  [DEBUG_FILTER_INSTALLED_KEY]?: boolean;
  [DEBUG_FILTER_ORIGINAL_KEY]?: (...args: Parameters<typeof console.debug>) => void;
};

export function isCopilotRuntimeDebugLog(args: readonly unknown[]): boolean {
  const firstArg = args.at(0);
  if (typeof firstArg !== 'string') {
    return false;
  }
  return COPILOT_RUNTIME_DEBUG_PREFIXES.some((prefix) => firstArg.startsWith(prefix));
}

export function installCopilotRuntimeDebugFilter(options: { enabled: boolean }): void {
  if (options.enabled) {
    return;
  }

  const globalWithFilter = globalThis as GlobalWithDebugFilter;
  if (globalWithFilter[DEBUG_FILTER_INSTALLED_KEY]) {
    return;
  }

  const originalDebug = console.debug.bind(console);
  globalWithFilter[DEBUG_FILTER_ORIGINAL_KEY] = originalDebug;

  console.debug = (...args: Parameters<typeof console.debug>) => {
    if (isCopilotRuntimeDebugLog(args)) {
      return;
    }
    originalDebug(...args);
  };

  globalWithFilter[DEBUG_FILTER_INSTALLED_KEY] = true;
}

export function resetCopilotRuntimeDebugFilterForTests(): void {
  const globalWithFilter = globalThis as GlobalWithDebugFilter;
  const originalDebug = globalWithFilter[DEBUG_FILTER_ORIGINAL_KEY];
  if (originalDebug) {
    console.debug = originalDebug;
  }
  delete globalWithFilter[DEBUG_FILTER_ORIGINAL_KEY];
  delete globalWithFilter[DEBUG_FILTER_INSTALLED_KEY];
}
