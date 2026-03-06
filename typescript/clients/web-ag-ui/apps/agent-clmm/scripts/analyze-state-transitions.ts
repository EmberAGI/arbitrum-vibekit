import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { resolve } from 'node:path';

import {
  type ClmmTransitionSource,
  evaluateTransitionBudget,
  parseTransitionLogNdjson,
  summarizeTransitionChurn,
  type TransitionBudget,
} from '../src/workflow/stateTransitionAnalysis.js';

const DEFAULT_LOG_PATH = './.logs/clmm-state-transitions.ndjson';

type ParsedArgs = {
  logPath: string;
  budget: TransitionBudget;
  json: boolean;
  sources: ClmmTransitionSource[];
};

function parseNumberFlag(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseSourcesFlag(rawValue: string | undefined): ClmmTransitionSource[] {
  if (!rawValue || rawValue === 'reducer') {
    return ['threadReducer'];
  }
  if (rawValue === 'emit') {
    return ['applyThreadPatch'];
  }
  if (rawValue === 'both') {
    return ['threadReducer', 'applyThreadPatch'];
  }
  return ['threadReducer'];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: Record<string, string | undefined> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) {
      continue;
    }
    const withoutPrefix = raw.slice(2);
    const [key, inlineValue] = withoutPrefix.split('=', 2);
    if (!key) {
      continue;
    }
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = 'true';
    }
  }

  return {
    logPath: resolve(args['log'] ?? process.env['CLMM_STATE_TRANSITION_LOG_PATH'] ?? DEFAULT_LOG_PATH),
    budget: {
      maxInputRequiredEntries: parseNumberFlag(args['max-input-required-entries'], 3),
      maxWorkingToInputRequired: parseNumberFlag(args['max-working-to-input-required'], 3),
      maxInputRequiredToWorking: parseNumberFlag(args['max-input-required-to-working'], 3),
      maxOnboardingRegressions: parseNumberFlag(args['max-onboarding-regressions'], 0),
    },
    json: args['json'] === 'true',
    sources: parseSourcesFlag(args['sources']),
  };
}

function printWriterCounts(title: string, counts: Record<string, number>): void {
  const rows = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  console.log(`${title}:`);
  if (rows.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const [writer, count] of rows) {
    console.log(`  ${writer} -> ${count}`);
  }
}

function run(): number {
  const parsed = parseArgs(process.argv.slice(2));

  if (!existsSync(parsed.logPath)) {
    console.error(`[clmm-transition-analysis] Log file not found: ${parsed.logPath}`);
    return 1;
  }

  const raw = readFileSync(parsed.logPath, 'utf8');
  const entries = parseTransitionLogNdjson(raw);
  const summary = summarizeTransitionChurn(entries, { sources: parsed.sources });
  const evaluation = evaluateTransitionBudget(summary, parsed.budget);

  if (parsed.json) {
    console.log(
      JSON.stringify(
        {
          logPath: parsed.logPath,
          budget: parsed.budget,
          sources: parsed.sources,
          summary,
          evaluation,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`[clmm-transition-analysis] logPath=${parsed.logPath}`);
    console.log(`[clmm-transition-analysis] sources=${parsed.sources.join(',')}`);
    console.log(`[clmm-transition-analysis] entries=${summary.totalEntries}`);
    console.log(
      `[clmm-transition-analysis] input-required entries=${summary.transitions.inputRequiredEntries}`,
    );
    console.log(
      `[clmm-transition-analysis] working -> input-required=${summary.transitions.workingToInputRequired}`,
    );
    console.log(
      `[clmm-transition-analysis] input-required -> working=${summary.transitions.inputRequiredToWorking}`,
    );
    console.log(
      `[clmm-transition-analysis] onboarding regressions=${summary.onboardingRegressions.length}`,
    );
    printWriterCounts(
      '[clmm-transition-analysis] writer attribution (working -> input-required)',
      summary.transitions.byWriter.workingToInputRequired,
    );
    printWriterCounts(
      '[clmm-transition-analysis] writer attribution (input-required -> working)',
      summary.transitions.byWriter.inputRequiredToWorking,
    );

    if (!evaluation.passes) {
      console.log('[clmm-transition-analysis] budget violations:');
      for (const violation of evaluation.violations) {
        console.log(`  - ${violation}`);
      }
    } else {
      console.log('[clmm-transition-analysis] budget check passed');
    }
  }

  return evaluation.passes ? 0 : 1;
}

process.exitCode = run();
