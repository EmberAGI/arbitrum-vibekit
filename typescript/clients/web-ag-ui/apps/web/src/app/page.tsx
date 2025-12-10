'use client';

import { useCoAgent, useCopilotContext } from '@copilotkit/react-core';
import { CopilotKitCSSProperties, CopilotSidebar } from '@copilotkit/react-ui';
import type { AIMessage } from '@copilotkit/shared';
import { type ChangeEvent } from 'react';
import { v7 } from 'uuid';
import { useAgentStateSnapshotLoader } from './hooks/useAgentStateSnapshotLoader';

// • Multiple threads

//   - CopilotKit exposes thread management on the provider context: threads,
//     selectedThreadId, selectThread, createThread, createAndSelectThread all live on the
//     same context that powers the chat UI. Use these to list threads and switch or create
//     new ones; the provider will reload state/messages for the newly selected thread.
//     (copilotjs.com (https://www.copilotjs.com/docs/react/use-copilot?utm_source=openai))
//   - useCopilotContext() (and the higher-level useCopilot) and useCoAgent() read/write
//     the same CopilotKit context; useCoAgent pulls threadId and state refs from that
//     context for synchronization. Switching the thread via setThreadId or selectThread
//     immediately changes which agent state/messages useCoAgent loads. (deepwiki.com
//     (https://deepwiki.com/CopilotKit/CopilotKit/3.1.4-copilotkit-provider-and-context?
//     utm_source=openai))

//   Recommended pattern for multi-thread apps

//   - Mount one <CopilotKit> per logical user/session, then drive thread selection
//     explicitly in UI (e.g., a sidebar list that calls selectThread(id); a “New chat”
//     button that calls createAndSelectThread()).
//   - If you need per-view isolation (e.g., multiple widgets on a page), pass an explicit
//     threadId prop to each <CopilotKit> instance so each widget is pinned to its own
//     thread; otherwise they’ll share the auto-generated thread in the shared provider.

export default function CopilotKitPage() {
  const themeColor = '#6366f1';

  return (
    <main style={{ '--copilot-kit-primary-color': themeColor } as CopilotKitCSSProperties}>
      <YourMainContent themeColor={themeColor} />
    </main>
  );
}

type Task = {
  id: string;
  taskStatus: TaskStatus;
};

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

type TaskStatus = {
  state: TaskState;
  message?: AIMessage;
  timestamp?: string; // ISO 8601
};

// State of the agent, make sure this aligns with your agent's state.
type AgentState = {
  command?: string;
  amount?: number;
  task?: Task;
  messages?: AIMessage[];
};

const initialAgentState: AgentState = {
  command: 'idle',
  amount: 0,
};

const AGENT_NAME = 'agent-clmm';

function YourMainContent({ themeColor }: { themeColor: string }) {
  // 🪁 Shared State: https://docs.copilotkit.ai/coagents/shared-state
  const { state, setState, run } = useCoAgent<AgentState>({
    name: AGENT_NAME,
    initialState: initialAgentState,
  });
  const { threadId } = useCopilotContext();
  const loadAgentStateSnapshot = useAgentStateSnapshotLoader<AgentState>(AGENT_NAME);

  const COMMAND_HIRE = {
    command: 'hire',
  };

  const COMMAND_FIRE = {
    command: 'fire',
  };

  const COMMAND_INVALID = {
    command: 'invalid',
  };

  // TODO: Can we perform concurrent runs?

  // Parallel calls to run

  // - AG-UI guidance is to avoid concurrent agent runs/tool calls; trigger a run, wait for
  //   completion/stream to end, then start the next. CopilotKit’s runtime and many backends
  //   assume serial tool-call ordering, and concurrent runs can produce dropped or rejected
  //   events. (copilotkit.ai (https://www.copilotkit.ai/blog/how-to-make-agents-talk-to-
  //   each-other-and-your-app-using-a2a-ag-ui?utm_source=openai))
  // - CopilotKit surfaces a disableParallelToolCalls flag on adapters to force sequential
  //   execution, reflecting that parallel execution isn’t reliably supported. (github.com
  //   (https://github.com/CopilotKit/CopilotKit/issues/2462?utm_source=openai))
  // - If you invoke run twice before the first finishes, both will fire, but you
  //   risk interleaved or rejected tool events and non-deterministic state; practical
  //   recommendation is to serialize per thread (queue locally or disable the trigger while
  //   isRunning).

  const refreshAgentState = async () => {
    if (!threadId) return;
    const snapshot = await loadAgentStateSnapshot(threadId);
    if (snapshot?.state) {
      setState(snapshot.state);
    }
  };

  const runCommandHire = () => {
    run(({ previousState, currentState }) => {
      return {
        id: v7(),
        role: 'user',
        content: JSON.stringify(COMMAND_HIRE),
      };
    });
  };

  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    if (value === '') {
      setState((prev) => ({ ...(prev ?? initialAgentState), amount: undefined }));
      return;
    }

    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
      return;
    }

    setState((prev) => ({ ...(prev ?? initialAgentState), amount: numericValue }));
  };

  const runCommandFire = () => {
    run(({ previousState, currentState }) => {
      return {
        id: v7(),
        role: 'user',
        content: JSON.stringify(COMMAND_FIRE),
      };
    });
  };

  const runCommandInvalid = () => {
    run(({ previousState, currentState }) => {
      return {
        id: v7(),
        role: 'user',
        content: JSON.stringify(COMMAND_INVALID),
      };
    });
  };

  const runSendMessage = () => {
    run(({ previousState, currentState }) => {
      return {
        id: v7(),
        role: 'user',
        content: 'Hello, how are you?',
      };
    });
  };

  return (
    <div
      style={{ backgroundColor: themeColor }}
      className="h-screen w-screen flex justify-center items-center flex-col transition-colors duration-300"
    >
      <div className="relative group bg-white/20 backdrop-blur-md p-8 rounded-2xl shadow-xl max-w-2xl w-full">
        <h1 className="text-4xl font-bold text-white mb-2 text-center">DeFi Agent</h1>
        <p className="text-gray-200 text-center italic mb-6">
          This agent autonomously trades on DeFi protocols! 📈
        </p>
        <hr className="border-white/20 my-6" />
        <div className="mt-4 bg-white/10 border border-white/20 rounded-lg p-4 text-white">
          <label
            className="block text-xs uppercase tracking-wide text-white/70 mb-2"
            htmlFor="amount"
          >
            Amount
          </label>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            step="any"
            value={state?.amount ?? ''}
            onChange={handleAmountChange}
            className="w-full rounded-md bg-white/20 border border-white/30 px-3 py-2 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/60"
            placeholder="Enter trade amount"
          />
        </div>
        <button
          onClick={() => runCommandHire()}
          className="relative mx-auto mt-4 opacity-50 group-hover:opacity-100 transition-opacity
            bg-red-500 hover:bg-red-600 text-white rounded-full px-4 py-2 flex items-center justify-center"
        >
          Hire
        </button>
        <button
          onClick={() => runCommandFire()}
          className="relative mx-auto mt-4 opacity-50 group-hover:opacity-100 transition-opacity
            bg-red-500 hover:bg-red-600 text-white rounded-full px-4 py-2 flex items-center justify-center"
        >
          Fire
        </button>
        <button
          onClick={() => runCommandInvalid()}
          className="relative mx-auto mt-4 opacity-50 group-hover:opacity-100 transition-opacity
            bg-red-500 hover:bg-red-600 text-white rounded-full px-4 py-2 flex items-center justify-center"
        >
          Invalid
        </button>
        <button
          onClick={() => runSendMessage()}
          className="relative mx-auto mt-4 opacity-50 group-hover:opacity-100 transition-opacity
            bg-red-500 hover:bg-red-600 text-white rounded-full px-4 py-2 flex items-center justify-center"
        >
          Send Message
        </button>
        <button
          onClick={() => void refreshAgentState()}
          className="relative mx-auto mt-4 opacity-50 group-hover:opacity-100 transition-opacity
            bg-white/20 hover:bg-white/30 text-white rounded-full px-4 py-2 flex items-center justify-center border border-white/40"
        >
          Reload Saved State
        </button>
        <hr className="border-white/20 my-6" />
        <div className="mt-4 bg-white/10 border border-white/20 rounded-lg p-4 text-white">
          <p className="text-xs uppercase tracking-wide text-white/70">Command</p>
          <p className="text-lg font-semibold">{state?.command ?? '—'}</p>
        </div>
        <hr className="border-white/20 my-6" />
        <div className="mt-4 bg-white/10 border border-white/20 rounded-lg p-4 text-white">
          <p className="text-xs uppercase tracking-wide text-white/70">Task</p>
          <p className="text-lg font-semibold">{state?.task?.id ?? '—'}</p>
          <p className="text-lg font-semibold">{state?.task?.taskStatus.state ?? '—'}</p>
          <p className="text-lg font-semibold">{state?.task?.taskStatus.message?.content ?? '—'}</p>
        </div>
        <hr className="border-white/20 my-6" />
        <div className="mt-4 bg-white/10 border border-white/20 rounded-lg p-4 text-white">
          <p className="text-xs uppercase tracking-wide text-white/70">Messages</p>
          {state?.messages && state.messages.length > 0 ? (
            <ul className="space-y-2">
              {state.messages.map((msg, index) => (
                <li key={msg.id ?? `${msg.role}-${index}`} className="text-sm leading-tight">
                  <span className="font-semibold uppercase text-white/60">{msg.role}:</span>{' '}
                  <span className="text-white">
                    {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-lg font-semibold">—</p>
          )}
        </div>
      </div>
    </div>
  );
}
