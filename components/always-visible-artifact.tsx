'use client';

import { useEffect, useState } from 'react';
import { useWindowSize } from 'usehooks-ts';
import useSWR from 'swr';
import { formatDistance } from 'date-fns';
import { Loader2, FileText, Type, Sparkles, ChevronRight } from 'lucide-react';
import { Dispatch, SetStateAction } from 'react';
import { Message } from 'ai';
import { UseChatHelpers } from '@ai-sdk/react';

import { Document } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { useArtifact } from '@/hooks/use-artifact';
import { artifactDefinitions } from './artifact';
import { ArtifactActions } from './artifact-actions';
import { VersionFooter } from './version-footer';
import { Toolbar } from './toolbar';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './ui/button';

export function AlwaysVisibleArtifact({ chatId }: { chatId: string }) {
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();
  const { width: windowWidth } = useWindowSize();
  
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
      }
    }
  }, [documents, setArtifact]);
  
  // Auto-fetch documents when status changes
  useEffect(() => {
    mutateDocuments();
  }, [artifact.status, mutateDocuments]);
  
  // Save content to the server when it changes
  const saveContent = async (updatedContent: string, debounce: boolean) => {
    if (artifact.documentId === 'init' || !document) {
      // Create new document if it doesn't exist yet
      const response = await fetch(`/api/document`, {
        method: 'POST',
        body: JSON.stringify({
          title: artifact.title || 'New Document',
          content: updatedContent,
          kind: artifact.kind,
        }),
      });
      
      const data = await response.json();
      if (data.id) {
        setArtifact(curr => ({
          ...curr,
          documentId: data.id,
        }));
        mutateDocuments();
      }
      return;
    }
    
    if (document && updatedContent !== document.content) {
      setIsContentDirty(true);
      
      // Save immediately (we're not using debounce in this simplified version)
      await fetch(`/api/document?id=${artifact.documentId}`, {
        method: 'POST',
        body: JSON.stringify({
          title: artifact.title,
          content: updatedContent,
          kind: artifact.kind,
        }),
      });
      
      setIsContentDirty(false);
      mutateDocuments();
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
  
  // Get the appropriate artifact definition
  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind,
  );
  
  if (!artifactDefinition) {
    return <div>No artifact definition found!</div>;
  }
  
  // Initialize artifact when needed
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
  
  // These are dummy functions to satisfy the Toolbar props
  const dummyAppend: UseChatHelpers['append'] = async () => { return ''; };
  const dummyStop: UseChatHelpers['stop'] = () => {};
  const dummySetMessages: Dispatch<SetStateAction<Message[]>> = () => {};
  
  // Check if we should show the empty state
  const showEmptyState = artifact.documentId === 'init' && !artifact.content;
  
  // Function to create a new blank document
  const createNewDocument = () => {
    saveContent("Start typing your document here...", false);
  };
  
  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Header with document info or actions */}
      <div className="flex flex-row justify-between items-center border-b border-border px-3 h-[45px]">
        <div className="flex flex-row gap-4 items-center">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div className="flex flex-col">
            <div className="font-medium">{artifact.title}</div>
            
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground h-4">
              {isContentDirty ? (
                <>
                  <svg className="animate-spin h-3 w-3 text-muted-foreground" viewBox="0 0 24 24">
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
                <span>New document ready for your ideas</span>
              )}
            </div>
          </div>
        </div>
        
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
      
      <div className="dark:bg-muted bg-background h-full overflow-y-auto !max-w-full items-center">
        {isDocumentsFetching && !artifact.content ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : showEmptyState ? (
          <div className="flex flex-col items-center justify-center h-full">
            <motion.div 
              className="max-w-md px-6 py-8 rounded-2xl bg-zinc-50 dark:bg-zinc-900 flex flex-col items-center gap-6 text-center shadow-sm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Type className="h-12 w-12 text-primary" />
              
              <h2 className="text-2xl font-medium text-foreground">
                Create & Edit Documents
              </h2>
              
              <p className="text-muted-foreground">
                Start a conversation with the AI to create a document, or create a blank document to get started right away.
              </p>
              
              <div className="w-full space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full flex justify-between items-center group"
                  onClick={createNewDocument}
                >
                  <div className="flex items-center">
                    <Type className="h-4 w-4 mr-2 text-primary" />
                    <span>Create a blank document</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full flex justify-between items-center group"
                  onClick={() => {
                    // Will be handled by chat, providing visual feedback
                    createNewDocument();
                  }}
                >
                  <div className="flex items-center">
                    <Sparkles className="h-4 w-4 mr-2 text-primary" />
                    <span>Ask AI to write something</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Button>
              </div>
            </motion.div>
          </div>
        ) : (
          <>
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
            />
            
            <AnimatePresence>
              {isCurrentVersion && (
                <Toolbar
                  isToolbarVisible={isToolbarVisible}
                  setIsToolbarVisible={setIsToolbarVisible}
                  append={dummyAppend}
                  status="ready"
                  stop={dummyStop}
                  setMessages={dummySetMessages}
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