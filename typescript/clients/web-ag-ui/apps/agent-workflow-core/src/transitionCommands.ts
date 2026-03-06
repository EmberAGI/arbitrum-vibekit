type TransitionUpdate = Record<string, unknown>;
type TransitionCommandFactory<TNode extends string, TUpdate extends TransitionUpdate, TCommand> = (
  input: {
    goto: TNode;
    update?: TUpdate;
  },
) => TCommand;

const assertNonEmptyNode = (node: string): void => {
  if (node.trim().length === 0) {
    throw new Error('Interrupt transition node must be a non-empty string.');
  }
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertInputRequiredMessageInvariant = (update: TransitionUpdate | undefined): void => {
  if (!isPlainRecord(update)) {
    return;
  }

  const thread = update['thread'];
  if (!isPlainRecord(thread)) {
    return;
  }

  const task = thread['task'];
  if (!isPlainRecord(task)) {
    return;
  }

  const taskStatus = task['taskStatus'];
  if (!isPlainRecord(taskStatus)) {
    return;
  }

  const taskState = taskStatus['state'];
  if (taskState !== 'input-required') {
    return;
  }

  const message = taskStatus['message'];
  if (!isPlainRecord(message)) {
    throw new Error(
      "Invalid transition update: 'input-required' task status must include message content.",
    );
  }

  const content = message['content'];
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error(
      "Invalid transition update: 'input-required' task message content must be a non-empty string.",
    );
  }
};

const assertTerminalOnboardingInvariant = (update: TransitionUpdate | undefined): void => {
  if (!isPlainRecord(update)) {
    return;
  }

  const thread = update['thread'];
  if (!isPlainRecord(thread)) {
    return;
  }

  const onboardingFlow = thread['onboardingFlow'];
  if (!isPlainRecord(onboardingFlow)) {
    return;
  }

  const onboardingFlowStatus = onboardingFlow['status'];
  const isTerminalStatus =
    onboardingFlowStatus === 'completed' ||
    onboardingFlowStatus === 'failed' ||
    onboardingFlowStatus === 'canceled';
  if (!isTerminalStatus) {
    return;
  }

  const onboarding = thread['onboarding'];
  if (!isPlainRecord(onboarding)) {
    return;
  }

  const hasLegacyStep = typeof onboarding['step'] === 'number' && Number.isFinite(onboarding['step']);
  const hasLegacyKey =
    typeof onboarding['key'] === 'string' && onboarding['key'].trim().length > 0;
  if (hasLegacyStep || hasLegacyKey) {
    throw new Error(
      'Invalid transition update: terminal onboardingFlow status cannot include legacy onboarding step/key.',
    );
  }
};

export const buildInterruptPauseTransition = <
  TNode extends string,
  TUpdate extends TransitionUpdate,
  TCommand,
>(
  params: {
    node: TNode;
    update?: TUpdate;
    createCommand: TransitionCommandFactory<TNode, TUpdate, TCommand>;
  },
): TCommand => {
  assertNonEmptyNode(params.node);
  assertInputRequiredMessageInvariant(params.update);
  assertTerminalOnboardingInvariant(params.update);
  return params.createCommand({
    goto: params.node,
    update: params.update,
  });
};

export const buildNodeTransition = <
  TNode extends string,
  TUpdate extends TransitionUpdate,
  TCommand,
>(
  params: {
    node: TNode;
    update?: TUpdate;
    createCommand: TransitionCommandFactory<TNode, TUpdate, TCommand>;
  },
): TCommand => {
  assertNonEmptyNode(params.node);
  assertInputRequiredMessageInvariant(params.update);
  assertTerminalOnboardingInvariant(params.update);
  return params.createCommand({
    goto: params.node,
    update: params.update,
  });
};

export const buildStateUpdate = <TUpdate extends TransitionUpdate>(update: TUpdate): TUpdate => {
  assertInputRequiredMessageInvariant(update);
  assertTerminalOnboardingInvariant(update);
  return update;
};

export const buildTerminalTransition = <TUpdate extends TransitionUpdate, TCommand>(params: {
  update?: TUpdate;
  createCommand: TransitionCommandFactory<'__end__', TUpdate, TCommand>;
}): TCommand => {
  assertInputRequiredMessageInvariant(params.update);
  assertTerminalOnboardingInvariant(params.update);
  return params.createCommand({
    goto: '__end__',
    update: params.update,
  });
};
