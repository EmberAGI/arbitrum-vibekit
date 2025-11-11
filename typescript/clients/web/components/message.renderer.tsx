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
import { AutoSynth } from './AutoSynth';
import type { Dispatch } from 'react';
import { TemplateComponent } from './TemplateComponent';

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
  console.log('[MessageRenderer] Part:', part);
  console.log('[MessageRenderer] Part type:', type);

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

        <div
          data-testid="message-content"
          className={cn('flex flex-col gap-4', {
            'bg-primary text-primary-foreground px-3 py-2 rounded-xl': role === 'user',
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

  if (type === 'tool-invocation' && part.toolInvocation.state === 'call') {
    const { toolInvocation } = part;
    const { toolName, toolCallId, args } = toolInvocation;

    console.log('toolInvocation', toolInvocation);
    return (
      <div
        key={toolCallId}
        className={cx({
          skeleton: ['getWeather'].includes(toolName) || ['askSwapAgent'].includes(toolName),
        })}
      >
        {toolName.endsWith('getWeather') ? (
          <Weather />
        ) : toolName.endsWith('createDocument') ? (
          <DocumentPreview isReadonly={isReadonly} args={args} />
        ) : toolName === 'updateDocument' ? (
          <DocumentToolCall type="update" args={args} isReadonly={isReadonly} />
        ) : toolName.endsWith('requestSuggestions') ? (
          <DocumentToolCall type="request-suggestions" args={args} isReadonly={isReadonly} />
        ) : toolName.endsWith('askSwapAgent') ? (
          <Swaps txPreview={null} txPlan={null} />
        ) : toolName.endsWith('askLendingAgent') ? (
          <Lending txPreview={null} txPlan={null} />
        ) : toolName.endsWith('askLiquidityAgent') ? (
          <Liquidity positions={null} txPreview={null} txPlan={null} pools={null} />
        ) : toolName.endsWith('askYieldTokenizationAgent') ? (
          <Pendle txPreview={null} txPlan={null} markets={[]} isMarketList={false} />
        ) : toolName.includes('autosynth') || toolName.includes('createTimeJob') || toolName.includes('job-management-skill') ? (
          <AutoSynth txPreview={null} jobData={null} />
        ) : (
          <TemplateComponent txPreview={null} txPlan={null} />
        )}
      </div>
    );
  }

  if (type === 'tool-invocation' && part.toolInvocation.state === 'result') {
    const { toolInvocation } = part;
    const { result, toolCallId, toolName } = toolInvocation;
    console.log('[MessageRenderer] Tool result - toolName:', toolName);
    console.log('[MessageRenderer] Tool result - full result:', JSON.stringify(result, null, 2));
    
    let toolInvocationResult: any = null;
    
    // First try: MCP A2A response format - result.content[0].resource.text (most common for skills)
    if (result?.content?.[0]?.resource?.text) {
      console.log('[MessageRenderer] Found MCP A2A resource format');
      try {
        toolInvocationResult = JSON.parse(result.content[0].resource.text);
        console.log('[MessageRenderer] Successfully parsed A2A Task from resource.text');
      } catch (_e) {
        console.log('[MessageRenderer] Failed to parse resource.text as JSON');
      }
    }
    
    // Second try: Nested result.content[0].resource.text (some MCP wrappers)
    if (!toolInvocationResult && result?.result?.content?.[0]?.resource?.text) {
      console.log('[MessageRenderer] Found nested MCP resource format');
      try {
        toolInvocationResult = JSON.parse(result.result.content[0].resource.text);
        console.log('[MessageRenderer] Successfully parsed from nested resource.text');
      } catch (_e) {
        console.log('[MessageRenderer] Failed to parse nested resource text');
      }
    }
    
    // Third try: Direct text content
    if (!toolInvocationResult && result?.content?.[0]?.text) {
      console.log('[MessageRenderer] Found direct text content');
      try {
        toolInvocationResult = JSON.parse(result.content[0].text);
      } catch (_e) {
        console.log('[MessageRenderer] Failed to parse direct text');
      }
    }
    
    // Fourth try: If result is already a Task object (direct return)
    if (!toolInvocationResult && result?.result && typeof result.result === 'object' && !Array.isArray(result.result)) {
      console.log('[MessageRenderer] Using result as object directly');
      // Check if it's already a Task with artifacts
      if (result.result.artifacts || result.result.kind === 'task') {
        toolInvocationResult = result.result;
      } else {
        toolInvocationResult = result.result;
      }
    }
    
    // Fifth try: String result that needs parsing
    if (!toolInvocationResult && typeof result?.result === 'string') {
      console.log('[MessageRenderer] Result is a string, attempting to parse');
      try {
        toolInvocationResult = JSON.parse(result.result);
      } catch (_e) {
        console.log('[MessageRenderer] Failed to parse string result');
      }
    }
    
    // Fallback
    if (!toolInvocationResult) {
      console.log('[MessageRenderer] No result found, creating raw wrapper');
      toolInvocationResult = { raw: result?.result || result };
    }
    const getKeyFromResult = (key: string) => {
      // Try extracting from artifact parts data
      const artifactData = toolInvocationResult?.artifacts?.[0]?.parts?.[0]?.data;
      if (artifactData?.[key]) {
        return artifactData[key];
      }
      // Fallback: if artifactData is the full object (like txArtifact), extract from it
      if (artifactData?.txPreview && key === 'txPreview') {
        return artifactData.txPreview;
      }
      if (artifactData?.jobData && key === 'jobData') {
        return artifactData.jobData;
      }
      return null;
    };

    // Default keys
    const txPlan = getKeyFromResult('txPlan');
    const txPreview = getKeyFromResult('txPreview');
    
    console.log('[MessageRenderer] Parsed toolInvocationResult:', JSON.stringify(toolInvocationResult, null, 2));
    console.log('[MessageRenderer] Artifacts:', toolInvocationResult?.artifacts);
    console.log('[MessageRenderer] txPreview from artifact:', txPreview);
    console.log('[MessageRenderer] jobData from artifact:', getKeyFromResult('jobData'));
    console.log('[MessageRenderer] Raw data in artifact parts:', toolInvocationResult?.artifacts?.[0]?.parts?.[0]?.data);

    const getParts = () =>
      Array.isArray(toolInvocationResult?.artifacts)
        ? toolInvocationResult?.artifacts?.[0]?.parts ?? null
        : null;
    const getArtifact = () =>
      Array.isArray(toolInvocationResult?.artifacts)
        ? toolInvocationResult?.artifacts?.[0] ?? null
        : null;

    return (
      <div key={toolCallId}>
        {toolName.endsWith('getWeather') ? (
          <Weather weatherAtLocation={result} />
        ) : toolName.endsWith('createDocument') ? (
          <DocumentPreview isReadonly={isReadonly} result={result} />
        ) : toolName.endsWith('updateDocument') ? (
          <DocumentToolResult type="update" result={result} isReadonly={isReadonly} />
        ) : toolName.endsWith('requestSuggestions') ? (
          <DocumentToolResult type="request-suggestions" result={result} isReadonly={isReadonly} />
        ) : toolName.endsWith('askSwapAgent') ? (
          toolInvocationResult && <Swaps txPreview={txPreview} txPlan={txPlan} />
        ) : toolName.endsWith('askLendingAgent') ? (
          toolInvocationResult && <Lending txPreview={txPreview} txPlan={txPlan} />
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
        ) : (() => {
          const artifactName = getArtifact()?.name;
          const isAutoSynth = 
            toolName.includes('autosynth') || 
            toolName.includes('createTimeJob') || 
            toolName.includes('deleteJob') ||
            toolName.includes('job-management-skill') || 
            toolName.includes('createSafeWallet') || 
            artifactName === 'triggerx-job-plan' || 
            artifactName === 'triggerx-delete-plan' ||
            artifactName === 'safe-wallet-creation';
          console.log('[MessageRenderer] AutoSynth condition check:', {
            toolName,
            isAutoSynth,
            artifactName,
            hasResult: !!toolInvocationResult
          });
          return isAutoSynth;
        })() ? (
          toolInvocationResult && (
            <AutoSynth
              txPreview={getKeyFromResult('txPreview') || txPreview}
              jobData={getKeyFromResult('jobData') || getArtifact()?.parts?.[0]?.data?.jobData || getArtifact()?.parts?.[0]?.data}
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
};
