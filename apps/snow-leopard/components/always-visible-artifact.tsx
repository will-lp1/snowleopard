'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistance } from 'date-fns';
import { Loader2, FileText, PlusIcon, MessageSquareIcon, PencilIcon, CheckIcon, XIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import type { Document } from '@snow-leopard/db';
import { fetcher, generateUUID } from '@/lib/utils';
import { useArtifact } from '@/hooks/use-artifact';
import { ArtifactActions } from '@/components/artifact-actions';
import { VersionHeader } from '@/components/document/version-header';
import { Toolbar } from '@/components/toolbar';
import { Editor } from '@/components/document/text-editor';
import { useDocumentUtils } from '@/hooks/use-document-utils';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
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
import { useDocumentContext } from '@/hooks/use-document-context';
import { ArtifactKind } from '@/components/artifact';
import { AiSettingsMenu } from './ai-settings-menu';
import { SidebarToggle } from '@/components/sidebar/sidebar-toggle';

export function AlwaysVisibleArtifact({ 
  chatId, 
  initialDocumentId = 'init',
  showCreateDocumentForId
}: { 
  chatId: string;
  initialDocumentId?: string;
  showCreateDocumentForId?: string;
}) {
  const router = useRouter();
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();
  const { documentId, documentTitle, documentContent, updateDocument } = useDocumentContext();
  const { 
    createNewDocument, 
    isCreatingDocument,
    renameDocument, 
    isRenamingDocument,
    createDocument
  } = useDocumentUtils();
  
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const documentIdFromUrlRef = useRef<string | null>(null);
  
  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Array<Document>>(
    // Fetch based on the target initialDocumentId
    initialDocumentId && 
    initialDocumentId !== 'init' && 
    initialDocumentId !== 'undefined' && 
    initialDocumentId !== 'null'
      ? `/api/document?id=${initialDocumentId}` 
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      onSuccess: (data) => {
        if (data && data.length > 0) {
          console.log(`[Document] Loaded ${data.length} document versions for ID: ${initialDocumentId}`);
        }
      },
      onError: (err) => {
        console.error(`[Document] Error fetching document for ID ${initialDocumentId}:`, err);
      }
    }
  );
  
  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  const [isContentDirty, setIsContentDirty] = useState(false);
  const lastDocumentIdRef = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<'saving' | 'idle' | 'error'>('idle');
  const consecutiveErrorsRef = useRef<number>(0);
  const lastSaveErrorRef = useRef<string | null>(null);
  
  // Initialize document ID from URL on first load
  useEffect(() => {
    // Only run this once on initial load
    if (documentIdFromUrlRef.current === null) {
      // We're already in a document-specific URL if initialDocumentId is provided
      if (initialDocumentId && initialDocumentId !== 'init' && initialDocumentId !== 'undefined' && initialDocumentId !== 'null') {
        console.log('[Document] Using initialDocumentId:', initialDocumentId);
        documentIdFromUrlRef.current = initialDocumentId;
        
        // Update the artifact state with the initialDocumentId
        setArtifact((curr: any) => ({
          ...curr,
          documentId: initialDocumentId,
          status: 'idle',
        }));
        
        // Update document context as well
        updateDocument(initialDocumentId, artifact.title, artifact.content, artifact.kind);
        
        // Force a documents fetch immediately 
        setTimeout(() => {
          mutateDocuments();
        }, 0);
      } else if (chatId) {
        // If we have a chat ID but no document, check if there's an associated document
        console.log('[Document] No document ID found but have chat ID, checking for documents by chat:', chatId);
        
        fetch(`/api/document?chatId=${chatId}`)
          .then(res => res.json())
          .then(docs => {
            if (Array.isArray(docs) && docs.length > 0) {
              const docId = docs[0].id;
              console.log('[Document] Found document for chat:', docId);
              documentIdFromUrlRef.current = docId;
              
              // Update artifact with found document
              setArtifact((curr: any) => ({
                ...curr,
                documentId: docId,
                status: 'idle',
                title: docs[0].title || 'Document',
              }));
              
              // Navigate to the document page directly - no query params
              router.push(`/documents/${docId}`);
              
              // Fetch the document content
              setTimeout(() => {
                mutateDocuments();
              }, 0);
            } else {
              // No documents for this chat, show empty state
              documentIdFromUrlRef.current = 'none';
              setArtifact((curr: any) => ({
                ...curr,
                documentId: 'init',
                title: 'Document',
                content: '',
                status: 'idle',
                kind: 'text'
              }));
            }
          })
          .catch(err => {
            console.error('[Document] Error checking for chat documents:', err);
            // Fall back to empty state
            documentIdFromUrlRef.current = 'none';
            setArtifact((curr: any) => ({
              ...curr,
              documentId: 'init',
              title: 'Document',
              content: '',
              status: 'idle',
              kind: 'text'
            }));
          });
      } else {
        // No document ID or chat ID, show empty state
        documentIdFromUrlRef.current = 'none';
        setArtifact((curr: any) => ({
          ...curr,
          documentId: 'init',
          title: 'Document',
          content: '',
          status: 'idle',
          kind: 'text'
        }));
      }
    }
  }, [setArtifact, initialDocumentId, mutateDocuments, chatId, artifact.title, artifact.content, artifact.kind, updateDocument, router]);
  
  // Use the provided initialDocumentId if available and update when it changes
  useEffect(() => {
    if (initialDocumentId && 
        initialDocumentId !== 'init' && 
        initialDocumentId !== documentIdFromUrlRef.current && 
        artifact.documentId !== initialDocumentId) {
      console.log('[Document] Updating document ID from props:', initialDocumentId);
      documentIdFromUrlRef.current = initialDocumentId;
      
      setArtifact((curr: any) => ({
        ...curr,
        documentId: initialDocumentId,
        content: '', // Reset content to ensure we load fresh from the server
        status: 'idle'
      }));
      
      // Reset document state
      setDocument(null);
      setCurrentVersionIndex(-1);
      
      // Force reload of documents with the new ID
      setTimeout(() => {
        mutateDocuments();
      }, 100);
      
      // Update URL with the document ID for future refreshes
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('document', initialDocumentId);
      window.history.replaceState({}, '', currentUrl.toString());
    }
  }, [initialDocumentId, artifact.documentId, setArtifact, mutateDocuments]);
  
  // Monitor URL for document ID changes
  useEffect(() => {
    // Function to extract document ID from URL
    const syncDocumentIdWithUrl = () => {
      // When in [id] document pages, we don't need to check URL params
      if (initialDocumentId && 
          initialDocumentId !== 'init' && 
          initialDocumentId !== 'undefined' && 
          initialDocumentId !== 'null') {
        return;
      }
      
      // For general document page, check URL params
      const urlParams = new URLSearchParams(window.location.search);
      const docId = urlParams.get('document');
      
      if (docId && 
          docId !== 'undefined' && 
          docId !== 'null' && 
          docId !== 'init' && 
          docId !== artifact.documentId) {
        console.log('[Document] URL document ID changed:', docId);
        
        // Update artifact state
        setArtifact((curr: any) => ({
          ...curr,
          documentId: docId,
          content: '',  // Reset content to ensure reload
          status: 'idle'
        }));
        
        // Force a documents fetch with the new ID
        setTimeout(() => {
          mutateDocuments();
        }, 0);
      }
    };
    
    // Initial check
    syncDocumentIdWithUrl();
    
    // Listen for popstate events
    window.addEventListener('popstate', syncDocumentIdWithUrl);
    
    // Handle history state changes
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
  }, [router, artifact.documentId, setArtifact, mutateDocuments, initialDocumentId]);
  
  // Add a useEffect hook to update the document content in chat context when it changes
  useEffect(() => {
    // When document content or ID changes, we need to make sure the chat
    // has the latest document context for the AI model
    if (artifact.documentId !== 'init' && 
        artifact.documentId !== 'null' && 
        artifact.documentId !== 'undefined' && 
        artifact.content) {
      console.log('[Document] Chat context updated with document:', artifact.documentId);
    }
  }, [artifact.documentId, artifact.content]);
  
  // Load document data when documents change
  useEffect(() => {
    if (!documents || documents.length === 0) return;
    
    const mostRecentDocument = documents[documents.length - 1];
    if (!mostRecentDocument) return;

    // *** CRITICAL CHECK: Only update artifact if the loaded doc matches the target ID ***
    if (mostRecentDocument.id !== initialDocumentId) {
      console.log(`[Document] Ignoring fetched data for ${mostRecentDocument.id} as target is ${initialDocumentId}`);
      return; // Don't update state with stale data
    }
    
    // Update local document state
    setDocument(mostRecentDocument);
    setCurrentVersionIndex(documents.length - 1);
    
    // Only update content if it's not already loaded or has changed
    if (!artifact.content || 
        artifact.content !== mostRecentDocument.content || 
        artifact.title !== mostRecentDocument.title) {
      
      // Update artifact state with document data
      setArtifact((currentArtifact: any) => ({
        ...currentArtifact,
        content: mostRecentDocument.content ?? '',
        title: mostRecentDocument.title,
        documentId: mostRecentDocument.id,
        kind: 'text',
      }));
      
      // Also update the document context for other components
      updateDocument(
        mostRecentDocument.id,
        mostRecentDocument.title || 'Untitled Document',
        mostRecentDocument.content || '',
        mostRecentDocument.kind as ArtifactKind || 'text'
      );
      
      lastDocumentIdRef.current = mostRecentDocument.id;
      console.log('[Document] Document content loaded:', mostRecentDocument.id);
    }
  }, [documents, setArtifact, artifact.content, artifact.title, updateDocument, initialDocumentId]);
  
  // Ensure we always stay on the latest version when in edit mode
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
  
  // Save content to the server when it changes
  const saveContent = async (updatedContent: string, debounce: boolean) => {
    // --- Handle initial document creation ---
    // Check if this is the first save attempt for an 'init' document
    if (artifact.documentId === 'init') {
      console.log('[Document] First save attempt for a new document, calling creation handler...');
      // Call the creation handler instead of the update API
      await handleCreateDocumentFromEditor(updatedContent);
      // Return early, creation handler will update state and trigger navigation/SWR update
      return; 
    }
    // --- End Handle initial document creation ---

    // Don't attempt to save if there's no valid document ID
    if (artifact.documentId === 'undefined' || artifact.documentId === 'null') {
      console.log('[Document] Cannot save content - invalid document ID');
      return;
    }

    // Set saving indicator state
    setIsContentDirty(true);
    setSaveState('saving');
    
    try {
      console.log(`[Document] Saving document ${artifact.documentId}`);
      
      // Make the API call to update the document
      const response = await fetch(`/api/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: artifact.documentId,
          title: artifact.title || 'Document',
          content: updatedContent,
          kind: artifact.kind || 'text',
        }),
      });
      
      if (!response.ok) {
        console.error(`[Document] Save error: ${response.status}`);
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Failed to save document: ${errorData.error || response.statusText}`);
      }
      
      const updatedDocumentData: Document = await response.json();

      // Update SWR cache with the returned data
      // Find the existing document in the cache to update it, or update the whole array if needed
      mutateDocuments((currentData) => {
        if (!currentData) return [updatedDocumentData]; // If cache is empty, initialize with new data
        
        // Find the index of the document version to update (usually the last one)
        const indexToUpdate = currentData.findIndex(doc => 
          doc.id === updatedDocumentData.id && 
          doc.createdAt === updatedDocumentData.createdAt
        );
        
        if (indexToUpdate !== -1) {
          // Update the specific version in the array
          const newData = [...currentData];
          newData[indexToUpdate] = updatedDocumentData;
          return newData;
        } else {
          // If the exact version wasn't found (e.g., it was a new version created),
          // find the latest version for the same ID and replace it, or append.
          // This logic assumes the API returns the *single* latest version state.
          const latestIndexForId = currentData.reduce((latestIdx, doc, currentIdx) => {
            if (doc.id === updatedDocumentData.id && (latestIdx === -1 || new Date(doc.createdAt) > new Date(currentData[latestIdx].createdAt))) {
              return currentIdx;
            }
            return latestIdx;
          }, -1);

          if (latestIndexForId !== -1) {
             const newData = [...currentData];
             // Check if the returned data represents a NEWER version or just an UPDATE to the latest
             if (new Date(updatedDocumentData.createdAt) > new Date(newData[latestIndexForId].createdAt)) {
               // It's a newer version, append it (or replace if ID matches but createdAt differs)
               newData.push(updatedDocumentData);
               // Remove older versions if necessary (or handle based on desired history view)
             } else {
               // It's an update to the latest known version
               newData[latestIndexForId] = updatedDocumentData;
             }
             return newData;
          } else {
             // Document ID not found at all, append as new
             return [...currentData, updatedDocumentData];
          }
        }
      }, { revalidate: false }); // Update cache, don't trigger immediate refetch
      
      // Clear save indicator after successful save
      setIsContentDirty(false);
      setSaveState('idle');
      
      // Reset error counters on successful save
      consecutiveErrorsRef.current = 0;
      lastSaveErrorRef.current = null;
    } catch (error) {
      console.error('[Document] Save error:', error);
      setSaveState('error');
      
      // Store the error message for display
      lastSaveErrorRef.current = error instanceof Error ? error.message : 'Unknown error';
      consecutiveErrorsRef.current++;
      
      // Show error toast for failed saves
      toast.error('Failed to save document', {
        description: lastSaveErrorRef.current,
        duration: 5000
      });
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
  
  // Document isn't loaded yet but we have a valid ID
  const isLoadingValidDocument = 
    isDocumentsFetching && 
    artifact.documentId !== 'init' && 
    artifact.documentId !== 'undefined' && 
    artifact.documentId !== 'null';
  
  // Check if we should show the no document state
  const showNoDocumentState = 
    !isLoadingValidDocument && 
    !document && 
    (artifact.documentId === 'init' || 
     artifact.documentId === 'undefined' || 
     artifact.documentId === 'null');
  
  // Update the status display in the UI
  const getSaveStatusDisplay = () => {
    if (saveState === 'saving') {
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
        <span className="text-destructive" title={lastSaveErrorRef.current || undefined}>
          Save failed - Click to retry
        </span>
      );
    }
    
    if (artifact.documentId === 'init') {
      return "Start typing to create";
    }
    
    // Use updatedAt if available, otherwise fallback to createdAt
    // Ensure document and timestamps are valid Date objects or parseable strings
    let lastSavedDate: Date | null = null;
    if (document?.updatedAt) {
        try {
            lastSavedDate = new Date(document.updatedAt);
        } catch (e) { /* Ignore invalid date */ }
    }
    // Fallback to createdAt if updatedAt is missing or invalid
    if (!lastSavedDate && document?.createdAt) {
         try {
            lastSavedDate = new Date(document.createdAt);
        } catch (e) { /* Ignore invalid date */ }
    }

    return lastSavedDate ? (
      `Last saved ${formatDistance(
        lastSavedDate,
        new Date(),
        {
          addSuffix: true,
        },
      )}`
    ) : (
      // Show skeleton loader if no valid date found yet
      <div className="w-32 h-3 bg-muted-foreground/20 rounded-md animate-pulse" /> 
    );
  };
  
  // Add this new function to handle creating a document with specific ID
  const handleCreateDocumentWithId = async (id: string) => {
    if (isCreatingDocument) return;
    
    try {
      // Create a document with the requested ID
      const document = await createDocument({
        title: 'Document',
        content: '',
        kind: 'text',
        chatId: null,
        navigateAfterCreate: true,
        providedId: id
      });
      
      if (document) {
        toast.success('Document created');
      }
    } catch (error) {
      console.error('Error creating document with specific ID:', error);
      toast.error('Failed to create document');
    }
  };
  
  // Add this new function to handle creating a document initiated from the editor
  const handleCreateDocumentFromEditor = async (initialContent: string) => {
    if (isCreatingDocument || artifact.documentId !== 'init') return;
    
    console.log('[Artifact] Creating new document from editor input...');
    const newDocId = generateUUID(); // Generate ID client-side
    
    try {
      const document = await createDocument({
        title: 'Untitled Document', // Start with a default title
        content: initialContent,
        kind: 'text',
        chatId: null, // No chat initially
        navigateAfterCreate: true, // Navigate after creation
        providedId: newDocId // Use the generated ID
      });
      
      if (document) {
        // Update artifact state immediately after successful creation
        setArtifact((curr: any) => ({
          ...curr,
          documentId: document.id,
          title: document.title,
          content: document.content,
          kind: document.kind,
          status: 'idle' // Reset status
        }));
        // Update context
        updateDocument(document.id, document.title, document.content, document.kind);
        // Toast or confirmation if needed
        toast.success('Document created');
        // Navigation is handled by createDocument utility if navigateAfterCreate is true
      } else {
        // Handle case where document creation failed but didn't throw
        toast.error('Failed to create document.');
      }
    } catch (error) {
      console.error('Error creating document from editor:', error);
      toast.error('Failed to create document');
      // Optionally reset editor state or provide retry mechanism
    }
  };
  
  // Listen for document events (renamed, created, etc.)
  useEffect(() => {
    const handleDocumentRenamed = (event: CustomEvent) => {
      if (!event.detail) return;
      
      const { documentId, newTitle } = event.detail;
      
      // Only update if this is the current document
      if (documentId === artifact.documentId) {
        console.log('[Document] Updating document title from event:', newTitle);
        
        // Update artifact state with new title
        setArtifact(current => ({
          ...current,
          title: newTitle
        }));
        
        // Update document context as well
        updateDocument(
          documentId,
          newTitle,
          artifact.content,
          artifact.kind
        );
        
        // Force a documents fetch to update versions list
        setTimeout(() => {
          mutateDocuments();
        }, 100);
      }
    };
    
    // Add event listeners
    window.addEventListener('document-renamed', handleDocumentRenamed as EventListener);
    
    // Clean up
    return () => {
      window.removeEventListener('document-renamed', handleDocumentRenamed as EventListener);
    };
  }, [artifact.documentId, artifact.content, artifact.kind, setArtifact, updateDocument, mutateDocuments]);
  
  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Header with document info or actions */}
      <div className="flex flex-row justify-between items-center border-b border-zinc-200 dark:border-zinc-700 px-3 h-[45px]">
        <div className="flex flex-row gap-2 items-center min-w-0">
          <SidebarToggle />
          <div className="flex flex-col min-w-0">
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
              <div className="flex items-center gap-1 min-w-0">
                <div 
                  className="font-medium cursor-pointer hover:underline truncate"
                  onClick={document ? handleEditTitle : undefined}
                  title={document ? artifact.title : 'Document'}
                >
                  {document ? artifact.title : 'Document'}
                </div>
                {document && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 flex-shrink-0"
                    onClick={handleEditTitle}
                  >
                    <PencilIcon className="text-xs size-3" />
                  </Button>
                )}
              </div>
            )}
            
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground h-4">
              {getSaveStatusDisplay()}
            </div>
          </div>
        </div>
        
        {/* Right side (actions, settings) */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {document && (
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
          <AiSettingsMenu />
        </div>
      </div>
      
      <div className="dark:bg-muted bg-background h-full overflow-y-auto !max-w-full items-center relative">
        <AnimatePresence>
          {!isCurrentVersion && document && (
            <VersionHeader
              key={artifact.documentId}
              currentVersionIndex={currentVersionIndex}
              documents={documents}
              handleVersionChange={handleVersionChange}
            />
          )}
        </AnimatePresence>

        {isLoadingValidDocument ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : showCreateDocumentForId ? (
          // Show UI for creating a document with the specified ID
          <div className="flex flex-col justify-center items-center h-full gap-4 text-muted-foreground">
            <FileText className="size-16 opacity-50" />
            <div className="text-center">
              <h3 className="text-lg font-medium mb-1">Document Not Found</h3>
              <p className="text-sm mb-1">The document you&apos;re looking for doesn&apos;t exist.</p>
              <p className="text-sm mb-4">Would you like to create a new document with this ID?</p>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={() => handleCreateDocumentWithId(showCreateDocumentForId)}
                variant="default"
                className="gap-2"
                disabled={isCreatingDocument}
              >
                {isCreatingDocument ? 
                  <Loader2 className="h-4 w-4 animate-spin" /> : 
                  <PlusIcon className="h-4 w-4" />}
                Create Document
              </Button>
              
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  // Navigate back to documents page
                  router.push('/documents');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : showNoDocumentState ? (
          // Modified existing "no document" UI to be cleaner
          <div className="flex flex-col justify-center items-center h-full gap-4 text-muted-foreground">
            <FileText className="size-16 opacity-50" />
            <div className="text-center">
              <h3 className="text-lg font-medium mb-1">No Document Selected</h3>
              <p className="text-sm mb-4">Create a new document to get started.</p>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={() => {
                  // Create a new document and navigate to it
                  createNewDocument();
                }}
                variant="default"
                className="gap-2"
                disabled={isCreatingDocument}
              >
                {isCreatingDocument ? 
                  <Loader2 className="h-4 w-4 animate-spin" /> : 
                  <PlusIcon className="h-4 w-4" />}
                Create New Document
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Only render editor when data is loaded and synced */} 
            {!isDocumentsFetching && artifact.documentId === initialDocumentId ? (
              <div className="px-8 py-6 mx-auto max-w-3xl">
                <Editor
                        key={artifact.documentId} // Key ensures reset on ID change
                        content={isCurrentVersion ? artifact.content : getDocumentContentById(currentVersionIndex)}
                        onSaveContent={saveContent}
                        // Pass necessary props for Editor
                        status={'idle'} // Default status, adjust if streaming state exists
                        isCurrentVersion={isCurrentVersion}
                        currentVersionIndex={currentVersionIndex} documentId={''}                  // Removed props specific to LexicalEditor
                  // documentId={artifact.documentId}
                  // saveState={isContentDirty ? 'saving' : 'idle'}
                  // isNewDocument={artifact.documentId === 'init'}
                  // onCreateDocument={handleCreateDocumentFromEditor}
                />
              </div>
            ) : (
              // Show loader while waiting for the correct document content to load
              <div className="flex justify-center items-center h-full">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
            )}
            
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
    </div>
  );
} 