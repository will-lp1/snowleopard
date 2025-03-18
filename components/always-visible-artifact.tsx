'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistance } from 'date-fns';
import { Loader2, FileText, PlusIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { Document } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { useArtifact } from '@/hooks/use-artifact';
import { ArtifactActions } from './artifact-actions';
import { VersionFooter } from './version-footer';
import { Toolbar } from './toolbar';
import { Editor } from './text-editor';
import { useDebouncedSave } from '@/hooks/use-debounced-save';
import useSWR from 'swr';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

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
  
  // Use the provided initialDocumentId if available
  useEffect(() => {
    if (initialDocumentId !== 'init' && artifact.documentId === 'init') {
      setArtifact(curr => ({
        ...curr,
        documentId: initialDocumentId
      }));
    }
  }, [initialDocumentId, artifact.documentId, setArtifact]);
  
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
  
  // Update document when documents change
  useEffect(() => {
    if (documents && documents.length > 0) {
      const mostRecentDocument = documents.at(-1);
      
      if (mostRecentDocument) {
        setDocument(mostRecentDocument);
        setCurrentVersionIndex(documents.length - 1);
        setArtifact((currentArtifact) => ({
          ...currentArtifact,
          content: mostRecentDocument.content ?? '',
          title: mostRecentDocument.title,
        }));
        isDocumentInitialized.current = true;
      }
    }
  }, [documents, setArtifact]);
  
  // Auto-fetch documents when status changes
  useEffect(() => {
    if (artifact.documentId !== 'init') {
      mutateDocuments();
    }
  }, [artifact.documentId, artifact.status, mutateDocuments]);
  
  // Create a new document and associated chat
  const createNewDocument = async () => {
    const newChatId = generateUUID();
    const newDocId = generateUUID();
    
    try {
      // First create a new chat
      const chatResponse = await fetch('/api/chat/new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: newChatId,
          title: 'New Document',
        }),
      });
      
      if (!chatResponse.ok) {
        throw new Error('Failed to create new chat');
      }
      
      // Then create a new document linked to the chat
      const docResponse = await fetch('/api/document/new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: newDocId,
          chatId: newChatId,
          title: 'New Document',
          content: '',
          kind: 'text',
        }),
      });
      
      if (!docResponse.ok) {
        throw new Error('Failed to create new document');
      }
      
      // Navigate to the new chat with the new document
      router.push(`/chat/${newChatId}?document=${newDocId}`);
    } catch (error) {
      console.error('Error creating new document:', error);
    }
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
        const response = await fetch(`/api/document/new`, {
          method: 'POST',
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
          setArtifact(curr => ({
            ...curr,
            documentId: data.id,
            content: updatedContent
          }));
          isDocumentInitialized.current = true;
          mutateDocuments();
          
          // Update URL to include document ID
          if (chatId) {
            router.push(`/chat/${chatId}?document=${data.id}`);
          }
        }
      } catch (error) {
        console.error('Error creating document:', error);
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
            <div className="font-medium">{artifact.title}</div>
            
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
          {/* New Document Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={createNewDocument}
              >
                <PlusIcon className="size-4" />
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