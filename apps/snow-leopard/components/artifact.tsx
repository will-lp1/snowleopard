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
import { useWindowSize } from 'usehooks-ts';
import type { Document } from '@snow-leopard/db';
import { fetcher } from '@/lib/utils';
import { MultimodalInput } from './chat/multimodal-input';
import { Toolbar } from './toolbar';
import { ArtifactActions } from './artifact-actions';
import { useArtifact } from '@/hooks/use-artifact';
import { textArtifact } from '@/artifacts/text/client';
import equal from 'fast-deep-equal';
import { useGT, T } from 'gt-next';
import { UseChatHelpers } from '@ai-sdk/react';
import { Button } from './ui/button';
import { CheckIcon } from './icons';
import { toast } from 'sonner';
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

export interface ArtifactActionContext<M = any> {
  content: string;
  handleVersionChange: (type: 'next' | 'prev' | 'toggle' | 'latest' | 'new') => void;
  currentVersionIndex: number;
  isCurrentVersion: boolean;
  mode: 'edit' | 'diff';
  metadata: M;
  setMetadata: Dispatch<SetStateAction<M>>;
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
  const t = useGT();
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();
  const { renameDocument, isRenamingDocument, createDocument } = useDocumentUtils();
  
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  
  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
    error: documentsError
  } = useSWR<Array<Document>>(
    `/api/document?id=${artifact.documentId}`,
    async (url: string) => {
      if (!artifact.documentId || 
          artifact.documentId === 'init' || 
          artifact.documentId === 'undefined' || 
          artifact.documentId === 'null' || 
          artifact.status === 'streaming') {
        return null;
      }
      
      const result = await fetcher(url);
      return result;
    }
  );

  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [isCreatingNewDocument, setIsCreatingNewDocument] = useState(false);

  // Create a new document - use the consolidated createDocument function
  const createNewDocument = useCallback(async () => {
    // Use the centralized document creation function
    return await createDocument({
      title: t('Untitled Document'),
      content: '',
      kind: 'text',
      chatId: chatId || null,
      navigateAfterCreate: true
    });
  }, [chatId, createDocument]);

  // Update document state when documents are loaded
  useEffect(() => {
    if (!documents || documents.length === 0) {
      if (documentsError) {
        console.error('[Artifact] Error loading documents:', documentsError);
        toast.error(t('Failed to load document'));
      }
      return;
    }
    
    const mostRecentDocument = documents.at(-1);
    if (!mostRecentDocument) return;
    
    // Update document reference and version index
    setDocument(mostRecentDocument);
    setCurrentVersionIndex(documents.length - 1);
    
    // Update artifact with document data if needed
    if (!artifact.content || 
        artifact.status === 'streaming' || 
        (mostRecentDocument.content && mostRecentDocument.content !== artifact.content)) {
      
      setArtifact((currentArtifact) => ({
        ...currentArtifact,
        title: mostRecentDocument.title || currentArtifact.title,
        content: mostRecentDocument.content || '',
        status: 'idle',
      }));
    }
  }, [documents, setArtifact, documentsError, artifact.status, artifact.content]);

  const { mutate } = useSWRConfig();
  const [isContentDirty, setIsContentDirty] = useState(false);

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const consecutiveErrorsRef = useRef<number>(0);

  const saveContent = useCallback(async (content: string, isDebounced = false) => {
    if (!artifact?.documentId || artifact.documentId === 'init') {
      // If we don't have a document yet but have content, create a new document
      if (content && content.trim() !== '') {
        await createDocument({
          title: t('Untitled Document'),
          content: content,
          kind: 'text',
          chatId: chatId || null,
          navigateAfterCreate: true
        });
        return;
      }
      return;
    }
    
    try {
      // Set saving state
      setSaveState('saving');
      setLastSaveError(null);
      console.log('[Artifact] Initiating save for document:', artifact.documentId);
      
      // Direct API call to save content
      const response = await fetch(`/api/document?id=${artifact.documentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: artifact.title,
          content: content,
          kind: artifact.kind,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Save failed with status: ${response.status}`);
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
      toast.error(t('Failed to save document. Please try again.'));
    }
  }, [artifact?.documentId, artifact?.title, artifact?.kind, mutateDocuments, createDocument, chatId]);

  function getDocumentContentById(index: number) {
    if (!documents) return '';
    if (!documents[index]) return '';
    return documents[index].content ?? '';
  }

  const handleVersionChange = (type: 'next' | 'prev' | 'toggle' | 'latest' | 'new') => {
    if (type === 'new') {
      createNewDocument();
      return;
    }
    
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
    if (saveState === 'saving') {
      return (
        <>
          <svg className="animate-spin size-3 text-muted-foreground" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Saving</span>
        </>
      );
    }
    
    if (saveState === 'error') {
      return (
        <span className="text-destructive" title={lastSaveError || undefined}>
          <T>Save failed - Click to retry</T>
        </span>
      );
    }
    
    if (artifact.documentId === 'init') {
      return t("Start typing to create");
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
    if (!newTitle.trim()) {
      toast.error(t('Please enter a document title'));
      return;
    }
    
    // If we're on init document, create a new one with this title
    if (artifact.documentId === 'init') {
      await createDocument({
        title: newTitle,
        content: artifact.content,
        kind: artifact.kind,
        chatId: chatId,
        navigateAfterCreate: true
      });
    } else {
      // Otherwise rename existing document
      if (newTitle.trim() !== artifact.title) {
        await renameDocument(newTitle);
      }
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
    } else if (artifact.documentId === 'init') {
      createNewDocument();
    }
  }, [saveState, artifact?.content, saveContent, createNewDocument, artifact.documentId]);

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
                    width: windowWidth,
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
                <Button
                  data-testid="artifact-close-button"
                  variant="outline"
                  className="h-fit p-2 dark:hover:bg-zinc-700"
                  onClick={() => {
                    setArtifact((currentArtifact) =>
                      currentArtifact.status === 'streaming'
                        ? {
                            ...currentArtifact,
                            isVisible: false,
                          }
                        : { ...currentArtifact, isVisible: false },
                    );
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                      fill="currentColor"
                      fillRule="evenodd"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                </Button>

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
