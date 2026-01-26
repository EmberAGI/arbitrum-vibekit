import { Command, GraphInterrupt, INTERRUPT, type Interrupt } from '@langchain/langgraph';
import { describe, expect, it } from 'vitest';

import { runGraphWithAutoResume, type GraphInvoker } from './autoResumeRunner.js';

describe('runGraphWithAutoResume', () => {
  it('resumes after GraphInterrupt using Command({resume})', async () => {
    const interruptValue = { type: 'operator-config-request', payloadSchema: {}, message: 'x' };
    const resumeValue = { poolAddress: '0xabc', walletAddress: '0xdef' };

    let callCount = 0;
    const graph: GraphInvoker<unknown, { ok: true }, unknown> = {
      invoke: (input) => {
        callCount += 1;
        if (callCount === 1) {
          const interrupts: Interrupt[] = [{ value: interruptValue }];
          return Promise.reject(new GraphInterrupt(interrupts));
        }
        expect(input).toBeInstanceOf(Command);
        const resume = (input as Command).resume;
        expect(resume).toEqual(resumeValue);
        return Promise.resolve({ ok: true });
      },
    };

    const result = await runGraphWithAutoResume({
      graph,
      initialInput: { messages: [] },
      resolveResumeValue: (interrupt) => {
        expect(interrupt.value).toEqual(interruptValue);
        return resumeValue;
      },
    });

    expect(result).toEqual({ ok: true });
    expect(callCount).toBe(2);
  });

  it('resumes when invoke returns an interrupted value payload', async () => {
    const interruptValue = { type: 'operator-config-request', payloadSchema: {}, message: 'x' };
    const resumeValue = { poolAddress: '0xabc', walletAddress: '0xdef' };

    let callCount = 0;
    const graph: GraphInvoker<unknown, unknown, unknown> = {
      invoke: (input) => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve({ [INTERRUPT]: [{ value: interruptValue }] });
        }
        expect(input).toBeInstanceOf(Command);
        expect((input as Command).resume).toEqual(resumeValue);
        return Promise.resolve({ ok: true });
      },
    };

    const result = await runGraphWithAutoResume({
      graph,
      initialInput: { messages: [] },
      resolveResumeValue: () => resumeValue,
    });

    expect(result).toEqual({ ok: true });
    expect(callCount).toBe(2);
  });

  it('throws if it exceeds maxInterrupts', async () => {
    const graph: GraphInvoker<unknown, unknown, unknown> = {
      invoke: () => Promise.reject(new GraphInterrupt([{ value: { type: 'operator-config-request' } }])),
    };

    await expect(
      runGraphWithAutoResume({
        graph,
        initialInput: { messages: [] },
        resolveResumeValue: () => ({ poolAddress: '0xabc', walletAddress: '0xdef' }),
        maxInterrupts: 1,
      }),
    ).rejects.toThrow(/maxInterrupts/i);
  });
});
