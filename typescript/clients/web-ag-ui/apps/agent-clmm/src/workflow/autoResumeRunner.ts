import {
  Command,
  INTERRUPT,
  isGraphInterrupt,
  isInterrupted,
  type Interrupt,
} from '@langchain/langgraph';

export type GraphInvoker<TInvokeInput, TOutput, TConfig> = {
  invoke: (input: TInvokeInput, config?: TConfig) => Promise<TOutput>;
};

export type InterruptResolver = (interrupt: Interrupt<unknown>) => unknown;

export type RunGraphWithAutoResumeArgs<TInvokeInput, TOutput, TConfig> = {
  graph: GraphInvoker<TInvokeInput, TOutput, TConfig>;
  initialInput: TInvokeInput;
  config?: TConfig;
  resolveResumeValue: InterruptResolver;
  makeResumeInput?: (resumeValue: unknown) => TInvokeInput;
  maxInterrupts?: number;
};

export async function runGraphWithAutoResume<TInput, TOutput, TConfig>({
  graph,
  initialInput,
  config,
  resolveResumeValue,
  makeResumeInput,
  maxInterrupts = 10,
}: RunGraphWithAutoResumeArgs<TInput, TOutput, TConfig>): Promise<TOutput> {
  const resumeInputFactory =
    makeResumeInput ??
    ((resumeValue: unknown) => new Command({ resume: resumeValue }) as unknown as TInput);

  let input: TInput = initialInput;
  let interruptsHandled = 0;

  while (true) {
    try {
      const output = await graph.invoke(input, config);

      if (isInterrupted<unknown>(output)) {
        const interrupt = output[INTERRUPT][0];
        if (!interrupt) {
          return output;
        }

        interruptsHandled += 1;
        if (interruptsHandled > maxInterrupts) {
          throw new Error(
            `Exceeded maxInterrupts (${maxInterrupts}) while attempting to auto-resume the graph.`,
          );
        }

        const resumeValue = resolveResumeValue(interrupt);
        input = resumeInputFactory(resumeValue);
        continue;
      }

      return output;
    } catch (error: unknown) {
      if (!isGraphInterrupt(error)) {
        throw error;
      }

      const interrupt = error.interrupts[0];
      if (!interrupt) {
        throw error;
      }

      interruptsHandled += 1;
      if (interruptsHandled > maxInterrupts) {
        throw new Error(
          `Exceeded maxInterrupts (${maxInterrupts}) while attempting to auto-resume the graph.`,
        );
      }

      const resumeValue = resolveResumeValue(interrupt as Interrupt<unknown>);
      input = resumeInputFactory(resumeValue);
    }
  }
}

