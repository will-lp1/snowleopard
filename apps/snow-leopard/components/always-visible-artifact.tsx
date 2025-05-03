'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo, Suspense, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Loader2, FileText, PlusIcon } from 'lucide-react';

import type { Document } from '@snow-leopard/db';
import { generateUUID } from '@/lib/utils';
import { useArtifact } from '@/hooks/use-artifact';
import { ArtifactActions } from '@/components/artifact-actions';
import { VersionHeader } from '@/components/document/version-header';
import { useDocumentUtils } from '@/hooks/use-document-utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Input } from './ui/input';
import { useDocumentContext } from '@/hooks/use-document-context';
import { ArtifactKind } from '@/components/artifact';
import { AiSettingsMenu } from './ai-settings-menu';
import { SidebarToggle } from '@/components/sidebar/sidebar-toggle';
import type { SaveState } from '@/lib/editor/save-plugin';
import type { User } from '@/lib/auth';

const Editor = dynamic(() => import('@/components/document/text-editor').then(mod => mod.Editor), {
  ssr: false, 
  loading: () => <EditorSkeleton />, 
});

const EditorSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-6 bg-muted rounded w-3/4"></div>
    <div className="h-4 bg-muted rounded w-full"></div>
    <div className="h-4 bg-muted rounded w-5/6"></div>
    <div className="h-4 bg-muted rounded w-full"></div>
    <div className="h-4 bg-muted rounded w-1/2"></div>
  </div>
);

type AlwaysVisibleArtifactProps = {
  chatId: string;
  initialDocumentId: string;
  initialDocuments: Document[];
  showCreateDocumentForId?: string;
  user: User;
};

type SettableArtifact = {
  documentId: string;
  title: string;
  content: string;
  kind: ArtifactKind;
  status: 'idle' | 'loading' | 'streaming';
  isVisible?: boolean;
  boundingBox?: any;
};

const defaultArtifactProps = {
    isVisible: false,
    boundingBox: undefined,
};

export function AlwaysVisibleArtifact({
  chatId,
  initialDocumentId,
  initialDocuments = [],
  showCreateDocumentForId,
  user
}: AlwaysVisibleArtifactProps) {
  const router = useRouter();
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();
  const { documentId: contextDocumentId } = useDocumentContext();
  const {
    isCreatingDocument,
    renameDocument,
    isRenamingDocument,
    createDocument
  } = useDocumentUtils();

  const [isPending, startTransition] = useTransition();
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'edit' | 'diff'>('edit');

  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [currentVersionIndex, setCurrentVersionIndex] = useState<number>(initialDocuments.length > 0 ? initialDocuments.length - 1 : -1);

  const currentDocument = useMemo(() => {
    if (currentVersionIndex >= 0 && currentVersionIndex < documents.length) {
      return documents[currentVersionIndex];
    }
    return null;
  }, [documents, currentVersionIndex]);

  const latestDocument = useMemo(() => {
      if (documents && documents.length > 0) {
          return documents[documents.length - 1];
      }
      return null;
  }, [documents]);

  useEffect(() => {
    startTransition(() => {
        const docs = initialDocuments || [];
        setDocuments(docs);
        const initialIndex = docs.length > 0 ? docs.length - 1 : -1;
        setCurrentVersionIndex(initialIndex);
        setMode('edit');

        const docToUse = docs[initialIndex];

        if (docToUse) {
            const artifactData: SettableArtifact = {
                ...defaultArtifactProps,
                documentId: docToUse.id,
                title: docToUse.title,
                content: docToUse.content ?? '',
                kind: (docToUse.kind as ArtifactKind) || 'text',
                status: 'idle'
            };
            setArtifact(artifactData as any);
            setNewTitle(artifactData.title);
        } else if (initialDocumentId === 'init' || showCreateDocumentForId) {
            const initData: SettableArtifact = {
                ...defaultArtifactProps,
                documentId: 'init',
                title: 'Document',
                content: '',
                kind: 'text' as ArtifactKind,
                status: 'idle'
            };
            setArtifact(initData as any);
            setNewTitle(initData.title);
        }
    });

  }, [initialDocumentId, initialDocuments, setArtifact, startTransition, artifact.documentId]);

  useEffect(() => {
    const handleDocumentRenamed = (event: CustomEvent) => {
      if (!event.detail) return;
      const { documentId: renamedDocId, newTitle: updatedTitle } = event.detail;

      setDocuments(prevDocs =>
          prevDocs.map(doc =>
              doc.id === renamedDocId ? { ...doc, title: updatedTitle } : doc
          )
      );

      if (renamedDocId === artifact.documentId) {
        setArtifact(current => ({
          ...current,
          title: updatedTitle
        }));
        if (editingTitle && newTitle !== updatedTitle) {
            setNewTitle(updatedTitle);
        }
      }
    };

    window.addEventListener('document-renamed', handleDocumentRenamed as EventListener);
    return () => window.removeEventListener('document-renamed', handleDocumentRenamed as EventListener);
  }, [artifact.documentId, editingTitle, newTitle, setArtifact]);

  const handleEditTitle = useCallback(() => {
    if (!latestDocument) return;
    setNewTitle(latestDocument.title);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  }, [latestDocument]);

  const handleSaveTitle = useCallback(async () => {
    if (!latestDocument) return;
    const trimmedNewTitle = newTitle.trim();
    if (trimmedNewTitle && trimmedNewTitle !== latestDocument.title) {
      const originalTitle = latestDocument.title;
      const originalDocuments = [...documents];
      
      setDocuments(prevDocs => prevDocs.map(doc => 
        doc.id === latestDocument.id ? { ...doc, title: trimmedNewTitle } : doc
      ));

      try {
        await renameDocument(trimmedNewTitle);
      } catch (error) {
        toast.error("Failed to rename document.");
        setDocuments(originalDocuments);
        console.error("Rename failed:", error);
      } finally {
        setEditingTitle(false);
      }
    } else {
       setEditingTitle(false);
       if (!trimmedNewTitle) setNewTitle(latestDocument.title);
    }
  }, [newTitle, latestDocument, documents, renameDocument, setArtifact]);

  const handleCancelEditTitle = useCallback(() => {
    if (!latestDocument) return;
    setEditingTitle(false);
    setNewTitle(latestDocument.title);
  }, [latestDocument]);

  const handleVersionChange = useCallback((type: 'next' | 'prev' | 'toggle' | 'latest') => {
    if (documents.length <= 1 && (type === 'next' || type === 'prev' || type === 'toggle')) return;

    startTransition(() => {
        if (type === 'latest') {
            setCurrentVersionIndex(documents.length - 1);
            setMode('edit');
            return;
        }

        if (type === 'toggle') {
            const nextMode = mode === 'edit' ? 'diff' : 'edit';
            setMode(nextMode);
            if (nextMode === 'edit') {
                setCurrentVersionIndex(documents.length - 1);
            }
            return;
        }

        setMode('diff');
        if (type === 'prev') {
            setCurrentVersionIndex((index) => Math.max(0, index - 1));
        } else if (type === 'next') {
            setCurrentVersionIndex((index) => Math.min(documents.length - 1, index + 1));
        }
    });
  }, [documents, mode, startTransition]);

  const getContentForVersion = useCallback((index: number): string => {
    if (!documents || index < 0 || index >= documents.length) return '';
    return documents[index].content ?? '';
  }, [documents]);

  const handleCreateDocumentWithId = useCallback(async (id: string) => {
    if (isCreatingDocument) return;
    try {
      await createDocument({
        title: 'Untitled Document',
        content: '',
        kind: 'text',
        chatId: null,
        navigateAfterCreate: true,
        providedId: id
      });
    } catch (error) {
      console.error('Error creating document with specific ID:', error);
      toast.error('Failed to create document');
    }
  }, [isCreatingDocument, createDocument]);

  const handleCreateDocumentFromEditor = useCallback(async (initialContent: string) => {
      if (isCreatingDocument || initialDocumentId !== 'init') return;
      const newDocId = generateUUID();
      try {
          await createDocument({
              title: 'Untitled Document',
              content: initialContent,
              kind: 'text',
              chatId: null,
              navigateAfterCreate: true,
              providedId: newDocId
          });
      } catch (error) {
          console.error('Error creating document from editor:', error);
          toast.error('Failed to create document');
      }
  }, [isCreatingDocument, initialDocumentId, createDocument]);

  const isCurrentVersion = useMemo(() => currentVersionIndex === documents.length - 1, [currentVersionIndex, documents]);

  const editorContent = useMemo(() => {
      if (initialDocumentId === 'init' && !showCreateDocumentForId) {
          return '';
      }
      if (documents.length === 0 && !showCreateDocumentForId) {
          return '';
      }
      return getContentForVersion(currentVersionIndex);

  }, [initialDocumentId, documents, currentVersionIndex, showCreateDocumentForId, getContentForVersion]);

  const editorDocumentId = useMemo(() => {
       if (showCreateDocumentForId) return 'init';
       return latestDocument?.id ?? 'init';
   }, [showCreateDocumentForId, latestDocument]);

  if (showCreateDocumentForId) {
    return (
      <div className="flex flex-col h-dvh bg-background">
         <div className="flex flex-row justify-between items-center border-b border-zinc-200 dark:border-zinc-700 px-3 h-[45px]">
           <div className="flex flex-row gap-2 items-center min-w-0">
             <SidebarToggle />
             <div className="font-medium truncate h-6 leading-6 px-1">Document Not Found</div>
           </div>
         </div>
         <div className="flex flex-col justify-center items-center h-full gap-4 text-muted-foreground">
            <FileText className="size-16 opacity-50" />
            <div className="text-center">
              <h3 className="text-lg font-medium mb-1">Create New Document?</h3>
              <p className="text-sm mb-1">Document ID <code className="text-xs bg-muted p-1 rounded">{showCreateDocumentForId}</code> not found.</p>
              <p className="text-sm mb-4">Would you like to create it?</p>
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
                onClick={() => router.push('/documents')}
              >
                Cancel
              </Button>
            </div>
         </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-background">
      <div className="flex flex-row justify-between items-center border-b border-zinc-200 dark:border-zinc-700 px-3 h-[45px]">
        <div className="flex flex-row gap-2 items-center min-w-0">
          <SidebarToggle />
          {isPending ? (
            <div className="h-4 w-32 bg-muted rounded animate-pulse"></div>
          ) : (
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
                    disabled={isRenamingDocument || !latestDocument}
                    aria-label="Edit document title"
                  />
                ) : (
                  <div
                    className={`font-medium truncate h-6 leading-6 px-1 ${latestDocument ? 'cursor-pointer hover:underline' : 'text-muted-foreground'}`}
                    onClick={latestDocument ? handleEditTitle : undefined}
                    onDoubleClick={latestDocument ? handleEditTitle : undefined}
                    title={latestDocument ? `Rename "${latestDocument.title}"` : (initialDocumentId === 'init' ? 'Untitled Document' : 'Loading...')}
                  >
                    {latestDocument?.title ?? artifact.title ?? 'Document'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {documents && documents.length > 0 && (
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
        {!isCurrentVersion && documents && documents.length > 1 && (
          <VersionHeader
            key={`${currentDocument?.id}-${currentVersionIndex}`}
            currentVersionIndex={currentVersionIndex}
            documents={documents}
            handleVersionChange={handleVersionChange}
          />
        )}

        <div className="px-8 py-6 mx-auto max-w-3xl">
             {isPending ? (
                 <EditorSkeleton />
             ) : (
                 <Suspense fallback={<EditorSkeleton />}>
                     <Editor
                        key={editorDocumentId}
                        content={editorContent}
                        status={'idle'}
                        isCurrentVersion={isCurrentVersion}
                        currentVersionIndex={currentVersionIndex}
                        documentId={editorDocumentId}
                        initialLastSaved={latestDocument ? new Date(latestDocument.updatedAt) : null}
                        onStatusChange={(newSaveState: SaveState) => {
                        }}
                        onCreateDocumentRequest={handleCreateDocumentFromEditor}
                      />
                </Suspense>
             )}
        </div>
      </div>
    </div>
  );
} 