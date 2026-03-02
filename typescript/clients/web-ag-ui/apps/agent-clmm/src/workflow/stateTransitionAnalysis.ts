type TransitionTaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'auth-required';

export type ClmmTransitionSource = 'threadReducer' | 'applyThreadPatch';

type ClmmTransitionSnapshot = {
  taskState?: TransitionTaskState;
  onboardingKey?: string;
};

export type ClmmThreadTransitionLogEntry = {
  timestamp: string;
  source: ClmmTransitionSource;
  patchKeys: string[];
  previous: ClmmTransitionSnapshot;
  next: ClmmTransitionSnapshot;
};

type TransitionWriterCount = Record<string, number>;

export type TransitionChurnSummary = {
  totalEntries: number;
  transitions: {
    inputRequiredEntries: number;
    workingToInputRequired: number;
    inputRequiredToWorking: number;
    byWriter: {
      workingToInputRequired: TransitionWriterCount;
      inputRequiredToWorking: TransitionWriterCount;
    };
  };
  onboardingRegressions: Array<{
    timestamp: string;
    from: string;
    to: string;
    writer: string;
  }>;
};

export type TransitionBudget = {
  maxInputRequiredEntries: number;
  maxWorkingToInputRequired: number;
  maxInputRequiredToWorking: number;
  maxOnboardingRegressions: number;
};

export type TransitionBudgetEvaluation = {
  passes: boolean;
  violations: string[];
};

export type TransitionSummaryOptions = {
  sources?: ClmmTransitionSource[];
};

const ONBOARDING_KEY_ORDER: Record<string, number> = {
  'operator-input': 1,
  'funding-token': 2,
  'delegation-signing': 3,
};

const DEFAULT_BUDGET: TransitionBudget = {
  maxInputRequiredEntries: 3,
  maxWorkingToInputRequired: 3,
  maxInputRequiredToWorking: 3,
  maxOnboardingRegressions: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function parseSnapshot(value: unknown): ClmmTransitionSnapshot {
  if (!isRecord(value)) {
    return {};
  }
  const taskState = asString(value['taskState']) as TransitionTaskState | undefined;
  const onboardingKey = asString(value['onboardingKey']);
  return { taskState, onboardingKey };
}

function parseEntry(value: unknown, lineNumber: number): ClmmThreadTransitionLogEntry {
  if (!isRecord(value)) {
    throw new Error(`Invalid transition log entry at line ${lineNumber}: expected object.`);
  }

  const source = asString(value['source']);
  if (source !== 'threadReducer' && source !== 'applyThreadPatch') {
    throw new Error(
      `Invalid transition log entry at line ${lineNumber}: unsupported source '${String(source)}'.`,
    );
  }

  return {
    timestamp: asString(value['timestamp']) ?? `line-${lineNumber}`,
    source,
    patchKeys: asStringArray(value['patchKeys']).sort(),
    previous: parseSnapshot(value['previous']),
    next: parseSnapshot(value['next']),
  };
}

function writerKey(entry: ClmmThreadTransitionLogEntry): string {
  return `${entry.source}[${entry.patchKeys.join(',') || '-'}]`;
}

function increment(map: TransitionWriterCount, key: string): TransitionWriterCount {
  map[key] = (map[key] ?? 0) + 1;
  return map;
}

function isOnboardingRegression(previousKey: string | undefined, nextKey: string | undefined): boolean {
  if (!previousKey || !nextKey || previousKey === nextKey) {
    return false;
  }
  const previousOrder = ONBOARDING_KEY_ORDER[previousKey];
  const nextOrder = ONBOARDING_KEY_ORDER[nextKey];
  if (!previousOrder || !nextOrder) {
    return false;
  }
  return nextOrder < previousOrder;
}

export function parseTransitionLogNdjson(content: string): ClmmThreadTransitionLogEntry[] {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line, index) => {
    const lineNumber = index + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse transition log line ${lineNumber}: ${message}`);
    }
    return parseEntry(parsed, lineNumber);
  });
}

export function summarizeTransitionChurn(
  entries: ClmmThreadTransitionLogEntry[],
  options?: TransitionSummaryOptions,
): TransitionChurnSummary {
  const includedSources = options?.sources ?? ['threadReducer'];
  const includedEntries = entries.filter((entry) => includedSources.includes(entry.source));

  const summary: TransitionChurnSummary = {
    totalEntries: includedEntries.length,
    transitions: {
      inputRequiredEntries: 0,
      workingToInputRequired: 0,
      inputRequiredToWorking: 0,
      byWriter: {
        workingToInputRequired: {},
        inputRequiredToWorking: {},
      },
    },
    onboardingRegressions: [],
  };

  for (const entry of includedEntries) {
    const previousState = entry.previous.taskState;
    const nextState = entry.next.taskState;
    const writer = writerKey(entry);

    if (nextState === 'input-required') {
      summary.transitions.inputRequiredEntries += 1;
    }

    if (previousState === 'working' && nextState === 'input-required') {
      summary.transitions.workingToInputRequired += 1;
      increment(summary.transitions.byWriter.workingToInputRequired, writer);
    }

    if (previousState === 'input-required' && nextState === 'working') {
      summary.transitions.inputRequiredToWorking += 1;
      increment(summary.transitions.byWriter.inputRequiredToWorking, writer);
    }

    if (isOnboardingRegression(entry.previous.onboardingKey, entry.next.onboardingKey)) {
      summary.onboardingRegressions.push({
        timestamp: entry.timestamp,
        from: entry.previous.onboardingKey ?? 'unknown',
        to: entry.next.onboardingKey ?? 'unknown',
        writer,
      });
    }
  }

  return summary;
}

export function evaluateTransitionBudget(
  summary: TransitionChurnSummary,
  budget: TransitionBudget = DEFAULT_BUDGET,
): TransitionBudgetEvaluation {
  const violations: string[] = [];

  if (summary.transitions.inputRequiredEntries > budget.maxInputRequiredEntries) {
    violations.push(
      `input-required entries ${summary.transitions.inputRequiredEntries} exceeded budget ${budget.maxInputRequiredEntries}`,
    );
  }

  if (summary.transitions.workingToInputRequired > budget.maxWorkingToInputRequired) {
    violations.push(
      `working -> input-required transitions ${summary.transitions.workingToInputRequired} exceeded budget ${budget.maxWorkingToInputRequired}`,
    );
  }

  if (summary.transitions.inputRequiredToWorking > budget.maxInputRequiredToWorking) {
    violations.push(
      `input-required -> working transitions ${summary.transitions.inputRequiredToWorking} exceeded budget ${budget.maxInputRequiredToWorking}`,
    );
  }

  if (summary.onboardingRegressions.length > budget.maxOnboardingRegressions) {
    violations.push(
      `onboarding regressions ${summary.onboardingRegressions.length} exceeded budget ${budget.maxOnboardingRegressions}`,
    );
  }

  return {
    passes: violations.length === 0,
    violations,
  };
}
