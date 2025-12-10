import { GraphInterrupt } from '@langchain/langgraph';
import cron from 'node-cron';

import { clmmGraph } from './workflow/index.js';

const cronExpression = '*/1 * * * *';
const cronJobs = new Map<string, cron.ScheduledTask>();

async function runGraphOnce(threadId: string) {
  const startedAt = Date.now();
  console.info(`[cron] Starting CLMM graph run (thread=${threadId})`);

  try {
    const stream = await clmmGraph.stream(null, {
      configurable: { thread_id: threadId },
    });
    // streaming ensures all nodes execute; events are handled inside nodes
    for await (const event of stream) {
      void event;
    }
    console.info(`[cron] Run complete in ${Date.now() - startedAt}ms`);
  } catch (error) {
    if (error instanceof GraphInterrupt) {
      console.warn('[cron] Graph interrupted awaiting operator input; supply input via UI and rerun.');
      return;
    }

    console.error('[cron] Graph run failed', error);
  }
}

function ensureCronForThread(threadId: string) {
  if (cronJobs.has(threadId)) {
    return cronJobs.get(threadId);
  }

  console.info(`[cron] Scheduling CLMM graph with expression "${cronExpression}" (thread=${threadId})`);
  const job = cron.schedule(cronExpression, () => {
    void runGraphOnce(threadId);
  });
  cronJobs.set(threadId, job);
  return job;
}

const initialThreadId = process.env['CLMM_THREAD_ID'];
if (!initialThreadId) {
  throw new Error('CLMM_THREAD_ID environment variable is required to start the CLMM scheduler.');
}

void (async () => {
  const stream = await clmmGraph.stream(null, {
    configurable: {
      thread_id: initialThreadId,
      scheduleCron: ensureCronForThread,
    },
  });
  for await (const event of stream) {
    void event;
  }
})();
