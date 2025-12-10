/**
 * This is the main entry point for the agent.
 * It defines the workflow graph, state, tools, nodes and edges.
 */

import { CopilotKitStateAnnotation } from '@copilotkit/sdk-js/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { v7 } from 'uuid';
import { z } from 'zod';

type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'rejected'
  | 'auth-required'
  | 'unknown';

// 1. Define our agent state, which includes CopilotKit state to
//    provide actions to the state.
const AgentStateAnnotation = Annotation.Root({
  ...CopilotKitStateAnnotation.spec, // CopilotKit state annotation already includes messages, as well as frontend tools
  command: Annotation<string[]>,
  amount: Annotation<number>,
  task: Annotation<Task>,
});

// 2. Define the type for our agent state
export type AgentState = typeof AgentStateAnnotation.State;

type AgentMessage = AgentState['messages'][number];

type TaskStatus = {
  state: TaskState;
  message?: AgentMessage;
  timestamp?: string; // ISO 8601
};

type Task = {
  id: string;
  taskStatus: TaskStatus;
};

const commandSchema = z.object({
  command: z.enum(['hire', 'fire']),
});

// 5. Define the chat node, which will handle the chat logic
function chat_node(state: AgentState): AgentState {
  console.info('state.copilotkit:', state.copilotkit);
  return state;
}

function hire_node(state: AgentState): AgentState {
  const amount = state.amount;
  console.info('amount:', amount);

  if (state.task && isTaskActive(state.task.taskStatus.state)) {
      const message = new AIMessage({
        id: v7(),
        content: `Task ${state.task.id} is already in a active state.`,
      });
      return {
        ...state,
        messages: [...state.messages, message as unknown as (typeof state.messages)[number]],
      };
    }

  const message = new AIMessage({
    id: v7(),
    content: `Agent hired! Trading ${amount} tokens...`,
  });

  const taskStatus: TaskStatus = {
    state: 'submitted',
    message: message as unknown as AgentState['messages'][number],
  };

  const task: Task = {
    id: v7(),
    taskStatus,
  };

  return {
    ...state,
    task,
    command: ['hire'],
  };
}

function fire_node(state: AgentState): AgentState {
  console.info('state.copilotkit:', state.copilotkit);

  const currentTask = state.task;

  if (isTaskTerminal(currentTask.taskStatus.state)) {
      const message = new AIMessage({
        id: v7(),
        content: `Task ${currentTask.id} is already in a terminal state.`,
      });
      return {
        ...state,
        messages: [...state.messages, message as unknown as (typeof state.messages)[number]],
      };
    }

  const message = new AIMessage({
    id: v7(),
    content: `Agent fired! It no longer trades your tokens.`,
  });

  const taskStatus: TaskStatus = {
    state: 'canceled',
    message: message as unknown as AgentState['messages'][number],
  };

  const task: Task = {
    ...currentTask,
    taskStatus,
  };

  return {
    ...state,
    task,
    command: ['fire'],
  };
}

type CommandNode = 'hire_node' | 'fire_node' | '__end__';

function runCommand({ messages }: AgentState): CommandNode {
  const lastMessage = messages[messages.length - 1];
  const content =
    typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);
  console.info('lastMessage:', content);

  let command: string;
  if (typeof lastMessage.content === 'string') {
    try {
      const parsed = commandSchema.safeParse(JSON.parse(lastMessage.content));
      if (parsed.success) {
        command = parsed.data.command;
      } else {
        command = parsed.error.message;
      }
    } catch (unknownError) {
      const errorMessage =
        unknownError instanceof Error ? unknownError.message : String(unknownError);
      console.error(errorMessage);
      command = errorMessage;
    }
  } else {
    return '__end__';
  }

  switch (command) {
    case 'hire':
      return 'hire_node';
    case 'fire':
      return 'fire_node';
    default:
      return '__end__';
  }
}

// TODO: Figure out when during the graph lifecycle state deltas are sent back to AG-UI

// • In the CopilotKit TypeScript LangGraph adapter the runtime always sends full snapshots—
//   there’s no delta emission:

//   - While streaming LangGraph events, remote-lg-action.ts emits an OnCopilotKitStateSync
//     event with the entire state object whenever the state changes, the node name changes,
//     or a node exits. That’s effectively a full snapshot per node exit (and also during
//     intermediate “predict/emit state” streams). (apps/web/node_modules/@copilotkit/
//     runtime/src/lib/runtime/remote-lg-action.ts around the exitingNode / getStateSyncEvent
//     block)
//   - If a node manually emits state (copilotkitEmitState / copilotkit:emit-intermediate-
//     state), langgraph-agent.ts turns that into a STATE_SNAPSHOT immediately. (apps/web/
//     node_modules/@copilotkit/runtime/src/lib/runtime/langgraph/langgraph-agent.ts custom-
//     event handling)
//   - When the run finishes, the runtime fetches the thread state and sends one last full
//     snapshot with messages included. (remote-lg-action.ts after the stream loop)

//   The pipeline never generates STATE_DELTA; all AgentStateMessage events the client
//   receives are full snapshots, so the client re-baselines each time.

// Define the workflow graph
const workflow = new StateGraph(AgentStateAnnotation)
  .addNode('chat_node', chat_node)
  .addNode('hire_node', hire_node)
  .addNode('fire_node', fire_node)
  .addEdge(START, 'chat_node')
  .addConditionalEdges('chat_node', (state) => runCommand(state))
  .addEdge('hire_node', END)
  .addEdge('fire_node', END);

const memory = new MemorySaver();

export const graph = workflow.compile({
  checkpointer: memory,
});

const isTaskTerminal = (state: TaskState) => {
  return (
    state === 'completed' ||
    state === 'failed' ||
    state === 'canceled' ||
    state === 'rejected' ||
    state === 'unknown'
  );
};

const isTaskActive = (state: TaskState) => {
  return (
    state === 'submitted' ||
    state === 'working' ||
    state === 'input-required' ||
    state === 'auth-required'
  );
};
