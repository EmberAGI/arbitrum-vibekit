import { Command } from '@langchain/langgraph';

export const createLangGraphCommand = <TNode extends string, TUpdate extends Record<string, unknown>>(
  input: {
    goto: TNode;
    update?: TUpdate;
  },
): Command<TNode, TUpdate> => new Command(input);
