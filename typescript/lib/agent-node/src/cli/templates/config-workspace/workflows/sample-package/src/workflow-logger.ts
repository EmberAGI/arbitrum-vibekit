export type WorkflowLogLevel = 'info' | 'warn' | 'error';

export const logWorkflowEvent = (message: string, level: WorkflowLogLevel = 'info'): void => {
  const prefix = `[workflow:${level}]`;
  if (level === 'error') {
    console.error(prefix, message);
    return;
  }

  if (level === 'warn') {
    console.warn(prefix, message);
    return;
  }

  console.info(prefix, message);
};
