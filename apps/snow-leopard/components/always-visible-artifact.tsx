'use client';

import { useEffect, useState, useRef, SetStateAction, Dispatch } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistance } from 'date-fns';
import { Loader2, FileText, PlusIcon, MessageSquareIcon, PencilIcon, CheckIcon, XIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { EditorState } from 'prosemirror-state';

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
import type { SaveState } from '@/lib/editor/save-plugin';
import { savePluginKey } from '@/lib/editor/save-plugin';
import { getActiveEditorView } from '@/lib/editor/editor-state';

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
  
  const [isSwitchingDocument, setIsSwitchingDocument] = useState(false);
  const [isCreatingInitialDocument, setIsCreatingInitialDocument] = useState(false);
  const creationDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Array<Document>>(
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
  const lastDocumentIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (documentIdFromUrlRef.current === null) {
      if (initialDocumentId && initialDocumentId !== 'init' && initialDocumentId !== 'undefined' && initialDocumentId !== 'null') {
        console.log('[Document] Using initialDocumentId:', initialDocumentId);
        documentIdFromUrlRef.current = initialDocumentId;
        
        setArtifact((curr: any) => ({
          ...curr,
          documentId: initialDocumentId,
          status: 'idle',
        }));
        
        updateDocument(initialDocumentId, artifact.title, artifact.content, artifact.kind);
        
        setTimeout(() => {
          mutateDocuments();
        }, 0);
      } else if (chatId) {
        console.log('[Document] No document ID found but have chat ID, checking for documents by chat:', chatId);
        
        fetch(`/api/document?chatId=${chatId}`)
          .then(res => res.json())
          .then(docs => {
            if (Array.isArray(docs) && docs.length > 0) {
              const docId = docs[0].id;
              console.log('[Document] Found document for chat:', docId);
              documentIdFromUrlRef.current = docId;
              
              setArtifact((curr: any) => ({
                ...curr,
                documentId: docId,
                status: 'idle',
                title: docs[0].title || 'Document',
              }));
              
              router.push(`/documents/${docId}`);
              
              setTimeout(() => {
                mutateDocuments();
              }, 0);
            } else {
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
  
  useEffect(() => {
    if (initialDocumentId && 
        initialDocumentId !== 'init' && 
        initialDocumentId !== artifact.documentId) {
      console.log('[Document] Switching document ID from props:', initialDocumentId);
      
      setIsSwitchingDocument(true);
      documentIdFromUrlRef.current = initialDocumentId;
      
      setArtifact((curr: any) => ({ 
        ...curr,
        documentId: initialDocumentId,
        content: '', 
        title: 'Loading...', 
        status: 'loading' 
      }));
      
      setDocument(null);
      setCurrentVersionIndex(-1);
      
      setTimeout(() => {
        mutateDocuments();
      }, 50); 

    } else if (!initialDocumentId || initialDocumentId === 'init') {
       if (artifact.documentId !== 'init') {
           console.log('[Document] Switching back to init state.');
           setIsSwitchingDocument(true);
           setArtifact((curr: any) => ({ 
             ...curr,
             documentId: 'init',
             content: '',
             title: 'Document',
             status: 'idle' 
           }));
           setDocument(null);
           setCurrentVersionIndex(-1);
           setTimeout(() => setIsSwitchingDocument(false), 50);
       }
    }
  }, [initialDocumentId]);
  
  useEffect(() => {
    const syncDocumentIdWithUrl = () => {
      if (initialDocumentId && 
          initialDocumentId !== 'init' && 
          initialDocumentId !== 'undefined' && 
          initialDocumentId !== 'null') {
        return;
      }
      
      const urlParams = new URLSearchParams(window.location.search);
      const docId = urlParams.get('document');
      
      if (docId && 
          docId !== 'undefined' && 
          docId !== 'null' && 
          docId !== 'init' && 
          docId !== artifact.documentId) {
        console.log('[Document] URL document ID changed:', docId);
        
        setArtifact((curr: any) => ({
          ...curr,
          documentId: docId,
          content: '',  
          status: 'idle'
        }));
        
        setTimeout(() => {
          mutateDocuments();
        }, 0);
      }
    };
    
    syncDocumentIdWithUrl();
    
    window.addEventListener('popstate', syncDocumentIdWithUrl);
    
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
  
  useEffect(() => {
    if (artifact.documentId !== 'init' && 
        artifact.documentId !== 'null' && 
        artifact.documentId !== 'undefined' && 
        artifact.content) {
      console.log('[Document] Chat context updated with document:', artifact.documentId);
    }
  }, [artifact.documentId, artifact.content]);
  
  useEffect(() => {
    if (!documents || documents.length === 0) {
      if (artifact.documentId !== 'init') {
        setIsSwitchingDocument(false); 
      }
      return;
    }
    
    const mostRecentDocument = documents[documents.length - 1];
    
    if (!mostRecentDocument) {
      setIsSwitchingDocument(false);
      return;
    }

    if (mostRecentDocument.id !== artifact.documentId) {
      console.log(`[Document] Ignoring fetched data for ${mostRecentDocument.id} as target is ${artifact.documentId}`);
      return; 
    }
    
    console.log('[Document] Correct document data loaded:', mostRecentDocument.id);
    
    setDocument(mostRecentDocument);
    setCurrentVersionIndex(documents.length - 1);
    
    setArtifact((currentArtifact: any) => ({ 
      ...currentArtifact,
      content: mostRecentDocument.content ?? '',
      title: mostRecentDocument.title,
      documentId: mostRecentDocument.id,
      kind: mostRecentDocument.kind as ArtifactKind || 'text',
      status: 'idle' 
    }));
    
    updateDocument(
      mostRecentDocument.id,
      mostRecentDocument.title || 'Untitled Document',
      mostRecentDocument.content || '',
      mostRecentDocument.kind as ArtifactKind || 'text'
    );
    
    lastDocumentIdRef.current = mostRecentDocument.id;
    
    setIsSwitchingDocument(false);

  }, [documents, artifact.documentId, setArtifact, updateDocument]);
  
  useEffect(() => {
    if (documents && documents.length > 0 && mode === 'edit') {
      setCurrentVersionIndex(documents.length - 1);
    }
  }, [documents, mode]);
  
  const handleEditTitle = () => {
    setNewTitle(artifact.title);
    setEditingTitle(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 50);
  };
  
  const handleSaveTitle = async () => {
    if (newTitle.trim() !== artifact.title) {
      await renameDocument(newTitle);
    }
    setEditingTitle(false);
  };
  
  const handleCancelEditTitle = () => {
    setEditingTitle(false);
    setNewTitle(artifact.title);
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
        setMode('diff');
      }
    } else if (type === 'next') {
      if (currentVersionIndex < documents.length - 1) {
        setCurrentVersionIndex((index) => index + 1);
      }
    }
  };
  
  const isCurrentVersion = documents && documents.length > 0
    ? currentVersionIndex === documents.length - 1
    : true;
  
  const isLoadingValidDocument = 
    isDocumentsFetching && 
    artifact.documentId !== 'init' && 
    artifact.documentId !== 'undefined' && 
    artifact.documentId !== 'null';
  
  const handleCreateDocumentWithId = async (id: string) => {
    if (isCreatingDocument) return;
    
    try {
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
  
  const handleCreateDocumentFromEditor = async (initialContent: string) => {
    if (isCreatingDocument || artifact.documentId !== 'init') return;
    
    console.log('[Artifact] Creating new document from editor input...');
    const newDocId = generateUUID();
    
    try {
      const document = await createDocument({
        title: 'Untitled Document',
        content: initialContent,
        kind: 'text',
        chatId: null, 
        navigateAfterCreate: true,
        providedId: newDocId
      });
      
      if (document) {
        setArtifact((curr: any) => ({
          ...curr,
          documentId: document.id,
          title: document.title,
          content: document.content,
          kind: document.kind,
          status: 'idle'
        }));
        updateDocument(document.id, document.title, document.content, document.kind);
        toast.success('Document created');
      } else {
        toast.error('Failed to create document.');
      }
    } catch (error) {
      console.error('Error creating document from editor:', error);
      toast.error('Failed to create document');
    }
  };
  
  useEffect(() => {
    const handleDocumentRenamed = (event: CustomEvent) => {
      if (!event.detail) return;
      
      const { documentId, newTitle } = event.detail;
      
      if (documentId === artifact.documentId) {
        console.log('[Document] Updating document title from event:', newTitle);
        
        setArtifact(current => ({
          ...current,
          title: newTitle
        }));
        
        updateDocument(
          documentId,
          newTitle,
          artifact.content,
          artifact.kind
        );
        
        setTimeout(() => {
          mutateDocuments();
        }, 100);
      }
    };
    
    window.addEventListener('document-renamed', handleDocumentRenamed as EventListener);
    
    return () => {
      window.removeEventListener('document-renamed', handleDocumentRenamed as EventListener);
    };
  }, [artifact.documentId, artifact.content, artifact.kind, setArtifact, updateDocument, mutateDocuments]);
  
  useEffect(() => {
    if (artifact.documentId !== 'init') {
      setIsCreatingInitialDocument(false);
    }
  }, [artifact.documentId]);

  useEffect(() => {
    return () => {
      if (creationDebounceTimeoutRef.current) {
        clearTimeout(creationDebounceTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-dvh bg-background">
      <div className="flex flex-row justify-between items-center border-b border-zinc-200 dark:border-zinc-700 px-3 h-[45px]">
        <div className="flex flex-row gap-2 items-center min-w-0">
          <SidebarToggle />
          <div className="flex flex-col min-w-0">
            <div className="h-6 flex items-center">
              {editingTitle ? (
                <Input
                  ref={titleInputRef}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="h-6 py-0 px-1 text-sm font-medium flex-grow bg-transparent border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-75"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') handleCancelEditTitle();
                  }}
                  onBlur={handleSaveTitle}
                  disabled={isRenamingDocument}
                  aria-label="Edit document title"
                />
              ) : (
                <div 
                  className="font-medium cursor-pointer hover:underline truncate h-6 leading-6 px-1"
                  onClick={document ? handleEditTitle : undefined}
                  onDoubleClick={document ? handleEditTitle : undefined}
                  title={document ? "Click or double-click to rename" : 'Document'}
                >
                  {document ? artifact.title : 'Document'}
                </div>
              )}
            </div>
          </div>
        </div>
        
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

        {isSwitchingDocument ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : isLoadingValidDocument ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : showCreateDocumentForId ? (
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
                  router.push('/documents');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-8 py-6 mx-auto max-w-3xl">
              <Editor
                key={artifact.documentId}
                content={
                  artifact.documentId === 'init' 
                    ? '' 
                    : isCurrentVersion 
                      ? artifact.content 
                      : getDocumentContentById(currentVersionIndex)
                }
                status={'idle'}
                isCurrentVersion={artifact.documentId === 'init' ? true : isCurrentVersion}
                currentVersionIndex={artifact.documentId === 'init' ? -1 : currentVersionIndex}
                documentId={artifact.documentId}
                initialLastSaved={document ? new Date(document.updatedAt) : null}
                onStatusChange={(newSaveState) => {
                  console.log('[Artifact] Editor save status changed:', newSaveState);
                }}
              />
            </div>
            
            <AnimatePresence>
              {artifact.documentId !== 'init' && isCurrentVersion && (
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