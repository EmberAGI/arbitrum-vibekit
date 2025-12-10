import { END, InMemoryStore, START, StateGraph } from '@langchain/langgraph';
import { privateKeyToAccount } from 'viem/accounts';

import { ClmmStateAnnotation, memory, normalizeHexAddress } from './workflow/context.js';
import { bootstrapNode } from './workflow/nodes/bootstrap.js';
import { collectOperatorInputNode } from './workflow/nodes/collectOperatorInput.js';
import { fireCommandNode } from './workflow/nodes/fireCommand.js';
import { hireCommandNode } from './workflow/nodes/hireCommand.js';
import { listPoolsNode } from './workflow/nodes/listPools.js';
import { pollCycleNode } from './workflow/nodes/pollCycle.js';
import { prepareOperatorNode } from './workflow/nodes/prepareOperator.js';
import { resolveCommandTarget, runCommandNode } from './workflow/nodes/runCommand.js';
import { runCycleCommandNode } from './workflow/nodes/runCycleCommand.js';
import { summarizeNode } from './workflow/nodes/summarize.js';
import { saveBootstrapContext } from './workflow/store.js';

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
  .addNode('runCommand', runCommandNode)
  .addNode('hireCommand', hireCommandNode)
  .addNode('fireCommand', fireCommandNode)
  .addNode('runCycleCommand', runCycleCommandNode)
  .addNode('bootstrap', bootstrapNode)
  .addNode('listPools', listPoolsNode)
  .addNode('collectOperatorInput', collectOperatorInputNode)
  .addNode('prepareOperator', prepareOperatorNode)
  .addNode('pollCycle', pollCycleNode, { ends: ['summarize'] })
  .addNode('summarize', summarizeNode)
  .addEdge(START, 'runCommand')
  .addConditionalEdges('runCommand', resolveCommandTarget)
  .addEdge('hireCommand', 'bootstrap')
  .addEdge('fireCommand', END)
  .addEdge('runCycleCommand', 'pollCycle')
  .addEdge('bootstrap', 'listPools')
  .addEdge('listPools', 'collectOperatorInput')
  .addEdge('collectOperatorInput', 'prepareOperator')
  .addEdge('prepareOperator', 'pollCycle')
  .addEdge('pollCycle', 'summarize')
  .addEdge('summarize', END);

export const clmmGraph = workflow.compile({
  checkpointer: memory,
  store,
});

export { executeDecision } from './workflow/execution.js';
export type { ClmmEvent, ClmmState, OperatorInterrupt } from './workflow/context.js';
