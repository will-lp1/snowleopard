'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistance } from 'date-fns';
import { Loader2, FileText, PlusIcon, MessageSquareIcon, PencilIcon, CheckIcon, XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { Document } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { useArtifact } from '@/hooks/use-artifact';
import { ArtifactActions } from './artifact-actions';
import { VersionFooter } from './version-footer';
import { Toolbar } from './toolbar';
import { Editor } from './text-editor';
import { useDebouncedSave } from '@/hooks/use-debounced-save';
import { useDocumentUtils } from '@/hooks/use-document-utils';
import useSWR from 'swr';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from './ui/input';

export function AlwaysVisibleArtifact({ 
  chatId, 
  initialDocumentId = 'init'
}: { 
  chatId: string;
  initialDocumentId?: string;
}) {
  const router = useRouter();
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();
  const { debouncedSave, saveImmediately, isSaving } = useDebouncedSave(2500);
  const { 
    createNewDocument, 
    isCreatingDocument,
    renameDocument, 
    isRenamingDocument,
    createNewChatForDocument
  } = useDocumentUtils();
  
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const isInitialLoadDone = useRef(false);
  
  // Ensure each chat has a document by checking chat ID
  useEffect(() => {
    if (chatId && initialDocumentId === 'init' && !isInitialLoadDone.current) {
      console.log('[Document] Chat has no associated document, creating one');
      isInitialLoadDone.current = true;
      
      // Create a default document for this chat
      setTimeout(() => {
        createDefaultDocumentForChat(chatId);
      }, 0);
    }
  }, [chatId, initialDocumentId]);
  
  // Create default document for a chat without an explicit request
  const createDefaultDocumentForChat = async (chatId: string) => {
    if (!chatId) return;
    
    try {
      // Check if chat already has a document
      const response = await fetch(`/api/document?chatId=${chatId}`);
      const documents = await response.json();
      
      if (Array.isArray(documents) && documents.length > 0) {
        // Chat already has a document, use it
        const docId = documents[0].id;
        console.log('[Document] Found existing document for chat:', docId);
        
        // Update URL with document ID
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('document', docId);
        window.history.replaceState({}, '', currentUrl.toString());
        
        // Update artifact state
        setArtifact(curr => ({
          ...curr,
          documentId: docId,
          title: documents[0].title || 'Document',
          content: documents[0].content || '',
          status: 'idle',
          kind: documents[0].kind || 'text',
        }));
        
        return;
      }
      
      // Create new document since none exists
      const docId = generateUUID();
      console.log('[Document] Creating new default document for chat with ID:', docId);
      
      try {
        // Use the document endpoint
        const docResponse = await fetch(`/api/document`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: docId,
            chatId: chatId,
            title: 'Document',
            content: '',
            kind: 'text',
          }),
        });
        
        if (!docResponse.ok) {
          const errorData = await docResponse.json().catch(() => ({ error: 'Unknown error' }));
          console.error('[Document] Server returned error:', docResponse.status, errorData);
          throw new Error(`Failed to create document: ${docResponse.status} ${errorData.error || ''}`);
        }
        
        const data = await docResponse.json();
        console.log('[Document] Successfully created document, received data:', !!data);
        
        // Update artifact state
        setArtifact(curr => ({
          ...curr,
          documentId: data.id,
          title: 'Document',
          status: 'idle',
          kind: 'text',
        }));
        
        // Update URL with document ID
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('document', data.id);
        window.history.replaceState({}, '', currentUrl.toString());
        
        isDocumentInitialized.current = true;
      } catch (createError) {
        console.error('[Document] Failed to create document:', createError);
        
        // Fallback: Create a local-only document as recovery
        console.log('[Document] Using fallback local document');
        setArtifact(curr => ({
          ...curr,
          documentId: docId, // Use the generated ID anyway
          title: 'Document (Unsaved)',
          status: 'idle',
          kind: 'text',
          content: ''
        }));
      }
      
    } catch (error) {
      console.error('[Document] Error ensuring document for chat:', error);
      toast.error('Failed to create document', {
        description: 'Please try again or report this issue',
        duration: 5000
      });
    }
  };
  
  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Array<Document>>(
    artifact.documentId !== 'init' && 
    artifact.documentId !== 'undefined' && 
    artifact.documentId !== 'null'
      ? `/api/document?id=${artifact.documentId}` 
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000, // Avoid excessive revalidation
      onSuccess: (data) => {
        if (data && data.length > 0) {
          console.log(`[Document] Loaded ${data.length} document versions`);
        }
      },
      onError: (err) => {
        console.error('[Document] Error fetching document:', err);
      }
    }
  );
  
  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  const [isContentDirty, setIsContentDirty] = useState(false);
  const isDocumentInitialized = useRef(false);
  const firstLoadCompletedRef = useRef(false);
  const activeSaveRequestRef = useRef<string | null>(null);
  const lastContentUpdateRef = useRef<string>('');
  const documentUpdateInProgressRef = useRef(false);
  
  // Set default values if artifact isn't yet initialized
  useEffect(() => {
    if (artifact.documentId === 'init') {
      setArtifact(curr => ({
        ...curr,
        title: 'Document',
        kind: 'text',
        isVisible: true,
        status: 'idle',
        content: '',
      }));
    }
  }, [artifact.documentId, setArtifact]);
  
  // Use the provided initialDocumentId if available and update when it changes
  useEffect(() => {
    if (initialDocumentId && initialDocumentId !== 'init' && artifact.documentId !== initialDocumentId) {
      console.log('[Document] Updating document ID from props:', initialDocumentId);
      setArtifact(curr => ({
        ...curr,
        documentId: initialDocumentId,
        content: '', // Reset content to ensure we load fresh from the server
        status: 'idle'
      }));
      
      // Reset document state
      setDocument(null);
      setCurrentVersionIndex(-1);
      firstLoadCompletedRef.current = false;
      isDocumentInitialized.current = false;
      
      // Force reload of documents with the new ID
      setTimeout(() => {
        mutateDocuments();
      }, 100);
    }
  }, [initialDocumentId, artifact.documentId, setArtifact, mutateDocuments]);
  
  // Listen for route changes to ensure document ID is synchronized with URL
  useEffect(() => {
    // Function to extract and update document ID from URL
    const syncDocumentIdWithUrl = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const documentIdFromUrl = urlParams.get('document');
      
      if (documentIdFromUrl && documentIdFromUrl !== 'undefined' && documentIdFromUrl !== 'null') {
        console.log('[Document] Detected document ID in URL:', documentIdFromUrl);
        
        // Only update if the ID has changed to prevent unnecessary re-renders
        if (documentIdFromUrl !== artifact.documentId) {
          console.log('[Document] Updating document ID from URL:', documentIdFromUrl);
          
          // Set artifact state first (this is an allowed state update)
          setArtifact(curr => ({
            ...curr,
            documentId: documentIdFromUrl,
            content: '', // Reset content to ensure we load fresh from the server
            status: 'idle',
            kind: 'text', // Ensure kind is always set
          }));
          
          // Defer document state updates to avoid React scheduling errors
          setTimeout(() => {
            // Reset document state in a separate tick
            setDocument(null);
            setCurrentVersionIndex(-1);
            firstLoadCompletedRef.current = false;
            isDocumentInitialized.current = false;
            
            // Force reload of documents with the new ID
            mutateDocuments();
          }, 0);
        }
      } else if (artifact.documentId !== 'init') {
        // If URL doesn't have document but we have one loaded, let's update the URL
        // This ensures document ID is always in sync with the URL
        if (chatId) {
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set('document', artifact.documentId);
          window.history.replaceState({}, '', currentUrl.toString());
        }
      }
    };
    
    // Run once on mount
    syncDocumentIdWithUrl();
    
    // Add event listener for browser navigation
    window.addEventListener('popstate', syncDocumentIdWithUrl);
    
    // Rather than using MutationObserver which is excessive,
    // use a more focused approach with history state management
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    
    window.history.pushState = function(...args: Parameters<typeof originalPushState>) {
      originalPushState.apply(this, args);
      syncDocumentIdWithUrl();
    };
    
    window.history.replaceState = function(...args: Parameters<typeof originalReplaceState>) {
      originalReplaceState.apply(this, args);
      syncDocumentIdWithUrl();
    };
    
    return () => {
      window.removeEventListener('popstate', syncDocumentIdWithUrl);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, [router, artifact.documentId, setArtifact, mutateDocuments, chatId]);
  
  // Add a useEffect hook to update the document content in chat context when it changes
  useEffect(() => {
    // When document content or ID changes, we need to make sure the chat
    // has the latest document context for the AI model
    if (artifact.documentId !== 'init' && artifact.content) {
      // The Chat component automatically picks up the artifact state
      // and sends it in the chat request body.
      console.log('[Document] Chat context updated with document:', artifact.documentId);
    }
  }, [artifact.documentId, artifact.content]);
  
  // Ensure the document loading useEffect properly tracks first load
  // and only shows toast notification once
  useEffect(() => {
    if (!documents || documents.length === 0) return;
    
    const mostRecentDocument = documents[documents.length - 1];
    
    if (!mostRecentDocument) return;
    
    // Set local document state
    setDocument(mostRecentDocument);
    setCurrentVersionIndex(documents.length - 1);
    
    // Update artifact state
    setArtifact((currentArtifact) => ({
      ...currentArtifact,
      content: mostRecentDocument.content ?? '',
      title: mostRecentDocument.title,
    }));
    
    // Mark document as initialized
    isDocumentInitialized.current = true;
    
    // Signal to the chat that we have document content available
    console.log('[Document] Document loaded and ready:', mostRecentDocument.id);
    
    // Only show toast on first successful load, not on subsequent updates
    if (!firstLoadCompletedRef.current) {
      // Only show toast for documents that aren't the default empty document
      if (mostRecentDocument.id !== 'init' && mostRecentDocument.title !== 'New Document' && mostRecentDocument.title !== 'Document') {
        // Show minimal success toast for document loading
        toast.success(`Document loaded: ${mostRecentDocument.title}`, {
          description: null,
          duration: 2000,
          id: `doc-loaded-${mostRecentDocument.id}` // Prevent duplicate toasts
        });
      }
      
      // Mark first load as completed
      firstLoadCompletedRef.current = true;
      console.log('[Document] First load complete');
    }
  }, [documents, setArtifact]);
  
  // Auto-fetch documents when status changes
  useEffect(() => {
    if (artifact.documentId !== 'init' && 
        artifact.documentId !== 'undefined' && 
        artifact.documentId !== 'null') {
      mutateDocuments();
    }
  }, [artifact.documentId, artifact.status, mutateDocuments]);
  
  // Prevent automatically opening older versions by ensuring we always stay on the latest version
  // unless the user explicitly requests to view an older version
  useEffect(() => {
    if (documents && documents.length > 0 && mode === 'edit') {
      // Always set to the latest version when documents change and we're in edit mode
      setCurrentVersionIndex(documents.length - 1);
    }
  }, [documents, mode]);
  
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
  
  // Function to create a new chat for this document
  const handleNewChatForDocument = async () => {
    await createNewChatForDocument();
  };
  
  // Save content to the server when it changes
  const saveContent = async (updatedContent: string, debounce: boolean) => {
    // If content is empty and document isn't initialized yet, create document immediately
    if (!updatedContent.trim() && !isDocumentInitialized.current) {
      if (chatId) {
        createDefaultDocumentForChat(chatId);
      }
      return;
    }
    
    // If an update is already in progress, don't start another one
    if (documentUpdateInProgressRef.current) {
      console.log('[Document] Update already in progress, queueing for later');
      lastContentUpdateRef.current = updatedContent;
      return;
    }

    // Avoid redundant state updates
    if (artifact.content === updatedContent && isDocumentInitialized.current) {
      console.log('[Document] Content unchanged, skipping save');
      return;
    }

    // Mark as dirty to show saving indicator immediately
    setIsContentDirty(true);
    documentUpdateInProgressRef.current = true;
    const currentSaveId = generateUUID();
    activeSaveRequestRef.current = currentSaveId;

    if (artifact.documentId === 'init' || !document) {
      // Check if we're already in the process of creating a document
      if (isCreatingDocument) {
        console.log('[Document] Document creation already in progress, skipping');
        documentUpdateInProgressRef.current = false;
        return;
      }

      // Create new document if it doesn't exist yet
      try {
        const docId = generateUUID();
        console.log('[Document] Creating new document with ID:', docId);
        
        // Update local state immediately for better UX
        setArtifact(curr => ({
          ...curr,
          documentId: docId,
          content: updatedContent
        }));
        
        // Use the updated document endpoint
        const response = await fetch(`/api/document`, {
          method: 'PUT', // Use PUT for creating new documents
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: docId,
            chatId: chatId,
            title: artifact.title || 'Document',
            content: updatedContent,
            kind: artifact.kind,
          }),
          cache: 'no-cache',
          credentials: 'same-origin',
        });
        
        // Check if this save request is still active
        if (activeSaveRequestRef.current !== currentSaveId) {
          console.log('[Document] Save request superseded by newer request');
          return;
        }
        
        const data = await response.json();
        
        if (data.id) {
          console.log('[Document] Successfully created new document:', data.id);
          
          isDocumentInitialized.current = true;
          mutateDocuments();
          
          // Minimal toast notification for document creation - only show if not auto-created
          if (updatedContent.trim().length > 0) {
            toast.success('Document created', {
              id: `doc-created-${data.id}`, // Prevent duplicate toasts
              duration: 2000
            });
          }
          
          // Update URL to include document ID
          if (chatId) {
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('document', data.id);
            window.history.replaceState({}, '', currentUrl.toString());
          }
        } else {
          throw new Error('Failed to get document ID from response');
        }
      } catch (error) {
        console.error('Error creating document:', error);
        toast.error('Failed to create document');
        
        // Reset document state on error
        if (chatId) {
          setTimeout(() => {
            createDefaultDocumentForChat(chatId);
          }, 1000);
        }
      } finally {
        setIsContentDirty(false);
        documentUpdateInProgressRef.current = false;
        
        // Process any pending updates that came in while this save was in progress
        if (lastContentUpdateRef.current && lastContentUpdateRef.current !== updatedContent) {
          const pendingContent = lastContentUpdateRef.current;
          lastContentUpdateRef.current = '';
          setTimeout(() => saveContent(pendingContent, true), 100);
        }
      }
      return;
    }
    
    if (document && updatedContent !== document.content) {
      // Update local state immediately for responsiveness
      setArtifact(curr => ({
        ...curr,
        content: updatedContent
      }));
      
      try {
        // Use the debounced save for normal updates
        if (debounce) {
          debouncedSave(updatedContent, artifact.documentId, artifact.title, artifact.kind);
        } else {
          // Or save immediately for critical updates
          await saveImmediately(updatedContent, artifact.documentId, artifact.title, artifact.kind);
          
          // Check if this save request is still active
          if (activeSaveRequestRef.current !== currentSaveId) {
            console.log('[Document] Save request superseded by newer request');
            return;
          }
          
          mutateDocuments();
        }
      } finally {
        setIsContentDirty(false);
        documentUpdateInProgressRef.current = false;
        
        // Process any pending updates that came in while this save was in progress
        if (lastContentUpdateRef.current && lastContentUpdateRef.current !== updatedContent) {
          const pendingContent = lastContentUpdateRef.current;
          lastContentUpdateRef.current = '';
          setTimeout(() => saveContent(pendingContent, true), 100);
        }
      }
    } else {
      // Content is unchanged, no need to save
      setIsContentDirty(false);
      documentUpdateInProgressRef.current = false;
    }
  };
  
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
        // When moving to an older version, switch to diff mode to make it clear we're viewing history
        setMode('diff');
      }
    } else if (type === 'next') {
      if (currentVersionIndex < documents.length - 1) {
        setCurrentVersionIndex((index) => index + 1);
      }
    }
  };
  
  // Determine if we're on the current version
  const isCurrentVersion = documents && documents.length > 0
    ? currentVersionIndex === documents.length - 1
    : true;
  
  // Check if we should show the empty state
  const showEmptyState = artifact.documentId === 'init' && !artifact.content && !isContentDirty;
  
  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Header with document info or actions */}
      <div className="flex flex-row justify-between items-center border-b border-border px-3 h-[45px]">
        <div className="flex flex-row gap-4 items-center">
          <FileText className="size-5 text-muted-foreground" />
          
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
                    <CheckIcon className="size-3" />
                  )}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6" 
                  onClick={handleCancelEditTitle}
                >
                  <XIcon className="size-3" />
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
                  <PencilIcon className="size-3" />
                </Button>
              </div>
            )}
            
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground h-4">
              {isSaving || isContentDirty ? (
                <>
                  <svg className="animate-spin size-3 text-muted-foreground" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Saving</span>
                </>
              ) : document ? (
                `Updated ${formatDistance(
                  new Date(document.createdAt),
                  new Date(),
                  {
                    addSuffix: true,
                  },
                )}`
              ) : !showEmptyState ? (
                <div className="w-32 h-3 bg-muted-foreground/20 rounded-md animate-pulse" />
              ) : (
                <span>Start typing to create document</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Document Actions Menu */}
          {!showEmptyState && artifact.documentId !== 'init' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                >
                  <MessageSquareIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleNewChatForDocument}>
                  Create New Chat with this Document
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleEditTitle}>
                  Rename Document
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {/* New Document Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={createNewDocument}
                disabled={isCreatingDocument}
              >
                {isCreatingDocument ? (
                  <svg className="animate-spin size-4 text-muted-foreground" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <PlusIcon className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent align="end">New Document</TooltipContent>
          </Tooltip>
          
          {!showEmptyState && (
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
      
      <div className="dark:bg-muted bg-background h-full overflow-y-auto !max-w-full items-center">
        {isDocumentsFetching && !artifact.content ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="px-8 py-6 mx-auto max-w-3xl">
              <Editor
                content={isCurrentVersion ? artifact.content : getDocumentContentById(currentVersionIndex)}
                onSaveContent={saveContent}
                status={artifact.status}
                isCurrentVersion={isCurrentVersion}
                currentVersionIndex={currentVersionIndex}
                suggestions={[]}
                onSuggestionResolve={() => {}}
                documentId={artifact.documentId}
                saveState={isContentDirty ? 'saving' : 'idle'}
              />
            </div>
            
            <AnimatePresence>
              {isCurrentVersion && (
                <Toolbar
                  isToolbarVisible={isToolbarVisible}
                  setIsToolbarVisible={setIsToolbarVisible}
                  append={() => Promise.resolve('')}
                  status="ready"
                  stop={() => {}}
                  setMessages={() => {}}
                  artifactKind={artifact.kind || 'text'}
                />
              )}
            </AnimatePresence>
          </>
        )}
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
    </div>
  );
} 