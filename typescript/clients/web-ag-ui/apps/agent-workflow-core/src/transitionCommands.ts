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
  return params.createCommand({
    goto: params.node,
    update: params.update,
  });
};

export const buildTerminalTransition = <TUpdate extends TransitionUpdate, TCommand>(params: {
  update?: TUpdate;
  createCommand: TransitionCommandFactory<'__end__', TUpdate, TCommand>;
}): TCommand =>
  params.createCommand({
    goto: '__end__',
    update: params.update,
  });
