import type { Attachment, UIMessage } from 'ai';
import { formatDistance } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { type Dispatch, memo, type SetStateAction, useCallback, useEffect, useState, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useDebounceCallback, useWindowSize } from 'usehooks-ts';
import type { Document, Vote } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Toolbar } from './toolbar';
import { VersionFooter } from './version-footer';
import { ArtifactActions } from './artifact-actions';
import { ArtifactCloseButton } from './artifact-close-button';
import { ArtifactMessages } from './artifact-messages';
import { useSidebar } from './ui/sidebar';
import { useArtifact } from '@/hooks/use-artifact';
import { imageArtifact } from '@/artifacts/image/client';
import { codeArtifact } from '@/artifacts/code/client';
import { sheetArtifact } from '@/artifacts/sheet/client';
import { textArtifact } from '@/artifacts/text/client';
import { helloWorldArtifact } from '@/artifacts/agent-sidepanels/hello-world-artifact';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

// Cast to any[] to avoid complex inferred types that include non-exported generic parameters.
export const artifactDefinitions: any[] = [
  textArtifact as any,
  codeArtifact as any,
  imageArtifact as any,
  sheetArtifact as any,
  helloWorldArtifact as any,
];
export type ArtifactKind = (typeof artifactDefinitions)[number]['kind'];

export interface UIArtifact {
  title: string;
  documentId: string;
  kind: ArtifactKind;
  content: string;
  isVisible: boolean;
  status: 'streaming' | 'idle';
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

// Sidepanel mode toggle icons
function FullscreenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <line x1="9" x2="9" y1="3" y2="21" />
    </svg>
  );
}

function PureArtifact({
  chatId,
  input,
  setInput,
  handleSubmit,
  status,
  stop,
  attachments,
  setAttachments,
  append,
  messages,
  setMessages,
  reload,
  votes,
  isReadonly,
  selectedAgentId,
}: {
  chatId: string;
  input: string;
  setInput: UseChatHelpers['setInput'];
  status: UseChatHelpers['status'];
  stop: UseChatHelpers['stop'];
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers['setMessages'];
  votes: Array<Vote> | undefined;
  append: UseChatHelpers['append'];
  handleSubmit: UseChatHelpers['handleSubmit'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
  selectedAgentId?: string;
}) {
  const { artifact, setArtifact, metadata, setMetadata, toggleSidepanelMode } = useArtifact();

  // All hooks must be called before any conditional returns
  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const { open: isSidebarOpen } = useSidebar();
  const { mutate } = useSWRConfig();

  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [isContentDirty, setIsContentDirty] = useState(false);
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);

  // Only make document API calls for actual document artifacts, not agent sidepanels
  const isAgentSidepanel = artifact.documentId.includes('-') && (
    artifact.documentId.includes('hello-world') ||
    artifact.documentId.includes('lending') ||
    artifact.documentId.includes('trading')
  );

  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Array<Document>>(
    artifact.documentId !== 'init' && artifact.status !== 'streaming' && !isAgentSidepanel
      ? `/api/document?id=${artifact.documentId}`
      : null,
    fetcher
  );

  const isCurrentVersion = useMemo(() => {
    if (!documents) return true;
    return currentVersionIndex === documents.length - 1;
  }, [documents, currentVersionIndex]);

  const isMobile = windowWidth < 768;

  // Calculate responsive sizing based on sidepanel mode
  const getSidepanelDimensions = useCallback(() => {
    const sidepanelMode = artifact.sidepanelMode || 'default';

    if (isMobile || sidepanelMode === 'fullscreen') {
      // Mobile or fullscreen: take full screen
      return {
        x: 0,
        y: 0,
        width: windowWidth || '100vw',
        height: windowHeight || '100vh',
      };
    } else {
      // Desktop default mode: 33% width, positioned on the right
      const sidepanelWidth = Math.floor((windowWidth || 1200) * 0.33);
      return {
        x: (windowWidth || 1200) - sidepanelWidth,
        y: 0,
        width: sidepanelWidth,
        height: windowHeight || '100vh',
      };
    }
  }, [artifact.sidepanelMode, isMobile, windowWidth, windowHeight]);

  const sidepanelDimensions = getSidepanelDimensions();

  useEffect(() => {
    if (documents && documents.length > 0) {
      const mostRecentDocument = documents.at(-1);

      if (mostRecentDocument) {
        setDocument(mostRecentDocument);
        setCurrentVersionIndex(documents.length - 1);
        setArtifact((currentArtifact: any) => ({
          ...currentArtifact,
          content: mostRecentDocument.content ?? '',
        }));
      }
    }
  }, [documents, setArtifact]);

  useEffect(() => {
    if (!isAgentSidepanel) {
      mutateDocuments();
    }
  }, [artifact.status, mutateDocuments, isAgentSidepanel]);

  useEffect(() => {
    if (artifact.documentId !== 'init') {
      const artifactDefinition = artifactDefinitions.find(definition => definition.kind === artifact.kind);
      if (artifactDefinition?.initialize) {
        artifactDefinition.initialize({
          documentId: artifact.documentId,
          setMetadata,
        });
      }
    }
  }, [artifact.documentId, artifact.kind, setMetadata]);

  const handleContentChange = useCallback(
    (updatedContent: string) => {
      if (!artifact || isAgentSidepanel) return; // Skip for agent sidepanels

      mutate<Array<Document>>(
        `/api/document?id=${artifact.documentId}`,
        async (currentDocuments: any) => {
          if (!currentDocuments) return undefined;

          const currentDocument = currentDocuments.at(-1);

          if (!currentDocument || !currentDocument.content) {
            setIsContentDirty(false);
            return currentDocuments;
          }

          if (currentDocument.content !== updatedContent) {
            await fetch(`/api/document?id=${artifact.documentId}`, {
              method: 'POST',
              body: JSON.stringify({
                title: artifact.title,
                content: updatedContent,
                kind: artifact.kind,
              }),
            });

            setIsContentDirty(false);
            return [
              ...currentDocuments,
              {
                ...currentDocument,
                content: updatedContent,
                createdAt: new Date(),
              },
            ];
          }

          return currentDocuments;
        },
        { revalidate: false }
      );
    },
    [artifact, mutate, isAgentSidepanel]
  );

  const debouncedHandleContentChange = useDebounceCallback(handleContentChange, 2000);

  const saveContent = useCallback(
    (updatedContent: string) => {
      if (document && updatedContent !== document.content && !isAgentSidepanel) {
        setIsContentDirty(true);
        debouncedHandleContentChange(updatedContent);
      }

      setArtifact((currentArtifact: any) => ({
        ...currentArtifact,
        content: updatedContent,
      }));
    },
    [document, debouncedHandleContentChange, setArtifact, isAgentSidepanel]
  );

  const getDocumentContentById = useCallback((index: number) => {
    if (!documents) return '';
    if (!documents[index]) return '';
    return documents[index].content ?? '';
  }, [documents]);

  const handleVersionChange = useCallback(
    (type: 'latest' | 'next' | 'toggle' | 'prev') => {
      if (!documents) return;

      if (type === 'next') {
        if (currentVersionIndex < documents.length - 1) {
          setCurrentVersionIndex(currentVersionIndex + 1);
        }
      } else if (type === 'prev') {
        if (currentVersionIndex > 0) {
          setCurrentVersionIndex(currentVersionIndex - 1);
        }
      } else if (type === 'latest') {
        setCurrentVersionIndex(documents.length - 1);
      } else if (type === 'toggle') {
        // Toggle between current version and latest version
        if (currentVersionIndex === documents.length - 1) {
          // If at latest, go to previous if available
          if (documents.length > 1) {
            setCurrentVersionIndex(documents.length - 2);
          }
        } else {
          // If not at latest, go to latest
          setCurrentVersionIndex(documents.length - 1);
        }
      }
    },
    [documents, currentVersionIndex]
  );

  // Now we can safely check for artifact definition after all hooks
  const artifactDefinition = artifactDefinitions.find(definition => definition.kind === artifact.kind);

  if (!artifactDefinition) {
    console.error(`No artifact definition found for kind: ${artifact.kind}`);
    return null;
  }

  return (
    <AnimatePresence>
      {artifact.isVisible && (
        <>
          {/* Main chat interface overlay - only for fullscreen mode */}
          {(isMobile || artifact.sidepanelMode === 'fullscreen') && (
            <motion.div
              className="fixed inset-0 z-40 bg-background flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
            >
              <div className="flex flex-col h-full justify-between items-center gap-4">
                <ArtifactMessages
                  chatId={chatId}
                  status={status}
                  votes={votes}
                  messages={messages}
                  setMessages={setMessages}
                  reload={reload}
                  isReadonly={isReadonly}
                  artifactStatus={artifact.status}
                />

                <form className="flex flex-row gap-2 relative items-end w-full px-4 pb-4">
                  <MultimodalInput
                    chatId={chatId}
                    input={input}
                    setInput={setInput}
                    handleSubmit={handleSubmit}
                    status={status}
                    stop={stop}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    messages={messages}
                    append={append}
                    className="bg-background dark:bg-muted"
                    setMessages={setMessages}
                    selectedAgentId={selectedAgentId || 'all'}
                  />
                </form>
              </div>
            </motion.div>
          )}

          {/* Sidepanel - positioned as true sidebar in 33% mode */}
          <motion.div
            className="fixed dark:bg-muted bg-background h-full flex flex-col overflow-y-scroll border-l dark:border-zinc-700 border-zinc-200 shadow-2xl z-50"
            initial={{
              opacity: 1,
              x: artifact.boundingBox.left,
              y: artifact.boundingBox.top,
              height: artifact.boundingBox.height,
              width: artifact.boundingBox.width,
              borderRadius: 50,
            }}
            animate={{
              opacity: 1,
              x: sidepanelDimensions.x,
              y: sidepanelDimensions.y,
              height: sidepanelDimensions.height,
              width: sidepanelDimensions.width,
              borderRadius: 0,
              transition: {
                delay: 0,
                type: 'spring',
                stiffness: 200,
                damping: 30,
              },
            }}
            exit={{
              opacity: 0,
              scale: 0.5,
              transition: {
                delay: 0.1,
                type: 'spring',
                stiffness: 600,
                damping: 30,
              },
            }}
          >
            <div className="p-2 flex flex-row justify-between items-start">
              <div className="flex flex-row gap-4 items-start">
                <ArtifactCloseButton />

                <div className="flex flex-col">
                  <div className="font-medium">{artifact.title}</div>

                  {!isAgentSidepanel && (
                    <>
                      {isContentDirty ? (
                        <div className="text-sm text-muted-foreground">Saving changes...</div>
                      ) : document ? (
                        <div className="text-sm text-muted-foreground">
                          {`Updated ${formatDistance(new Date(document.createdAt), new Date(), {
                            addSuffix: true,
                          })}`}
                        </div>
                      ) : (
                        <div className="w-32 h-3 mt-2 bg-muted-foreground/20 rounded-md animate-pulse" />
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Sidepanel mode toggle - only show on desktop */}
                {!isMobile && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2 h-8"
                        onClick={toggleSidepanelMode}
                      >
                        {artifact.sidepanelMode === 'fullscreen' ? <SidebarIcon /> : <FullscreenIcon />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {artifact.sidepanelMode === 'fullscreen' ? 'Switch to sidebar mode' : 'Switch to fullscreen mode'}
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Only show artifact actions for real documents, not agent sidepanels */}
                {!isAgentSidepanel && (
                  <ArtifactActions
                    artifact={artifact}
                    currentVersionIndex={currentVersionIndex}
                    handleVersionChange={handleVersionChange}
                    isCurrentVersion={isCurrentVersion}
                    mode={mode}
                    metadata={metadata}
                    setMetadata={setMetadata}
                  />
                )}
              </div>
            </div>

            <div className="dark:bg-muted bg-background h-full overflow-y-scroll !max-w-full items-center">
              <artifactDefinition.content
                title={artifact.title}
                content={
                  isCurrentVersion ? artifact.content : getDocumentContentById(currentVersionIndex)
                }
                mode={mode}
                status={artifact.status}
                currentVersionIndex={currentVersionIndex}
                suggestions={[]}
                onSaveContent={saveContent}
                isInline={false}
                isCurrentVersion={isCurrentVersion}
                getDocumentContentById={getDocumentContentById}
                isLoading={isDocumentsFetching && !artifact.content}
                metadata={metadata}
                setMetadata={setMetadata}
              />

              {/* Only show toolbar for real documents, not agent sidepanels */}
              <AnimatePresence>
                {isCurrentVersion && !isAgentSidepanel && (
                  <Toolbar
                    isToolbarVisible={isToolbarVisible}
                    setIsToolbarVisible={setIsToolbarVisible}
                    append={append}
                    status={status}
                    stop={stop}
                    setMessages={setMessages}
                    artifactKind={artifact.kind}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Only show version footer for real documents, not agent sidepanels */}
            <AnimatePresence>
              {!isCurrentVersion && !isAgentSidepanel && (
                <VersionFooter
                  currentVersionIndex={currentVersionIndex}
                  documents={documents}
                  handleVersionChange={handleVersionChange}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export const Artifact = memo(PureArtifact, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;
  if (prevProps.input !== nextProps.input) return false;
  if (!equal(prevProps.messages, nextProps.messages.length)) return false;

  return true;
});
