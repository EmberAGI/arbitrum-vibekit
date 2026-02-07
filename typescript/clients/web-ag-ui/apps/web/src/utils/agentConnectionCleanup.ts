type CleanupAgent = {
  detachActiveRun?: () => Promise<void> | void;
};

export async function cleanupAgentConnection(agent: CleanupAgent): Promise<void> {
  // `abortRun()` on @ag-ui/client's HttpAgent aborts its underlying AbortController.
  // In React dev StrictMode, effect cleanups can run immediately after mount, and
  // aborting here can poison the agent instance so subsequent `connectAgent()`
  // requests are aborted on page load.
  await Promise.resolve(agent.detachActiveRun?.()).catch(() => {
    // best-effort cleanup; ignore
  });
}

