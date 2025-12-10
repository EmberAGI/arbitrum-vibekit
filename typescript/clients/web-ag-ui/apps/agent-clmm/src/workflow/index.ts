import { END, InMemoryStore, START, StateGraph } from '@langchain/langgraph';
import { privateKeyToAccount } from 'viem/accounts';

import { ClmmStateAnnotation, memory } from './context.js';
import { collectOperatorInputNode } from './nodes/collectOperatorInput.js';
import { listPoolsNode } from './nodes/listPools.js';
import { pollCycleNode } from './nodes/pollCycle.js';
import { prepareOperatorNode } from './nodes/prepareOperator.js';
import { summarizeNode } from './nodes/summarize.js';
import { bootstrapNode } from './nodes/bootstrap.js';
import { normalizeHexAddress } from './context.js';
import { saveBootstrapContext } from './store.js';

const store = new InMemoryStore();

const rawAgentPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
if (!rawAgentPrivateKey) {
  throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
}
const agentPrivateKey = normalizeHexAddress(rawAgentPrivateKey, 'agent private key');
const account = privateKeyToAccount(agentPrivateKey);
const agentWalletAddress = normalizeHexAddress(account.address, 'agent wallet address');

await saveBootstrapContext({ account, agentWalletAddress }, store);

const workflow = new StateGraph(ClmmStateAnnotation)
  .addNode('bootstrap', bootstrapNode)
  .addNode('listPools', listPoolsNode)
  .addNode('collectOperatorInput', collectOperatorInputNode)
  .addNode('prepareOperator', prepareOperatorNode)
  .addNode('pollCycle', pollCycleNode, { ends: ['pollCycle', 'summarize'] })
  .addNode('summarize', summarizeNode)
  .addEdge(START, 'bootstrap')
  .addEdge('bootstrap', 'listPools')
  .addEdge('listPools', 'collectOperatorInput')
  .addEdge('collectOperatorInput', 'prepareOperator')
  .addEdge('prepareOperator', 'pollCycle')
  .addEdge('pollCycle', 'summarize')
  .addEdge('pollCycle', 'pollCycle')
  .addEdge('summarize', END);

export const clmmGraph = workflow.compile({
  checkpointer: memory,
  store,
});

export { executeDecision } from './execution.js';
export type { ClmmEvent, ClmmState, OperatorInterrupt } from './context.js';
