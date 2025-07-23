'use client';

import type { UIMessage } from 'ai';
import cx from 'classnames';
import { DocumentToolCall, DocumentToolResult } from './document';
import { PencilEditIcon } from './icons';
import { Markdown } from './markdown';
import { Weather } from './weather';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { Dispatch } from 'react';
import { DynamicComponentRenderer } from '../lib/component-loader';
import { useDynamicSidepanel } from '../lib/sidepanel-loader';
import { useEffect } from 'react';

interface MessageRendererProps {
  message: UIMessage;
  part: UIMessage['parts'][number];
  isLoading: boolean;
  mode: 'view' | 'edit';
  setMode: Dispatch<React.SetStateAction<'view' | 'edit'>>;
  isReadonly: boolean;
  setMessages: UseChatHelpers['setMessages'];
  reload: UseChatHelpers['reload'];
  selectedAgentId?: string;
}

export const MessageRenderer = ({
  part,
  isLoading,
  mode,
  message,
  setMode,
  isReadonly,
  setMessages,
  reload,
  selectedAgentId,
}: MessageRendererProps) => {
  const { role } = message;
  const { type } = part;
  const { triggerSidepanel } = useDynamicSidepanel();

  console.log(part);

  // Extract complex expressions to variables for better dependency tracking
  const toolInvocationState = type === 'tool-invocation' ? (part as any).toolInvocation?.state : null;
  const toolCallId = type === 'tool-invocation' ? (part as any).toolInvocation?.toolCallId : null;

  // Move useEffect to top level to comply with Rules of Hooks
  // Optimize dependencies to prevent infinite loops
  useEffect(() => {
    // Only trigger sidepanel for tool invocation results with selectedAgentId
    if (
      type === 'tool-invocation' &&
      toolInvocationState === 'result' &&
      selectedAgentId &&
      selectedAgentId !== 'all' // Don't trigger for 'all' agent selection
    ) {
      const { toolInvocation } = part as any;
      const { result, toolName, toolCallId } = toolInvocation;

      // Avoid triggering for undefined/null results
      if (!result?.result?.content?.[0]) {
        return;
      }

      // Create a unique key to prevent duplicate triggers for the same tool call
      const triggerKey = `${toolCallId}-${selectedAgentId}`;

      // Use a simple way to track already processed tool calls
      if ((window as any).__processedToolCalls) {
        if ((window as any).__processedToolCalls.has(triggerKey)) {
          console.log('🎭 Tool call already processed, skipping sidepanel trigger:', triggerKey);
          return;
        }
      } else {
        (window as any).__processedToolCalls = new Set();
      }

      // Mark this tool call as processed
      (window as any).__processedToolCalls.add(triggerKey);

      const toolInvocationParsableString = result?.result?.content?.[0]?.text
        ? result?.result?.content?.[0]?.text
        : result?.result?.content?.[0]?.resource?.text;

      let toolInvocationResult = null;
      try {
        toolInvocationResult = result?.result?.content?.[0]
          ? JSON.parse(toolInvocationParsableString || '{}')
          : null;
      } catch (error) {
        console.warn('Failed to parse tool invocation result:', error);
        return;
      }

      if (toolInvocationResult) {
        const getKeyFromResult = (key: string) =>
          toolInvocationResult?.artifacts?.[0]?.parts[0]?.data?.[key] || null;
        const txPlan = getKeyFromResult('txPlan');
        const txPreview = getKeyFromResult('txPreview');

        console.log('🎯 Processing tool invocation for sidepanel triggers:', { toolCallId, toolName, selectedAgentId });

        // Trigger sidepanel for tool invocation (but only once per unique combination)
        triggerSidepanel(selectedAgentId, 'on-tool-invocation', {
          toolName,
          toolInvocationResult,
          txPreview,
          txPlan,
          isReadonly,
        }).catch((error: any) => {
          console.error('Failed to trigger on-tool-invocation sidepanel:', error);
        });

        // Also check for property-based triggers (but only once per unique combination)
        triggerSidepanel(selectedAgentId, 'on-property-existence', {
          toolName,
          toolInvocationResult,
          txPreview,
          txPlan,
          isReadonly,
        }).catch((error: any) => {
          console.error('Failed to trigger on-property-existence sidepanel:', error);
        });
      }
    }
  }, [
    // Use more stable dependencies to prevent constant re-runs
    type,
    toolInvocationState,
    toolCallId,
    selectedAgentId,
    isReadonly,
    part,
    triggerSidepanel
  ]);

  if (type === 'reasoning') {
    return <MessageReasoning isLoading={isLoading} reasoning={part.reasoning} />;
  }

  if (type === 'text' && mode === 'view') {
    return (
      <div className="flex flex-row gap-2 items-start">
        {role === 'user' && !isReadonly && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="message-edit-button"
                variant="ghost"
                className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                onClick={() => {
                  setMode('edit');
                }}
              >
                <PencilEditIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit message</TooltipContent>
          </Tooltip>
        )}
        <Markdown>{part.text}</Markdown>
      </div>
    );
  }

  if (type === 'text' && mode === 'edit') {
    return (
      <MessageEditor
        setMode={setMode}
        reload={reload}
        setMessages={setMessages}
        message={message}
      />
    );
  }

  if (type === 'tool-invocation' && part.toolInvocation.state === 'call') {
    const { toolName, toolCallId, args } = part.toolInvocation;

    if (toolName === 'getWeather') {
      return (
        <div key={toolCallId} className={cx({ skeleton: isLoading })}>
          <Weather weatherAtLocation={args.location} />
        </div>
      );
    }

    if (toolName === 'retrieveDocuments') {
      return (
        <div key={toolCallId}>
          <DocumentToolCall type="create" args={args} isReadonly={isReadonly} />
        </div>
      );
    }

    return (
      <div
        key={toolCallId}
        className={cx({
          skeleton: ['getWeather'].includes(toolName) || ['askSwapAgent'].includes(toolName),
        })}
      >
        <DynamicComponentRenderer
          toolName={toolName}
          txPreview={null}
          txPlan={null}
          isReadonly={isReadonly}
          args={args}
        />
      </div>
    );
  }

  if (type === 'tool-invocation' && part.toolInvocation.state === 'result') {
    const { toolInvocation } = part;
    const { result, toolCallId, toolName } = toolInvocation;

    if (toolName === 'getWeather') {
      const { temperature, description, location } = result;
      return (
        <div key={toolCallId}>
          <Weather weatherAtLocation={result} />
        </div>
      );
    }

    if (toolName === 'retrieveDocuments') {
      return (
        <div key={toolCallId}>
          <DocumentToolResult
            type="create"
            result={result}
            isReadonly={isReadonly}
          />
        </div>
      );
    }

    const toolInvocationParsableString = result?.result?.content?.[0]?.text
      ? result?.result?.content?.[0]?.text
      : result?.result?.content?.[0]?.resource?.text;
    const toolInvocationResult = result?.result?.content?.[0]
      ? JSON.parse(
        toolInvocationParsableString || '{Error: An error occurred while parsing the result}'
      )
      : null;
    const getKeyFromResult = (key: string) =>
      toolInvocationResult?.artifacts?.[0]?.parts[0]?.data?.[key] || null;

    // Default keys
    const txPlan = getKeyFromResult('txPlan');
    const txPreview = getKeyFromResult('txPreview');

    return (
      <div key={toolCallId}>
        <DynamicComponentRenderer
          toolName={toolName}
          toolInvocationResult={toolInvocationResult}
          txPreview={txPreview}
          txPlan={txPlan}
          isReadonly={isReadonly}
          result={result}
        />
      </div>
    );
  }
};
