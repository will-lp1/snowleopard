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
  
  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Array<Document>>(
    artifact.documentId !== 'init' ? `/api/document?id=${artifact.documentId}` : null,
    fetcher,
  );
  
  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  const [isContentDirty, setIsContentDirty] = useState(false);
  const isDocumentInitialized = useRef(false);
  const firstLoadCompletedRef = useRef(false);
  
  // Set default values if artifact isn't yet initialized
  useEffect(() => {
    if (artifact.documentId === 'init') {
      setArtifact(curr => ({
        ...curr,
        title: 'New Document',
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
    // Initial check for document ID in URL
    const syncDocumentIdWithUrl = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const documentIdFromUrl = urlParams.get('document');
      
      if (documentIdFromUrl && documentIdFromUrl !== artifact.documentId) {
        console.log('[Document] Detected document ID in URL:', documentIdFromUrl);
        setArtifact(curr => ({
          ...curr,
          documentId: documentIdFromUrl,
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
    };
    
    // Run once on mount and whenever the URL changes
    syncDocumentIdWithUrl();
    
    // Add event listener for browser navigation
    window.addEventListener('popstate', syncDocumentIdWithUrl);
    
    return () => {
      window.removeEventListener('popstate', syncDocumentIdWithUrl);
    };
  }, [router, artifact.documentId, setArtifact, mutateDocuments]);
  
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
    if (documents && documents.length > 0) {
      const mostRecentDocument = documents.at(-1);
      
      if (mostRecentDocument) {
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
          if (mostRecentDocument.id !== 'init' && mostRecentDocument.title !== 'New Document') {
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
      }
    }
  }, [documents, setArtifact]);
  
  // Auto-fetch documents when status changes
  useEffect(() => {
    if (artifact.documentId !== 'init') {
      mutateDocuments();
    }
  }, [artifact.documentId, artifact.status, mutateDocuments]);
  
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
    // If content is empty and document isn't initialized yet, don't do anything
    if (!updatedContent.trim() && !isDocumentInitialized.current) {
      return;
    }

    // Mark as dirty to show saving indicator immediately
    setIsContentDirty(true);

    if (artifact.documentId === 'init' || !document) {
      // Create new document if it doesn't exist yet
      try {
        const docId = generateUUID();
        console.log('[Document] Creating new document with ID:', docId);
        
        // Use the updated document endpoint
        const response = await fetch(`/api/document`, {
          method: 'PUT', // Use PUT for creating new documents
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: docId,
            chatId: chatId,
            title: artifact.title || 'New Document',
            content: updatedContent,
            kind: artifact.kind,
          }),
          cache: 'no-cache',
          credentials: 'same-origin',
        });
        
        const data = await response.json();
        
        if (data.id) {
          console.log('[Document] Successfully created new document:', data.id);
          
          setArtifact(curr => ({
            ...curr,
            documentId: data.id,
            content: updatedContent
          }));
          
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
            router.push(`/chat/${chatId}?document=${data.id}`);
          }
        } else {
          throw new Error('Failed to get document ID from response');
        }
      } catch (error) {
        console.error('Error creating document:', error);
        toast.error('Failed to create document');
      } finally {
        setIsContentDirty(false);
      }
      return;
    }
    
    if (document && updatedContent !== document.content) {
      // Update local state immediately for responsiveness
      setArtifact(curr => ({
        ...curr,
        content: updatedContent
      }));
      
      // Use the debounced save for normal updates
      if (debounce) {
        debouncedSave(updatedContent, artifact.documentId, artifact.title, artifact.kind);
      } else {
        // Or save immediately for critical updates
        await saveImmediately(updatedContent, artifact.documentId, artifact.title, artifact.kind);
        mutateDocuments();
        setIsContentDirty(false);
      }
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
                  artifactKind={artifact.kind}
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