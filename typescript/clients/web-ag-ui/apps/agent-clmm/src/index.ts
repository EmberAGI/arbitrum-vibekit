import cron from 'node-cron';
import { GraphInterrupt } from '@langchain/langgraph';

import { clmmGraph } from './workflow/index.js';

const threadId = 'clmm-thread';
const cronExpression = '*/1 * * * *';

async function runGraphOnce() {
  const startedAt = Date.now();
  console.info(`[cron] Starting CLMM graph run (thread=${threadId})`);

  try {
    const stream = await clmmGraph.stream(null, {
      configurable: { thread_id: threadId },
    });
    // streaming ensures all nodes execute; events are handled inside nodes
    for await (const _ of stream) {
      // no-op
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

function startScheduler() {
  console.info(`[cron] Scheduling CLMM graph with expression "${cronExpression}" (thread=${threadId})`);
  cron.schedule(cronExpression, () => {
    void runGraphOnce();
  });
}

startScheduler();
void runGraphOnce();
