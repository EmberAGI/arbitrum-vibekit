type ResumeRunPayload = {
  forwardedProps: {
    command: {
      resume: string;
    };
  };
};

export type ResumeCapableAgent = {
  runAgent?: (payload: ResumeRunPayload) => Promise<unknown> | unknown;
};

export async function resumeInterruptViaAgent(params: {
  agent: ResumeCapableAgent | null;
  resumePayload: string;
}): Promise<boolean> {
  const { agent, resumePayload } = params;
  if (!agent || typeof agent.runAgent !== 'function') {
    return false;
  }

  await Promise.resolve(
    agent.runAgent({
      forwardedProps: {
        command: {
          resume: resumePayload,
        },
      },
    }),
  );

  return true;
}
