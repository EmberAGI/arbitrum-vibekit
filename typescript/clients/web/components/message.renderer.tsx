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
import { Swaps } from './Swaps';
import { Pendle } from './Pendle';
import { Lending } from './Lending';
import { Liquidity } from './Liquidity';
import type { Dispatch } from 'react';
import { TemplateComponent } from './TemplateComponent';
import { PriceChart } from './price-chart';

interface MessageRendererProps {
  message: UIMessage;
  part: UIMessage['parts'][number];
  isLoading: boolean;
  mode: 'view' | 'edit';
  setMode: Dispatch<React.SetStateAction<'view' | 'edit'>>;
  isReadonly: boolean;
  setMessages: UseChatHelpers['setMessages'];
  reload: UseChatHelpers['reload'];
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
}: MessageRendererProps) => {
  const { role } = message;
  const { type } = part;
  console.log(part);

  if (type === 'reasoning') {
    return (
      <MessageReasoning isLoading={isLoading} reasoning={part.text} />
    );
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

        <div
          data-testid="message-content"
          className={cn('flex flex-col gap-4', {
            'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
              role === 'user',
          })}
        >
          <Markdown>{part.text}</Markdown>
        </div>
      </div>
    );
  }

  if (type === 'text' && mode === 'edit') {
    return (
      <div className="flex flex-row gap-2 items-start">
        <div className="size-8" />

        <MessageEditor
          key={message.id}
          message={message}
          setMode={setMode}
          setMessages={setMessages}
          reload={reload}
        />
      </div>
    );
  }

  if (type === 'tool-call') {
    const toolCall = part as unknown as { toolName: string; toolCallId: string; input: unknown };
    const { toolName, toolCallId, input: args } = toolCall;

    console.log('tool-call', toolCall);
    return (
      <div
        key={toolCallId}
        className={cx({
          skeleton:
            ['getWeather'].includes(toolName) ||
            ['askSwapAgent'].includes(toolName),
        })}
      >
        {toolName.endsWith('getWeather') ? (
          <Weather />
        ) : toolName.endsWith('createDocument') ? (
          <DocumentPreview isReadonly={isReadonly} args={args as never} />
        ) : toolName === 'updateDocument' ? (
          <DocumentToolCall type="update" args={args as never} isReadonly={isReadonly} />
        ) : toolName.endsWith('requestSuggestions') ? (
          <DocumentToolCall
            type="request-suggestions"
            args={args as never}
            isReadonly={isReadonly}
          />
        ) : toolName.endsWith('generate_chart') ||
          toolName === 'coingecko-generate_chart' ? (
          <div className="flex items-center gap-3 p-4 border border-blue-200 rounded-lg bg-blue-50">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            <p className="text-blue-700">
              Generating price chart for {(args as { token?: string }).token}...
            </p>
          </div>
        ) : toolName.endsWith('askSwapAgent') ? (
          <Swaps txPreview={null} txPlan={null} />
        ) : toolName.endsWith('askLendingAgent') ? (
          <Lending txPreview={null} txPlan={null} />
        ) : toolName.endsWith('askLiquidityAgent') ? (
          <Liquidity
            positions={null}
            txPreview={null}
            txPlan={null}
            pools={null}
          />
        ) : toolName.endsWith('askYieldTokenizationAgent') ? (
          <Pendle
            txPreview={null}
            txPlan={null}
            markets={[]}
            isMarketList={false}
          />
        ) : (
          <TemplateComponent txPreview={null} txPlan={null} />
        )}
      </div>
    );
  }

  if (type === 'tool-result') {
    const toolResult = part as unknown as { output: unknown; toolCallId: string; toolName: string };
    const { output: result, toolCallId, toolName } = toolResult;

    // // Handle local generateChart tool (legacy)
    // if (toolName.endsWith('generateChart')) {
    //   return <PriceChart data={result as any} />;
    // }

    // Handle MCP server chart generation tools
    if (
      toolName.endsWith('generate_chart') ||
      toolName === 'coingecko-generate_chart'
    ) {
      try {
        const resultData = result as { result?: { content?: Array<{ text?: string }> } };
        const mcpResultString = resultData?.result?.content?.[0]?.text;
        if (mcpResultString) {
          const chartData = JSON.parse(mcpResultString);
          console.log('🔍 [MCP Chart] Parsed chart data:', chartData);
          return <PriceChart data={chartData} />;
        }
      } catch (error) {
        console.error('🔍 [MCP Chart] Error parsing chart data:', error);
        return (
          <div className="p-4 border border-red-200 rounded-lg bg-red-50">
            <p className="text-red-700">Error loading chart data</p>
          </div>
        );
      }
    }

    const resultData = result as { result?: { content?: Array<{ text?: string; resource?: { text?: string } }> } };
    const toolInvocationParsableString = resultData?.result?.content?.[0]?.text
      ? resultData?.result?.content?.[0]?.text
      : resultData?.result?.content?.[0]?.resource?.text;
    const toolInvocationResult = resultData?.result?.content?.[0]
      ? JSON.parse(
          toolInvocationParsableString ||
            '{Error: An error occurred while parsing the result}',
        )
      : null;
    const getKeyFromResult = (key: string) =>
      toolInvocationResult?.artifacts?.[0]?.parts[0]?.data?.[key] || null;

    // Default keys
    const txPlan = getKeyFromResult('txPlan');
    const txPreview = getKeyFromResult('txPreview');

    const getParts = () =>
      toolInvocationResult?.artifacts
        ? toolInvocationResult?.artifacts[0]?.parts
        : null;
    const getArtifact = () =>
      toolInvocationResult?.artifacts
        ? toolInvocationResult?.artifacts[0]
        : null;

    return (
      <div key={toolCallId}>
        {toolName.endsWith('getWeather') ? (
          <Weather weatherAtLocation={result as never} />
        ) : toolName.endsWith('createDocument') ? (
          <DocumentPreview isReadonly={isReadonly} result={result as never} />
        ) : toolName.endsWith('updateDocument') ? (
          <DocumentToolResult
            type="update"
            result={result as never}
            isReadonly={isReadonly}
          />
        ) : toolName.endsWith('requestSuggestions') ? (
          <DocumentToolResult
            type="request-suggestions"
            result={result as never}
            isReadonly={isReadonly}
          />
        ) : toolName.endsWith('askSwapAgent') ? (
          toolInvocationResult && (
            <Swaps txPreview={txPreview} txPlan={txPlan} />
          )
        ) : toolName.endsWith('askLendingAgent') ? (
          toolInvocationResult && (
            <Lending txPreview={txPreview} txPlan={txPlan} />
          )
        ) : toolName.endsWith('askLiquidityAgent') ? (
          toolInvocationResult && (
            <Liquidity
              positions={getKeyFromResult('positions')}
              pools={getKeyFromResult('pools')}
              txPreview={txPreview}
              txPlan={txPlan}
            />
          )
        ) : toolName.endsWith('askYieldTokenizationAgent') ? (
          toolInvocationResult && (
            <Pendle
              txPreview={txPreview}
              txPlan={txPlan}
              markets={getParts()}
              isMarketList={getArtifact()?.name === 'yield-markets'}
            />
          )
        ) : (
          <TemplateComponent
            txPreview={txPreview}
            txPlan={txPlan}
            jsonObject={toolInvocationResult}
          />
        )}
      </div>
    );
  }

  // Default return for unhandled part types
  return null;
};
