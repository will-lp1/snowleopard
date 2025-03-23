import type { Attachment, Message } from 'ai';
import { formatDistance } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
  useRef,
} from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useDebounceCallback, useWindowSize } from 'usehooks-ts';
import type { Document, Suggestion } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Toolbar } from './toolbar';
import { VersionFooter } from './version-footer';
import { ArtifactActions } from './artifact-actions';
import { ArtifactCloseButton } from './artifact-close-button';
import { ArtifactMessages } from './artifact-messages';
import { useSidebar } from './ui/sidebar';
import { useArtifact } from '@/hooks/use-artifact';
import { textArtifact } from '@/artifacts/text/client';
import equal from 'fast-deep-equal';
import { UseChatHelpers } from '@ai-sdk/react';
import { Button } from './ui/button';
import { CheckIcon } from './icons';
import { toast } from 'sonner';
import { useDebouncedSave } from '@/hooks/use-debounced-save';
import { Input } from './ui/input';
import { useDocumentUtils } from '@/hooks/use-document-utils';
import { Pencil as PencilIcon, X as XIcon } from 'lucide-react';

export const artifactDefinitions = [
  textArtifact,
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
  saveState?: 'idle' | 'saving' | 'error';
  lastSaveError?: string | null;
}

interface ArtifactContent<M = any> {
  title: string;
  content: string;
  mode: 'edit' | 'diff';
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  status: 'streaming' | 'idle';
  suggestions: Array<Suggestion>;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  isInline: boolean;
  getDocumentContentById: (index: number) => string;
  isLoading: boolean;
  metadata: M;
  setMetadata: Dispatch<SetStateAction<M>>;
  documentId: string;
  saveState?: 'idle' | 'saving' | 'error';
  lastSaveError?: string | null;
}

export function PureArtifact({
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
  isReadonly,
}: {
  chatId: string;
  input: string;
  setInput: UseChatHelpers['setInput'];
  status: UseChatHelpers['status'];
  stop: UseChatHelpers['stop'];
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<Message>;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
  append: UseChatHelpers['append'];
  handleSubmit: UseChatHelpers['handleSubmit'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
}) {
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();
  const { debouncedSave, saveImmediately, isSaving } = useDebouncedSave(2000);
  const { renameDocument, isRenamingDocument } = useDocumentUtils();
  
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Array<Document>>(
    `/api/document?id=${artifact.documentId}`,
    async (url: string) => {
      if (artifact.documentId === 'init' || 
          artifact.documentId === 'undefined' || 
          artifact.documentId === 'null' || 
          artifact.status === 'streaming') {
        return null;
      }
      return fetcher(url);
    }
  );

  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);

  const { open: isSidebarOpen } = useSidebar();

  // Listen for route changes to ensure document state is reset
  useEffect(() => {
    const handleRouteChange = () => {
      const url = window.location.href;
      if (url.includes('/chat/') && url.includes('?document=')) {
        // Extract the document ID from the URL
        const urlParams = new URLSearchParams(window.location.search);
        const documentId = urlParams.get('document');
        
        if (documentId && 
            documentId !== 'undefined' && 
            documentId !== 'null' && 
            documentId !== artifact.documentId) {
          // Reset state for the new document
          console.log('[Artifact] New document detected from URL:', documentId);
          setArtifact(curr => ({
            ...curr,
            documentId,
            content: '',
            status: 'idle'
          }));
          
          // Use setTimeout to avoid React scheduling errors
          setTimeout(() => {
            setDocument(null);
            setCurrentVersionIndex(-1);
            mutateDocuments();
          }, 0);
        }
      }
    };

    // Run once on mount to handle any initial URL
    handleRouteChange();

    // Add event listener for popstate (browser back/forward)
    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [artifact.documentId, setArtifact, mutateDocuments]);

  useEffect(() => {
    if (documents && documents.length > 0) {
      const mostRecentDocument = documents.at(-1);

      if (mostRecentDocument) {
        setDocument(mostRecentDocument);
        setCurrentVersionIndex(documents.length - 1);
        setArtifact((currentArtifact) => ({
          ...currentArtifact,
          content: mostRecentDocument.content ?? '',
        }));
      }
    }
  }, [documents, setArtifact]);

  useEffect(() => {
    if (artifact.documentId && 
        artifact.documentId !== 'init' && 
        artifact.documentId !== 'undefined' && 
        artifact.documentId !== 'null') {
      mutateDocuments();
    }
  }, [artifact.status, mutateDocuments, artifact.documentId]);

  const { mutate } = useSWRConfig();
  const [isContentDirty, setIsContentDirty] = useState(false);

  const handleContentChange = useCallback(
    (updatedContent: string) => {
      if (!artifact) return;

      mutate<Array<Document>>(
        `/api/document?id=${artifact.documentId}`,
        async (currentDocuments) => {
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

            const newDocument = {
              ...currentDocument,
              content: updatedContent,
              createdAt: new Date().toISOString(),
            };

            return [...currentDocuments, newDocument];
          }
          return currentDocuments;
        },
        { revalidate: false },
      );
    },
    [artifact, mutate],
  );

  const debouncedHandleContentChange = useDebounceCallback(
    handleContentChange,
    2000,
  );

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const lastSaveAttemptRef = useRef<number>(Date.now());
  const consecutiveErrorsRef = useRef<number>(0);
  const isSavingRef = useRef<boolean>(false);

  const saveContent = useCallback(async (content: string, isDebounced = false) => {
    if (!artifact?.documentId || artifact.documentId === 'init') return;
    
    // Prevent starting a new save if one is already in progress
    if (isSavingRef.current) {
      console.log('[Artifact] Save already in progress, skipping');
      return;
    }
    
    try {
      // Set saving state
      isSavingRef.current = true;
      setSaveState('saving');
      setLastSaveError(null);
      console.log('[Artifact] Initiating save for document:', artifact.documentId);
      
      // Use the debounced save hook methods
      if (isDebounced) {
        await debouncedSave(content, artifact.documentId, artifact.title, artifact.kind);
      } else {
        await saveImmediately(content, artifact.documentId, artifact.title, artifact.kind);
      }
      
      // Reset state and update UI after successful save
      setSaveState('idle');
      consecutiveErrorsRef.current = 0;
      
      // Update the document and documents list after successful save
      await mutateDocuments();
    } catch (error) {
      console.error('[Artifact] Save failed:', error);
      setSaveState('error');
      setLastSaveError(error instanceof Error ? error.message : 'Unknown error occurred');
      consecutiveErrorsRef.current++;
      toast.error('Failed to save document. Please try again.');
    } finally {
      // Always reset the saving ref to prevent lockups
      isSavingRef.current = false;
    }
  }, [artifact?.documentId, artifact?.title, artifact?.kind, debouncedSave, saveImmediately, mutateDocuments]);

  function getDocumentContentById(index: number) {
    if (!documents) return '';
    if (!documents[index]) return '';
    return documents[index].content ?? '';
  }

  const handleVersionChange = (type: 'next' | 'prev' | 'toggle' | 'latest') => {
    if (!documents) return;

    if (type === 'latest') {
      setCurrentVersionIndex(documents.length - 1);
      setMode('edit');
    }

    if (type === 'toggle') {
      setMode((mode) => (mode === 'edit' ? 'diff' : 'edit'));
    }

    if (type === 'prev') {
      if (currentVersionIndex > 0) {
        setCurrentVersionIndex((index) => index - 1);
      }
    } else if (type === 'next') {
      if (currentVersionIndex < documents.length - 1) {
        setCurrentVersionIndex((index) => index + 1);
      }
    }
  };

  const [isToolbarVisible, setIsToolbarVisible] = useState(false);

  /*
   * NOTE: if there are no documents, or if
   * the documents are being fetched, then
   * we mark it as the current version.
   */

  const isCurrentVersion =
    documents && documents.length > 0
      ? currentVersionIndex === documents.length - 1
      : true;

  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const isMobile = windowWidth ? windowWidth < 768 : false;

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind,
  );

  if (!artifactDefinition) {
    throw new Error('Artifact definition not found!');
  }

  useEffect(() => {
    if (artifact.documentId !== 'init') {
      if (artifactDefinition.initialize) {
        artifactDefinition.initialize({
          documentId: artifact.documentId,
          setMetadata,
        });
      }
    }
  }, [artifact.documentId, artifactDefinition, setMetadata]);

  // Update the status display in the UI
  const getSaveStatusDisplay = () => {
    if (isSaving || saveState === 'saving') {
      return (
        <>
          <svg className="animate-spin size-3 text-muted-foreground" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Saving{consecutiveErrorsRef.current > 0 ? ` (Retry ${consecutiveErrorsRef.current})` : ''}</span>
        </>
      );
    }
    
    if (saveState === 'error') {
      return (
        <span className="text-destructive" title={lastSaveError || undefined}>
          Save failed - Click to retry
        </span>
      );
    }
    
    return document ? (
      `Last saved ${formatDistance(
        new Date(document.createdAt),
        new Date(),
        {
          addSuffix: true,
        },
      )}`
    ) : (
      <div className="w-32 h-3 bg-muted-foreground/20 rounded-md animate-pulse" />
    );
  };

  // Function to handle starting document title edit
  const handleEditTitle = () => {
    setNewTitle(artifact.title);
    setEditingTitle(true);
    // Focus the input after rendering
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 50);
  };
  
  // Function to handle saving the document title
  const handleSaveTitle = async () => {
    if (newTitle.trim() !== artifact.title) {
      await renameDocument(newTitle);
    }
    setEditingTitle(false);
  };
  
  // Function to handle canceling title edit
  const handleCancelEditTitle = () => {
    setEditingTitle(false);
    setNewTitle(artifact.title);
  };

  // Add click handler for error state to allow manual retry
  const handleStatusClick = useCallback(() => {
    if (saveState === 'error' && artifact?.content) {
      console.log('[Artifact] Manual retry triggered');
      saveContent(artifact.content, false);
    }
  }, [saveState, artifact?.content, saveContent]);

  return (
    <AnimatePresence>
      {artifact.isVisible && (
        <motion.div
          data-testid="artifact"
          className="flex flex-row h-dvh w-dvw fixed top-0 left-0 z-50 bg-transparent"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
        >
          {!isMobile && (
            <motion.div
              className="fixed bg-background h-dvh"
              initial={{
                width: isSidebarOpen ? windowWidth - 256 : windowWidth,
                left: 0,
              }}
              animate={{ width: windowWidth - 400, left: 0 }}
              exit={{
                width: windowWidth,
                left: 0,
                transition: { duration: 0.2 },
              }}
            />
          )}

          {!isMobile && (
            <motion.div
              className="relative w-[400px] bg-muted dark:bg-background h-dvh shrink-0 ml-auto"
              initial={{ opacity: 0, x: 10, scale: 1 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
                transition: {
                  delay: 0.1,
                  type: 'spring',
                  stiffness: 200,
                  damping: 30,
                },
              }}
              exit={{
                opacity: 0,
                x: 20,
                transition: { duration: 0.2 },
              }}
            >
              <AnimatePresence>
                {!isCurrentVersion && (
                  <motion.div
                    className="left-0 absolute h-dvh w-[400px] top-0 bg-zinc-900/50 z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </AnimatePresence>

              <div className="flex flex-col h-full justify-between items-center gap-4">
                <ArtifactMessages
                  chatId={chatId}
                  status={status}
                  messages={messages}
                  setMessages={setMessages}
                  reload={reload}
                  isReadonly={isReadonly}
                  artifactStatus={artifact.status}
                />

                <div className="flex flex-col w-full gap-2 px-4 pb-4">
                  <form className="flex flex-row gap-2 relative items-end w-full">
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
                    />
                  </form>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div
            className="fixed dark:bg-muted bg-background h-dvh flex flex-col overflow-y-scroll md:border-r dark:border-zinc-700 border-zinc-200"
            initial={
              isMobile
                ? {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 50,
                  }
                : {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 50,
                  }
            }
            animate={
              isMobile
                ? {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth ? windowWidth : 'calc(100dvw)',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                      duration: 5000,
                    },
                  }
                : {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth
                      ? windowWidth - 400
                      : 'calc(100dvw-400px)',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                      duration: 5000,
                    },
                  }
            }
            exit={{
              opacity: 0,
              scale: 1,
              transition: { duration: 0.2 },
            }}
          >
            <div className="p-2 flex flex-row justify-between items-start">
              <div className="flex flex-row gap-4 items-start">
                <ArtifactCloseButton />

                <div className="flex flex-col">
                  {editingTitle ? (
                    <div className="flex items-center gap-1">
                      <Input
                        ref={titleInputRef}
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="h-7 py-1 font-medium"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTitle();
                          if (e.key === 'Escape') handleCancelEditTitle();
                        }}
                      />
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6" 
                        onClick={handleSaveTitle}
                        disabled={isRenamingDocument}
                      >
                        {isRenamingDocument ? (
                          <svg className="animate-spin size-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <CheckIcon />
                        )}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6" 
                        onClick={handleCancelEditTitle}
                      >
                        <XIcon size={12} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div 
                        className="font-medium cursor-pointer hover:underline" 
                        onClick={handleEditTitle}
                      >
                        {artifact.title}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={handleEditTitle}
                      >
                        <PencilIcon size={12} />
                      </Button>
                    </div>
                  )}

                  <div 
                    className="flex items-center gap-1.5 text-xs text-muted-foreground h-4 cursor-pointer" 
                    onClick={handleStatusClick}
                  >
                    {getSaveStatusDisplay()}
                  </div>
                </div>
              </div>

              <ArtifactActions
                artifact={artifact}
                currentVersionIndex={currentVersionIndex}
                handleVersionChange={handleVersionChange}
                isCurrentVersion={isCurrentVersion}
                mode={mode}
                metadata={metadata}
                setMetadata={setMetadata}
              />
            </div>

            <div className="dark:bg-muted bg-background h-full overflow-y-scroll !max-w-full items-center">
              <artifactDefinition.content
                title={artifact.title}
                content={
                  isCurrentVersion
                    ? artifact.content
                    : getDocumentContentById(currentVersionIndex)
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
                documentId={artifact.documentId}
                saveState={saveState}
                lastSaveError={lastSaveError}
              />

              <AnimatePresence>
                {isCurrentVersion && (
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

            <AnimatePresence>
              {!isCurrentVersion && (
                <VersionFooter
                  currentVersionIndex={currentVersionIndex}
                  documents={documents}
                  handleVersionChange={handleVersionChange}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const Artifact = memo(PureArtifact, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.input !== nextProps.input) return false;
  if (!equal(prevProps.messages, nextProps.messages.length)) return false;

  return true;
});
