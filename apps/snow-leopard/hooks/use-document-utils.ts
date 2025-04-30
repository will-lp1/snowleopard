'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useArtifact } from './use-artifact';
import { toast } from 'sonner';
import { generateUUID } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { ArtifactKind } from '@/components/artifact';

interface CreateDocumentParams {
  title: string;
  content: string;
  kind: ArtifactKind;
  chatId: string | null;
  navigateAfterCreate?: boolean;
  providedId?: string;
}

interface LoadDocumentParams {
  navigateAfterLoad?: boolean;
  chatId?: string;
}

interface DeleteDocumentParams {
  redirectUrl?: string;
}

export function useDocumentUtils() {
  const router = useRouter();
  const { setArtifact, artifact } = useArtifact();
  const { setOpenMobile, openMobile } = useSidebar();
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [isRenamingDocument, setIsRenamingDocument] = useState(false);

  const handleResetChat = () => {
    console.log('[useDocumentUtils] Resetting chat state');
    window.dispatchEvent(new CustomEvent('reset-chat-state'));
    
    if (openMobile) {
      setOpenMobile(false);
    }
  };

  const handleNewChat = () => {
    if (isCreatingChat) return;
    setIsCreatingChat(true);
    
    try {
      setArtifact({
        documentId: 'init', 
        title: 'New Document',
        kind: 'text',
        isVisible: true,
        status: 'idle',
        content: '',
        boundingBox: { top: 0, left: 0, width: 0, height: 0 } 
      });
      
      setOpenMobile(false);
      
      router.push('/documents');
      router.refresh();
    } catch (error) {
      console.error('Error creating new document:', error);
      toast.error('Failed to create new document');
    } finally {
      setIsCreatingChat(false);
    }
  };

  const createNewDocument = async () => {
    if (isCreatingDocument) return;
    
    setIsCreatingDocument(true);
    const newDocId = generateUUID();
    
    try {
      console.log('[Document] Creating new document:', {
        documentId: newDocId
      });
      
      const docResponse = await fetch('/api/document', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: newDocId,
          title: 'Document',
          content: '',
          kind: 'text',
        }),
      });
      
      if (!docResponse.ok) {
        const docErrorData = await docResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Document] Failed to create document:', docResponse.status, docErrorData);
        throw new Error(`Failed to create document: ${docResponse.status} ${docErrorData.error || ''}`);
      }
      
      const document = await docResponse.json();
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-created', {
          detail: {
            document: document
          }
        }));
      }
      
      if (openMobile) {
        setOpenMobile(false);
      }
      
      toast.success('Document created', { 
        id: 'document-created',
        duration: 2000 
      });
      
      router.push(`/documents/${newDocId}`);
      
    } catch (error) {
      console.error('[Document] Error creating document:', error);
      
      toast.error('Failed to create document', {
        description: error instanceof Error ? error.message : String(error),
        duration: 5000
      });
    } finally {
      setTimeout(() => {
        setIsCreatingDocument(false);
      }, 1000);
    }
  };

  const renameDocument = async (newTitle: string) => {
    if (isRenamingDocument || !artifact.documentId || artifact.documentId === 'init') return;

    if (!newTitle.trim()) {
      toast.error('Document title cannot be empty');
      return;
    }

    const originalTitle = artifact.title; 
    setIsRenamingDocument(true);

    try {
      const response = await fetch(`/api/document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: artifact.documentId,
          title: newTitle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error during rename' }));
        throw new Error(`Failed to rename document: ${errorData.error || response.statusText}`);
      }

      const updatedDocumentData = await response.json(); 

      setArtifact(current => ({
        ...current,
        title: updatedDocumentData?.title || newTitle
      }));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-renamed', {
          detail: {
            documentId: artifact.documentId,
            newTitle: updatedDocumentData?.title || newTitle
          }
        }));
      }

      if (typeof window !== 'undefined' && (window as any).__DOCUMENT_CACHE) {
        const cachedDoc = (window as any).__DOCUMENT_CACHE.get(artifact.documentId);
        if (cachedDoc) {
          (window as any).__DOCUMENT_CACHE.set(artifact.documentId, {
            ...cachedDoc,
            title: updatedDocumentData?.title || newTitle
          });
        }
      }

      toast.success('Document renamed', {
        duration: 2000
      });
    } catch (error: any) {
      console.error('Error renaming document:', error);
      toast.error('Failed to rename document', {
        description: error.message
      });
    } finally {
      setIsRenamingDocument(false);
    }
  };

  const createDocument = async (params: CreateDocumentParams) => {
    setIsCreatingDocument(true);
    
    try {
      const documentId = params.providedId || generateUUID();
      
      const response = await fetch('/api/document', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: documentId,
          title: params.title,
          content: params.content,
          kind: params.kind,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create document');
      }
      
      const document = await response.json();
      
      setArtifact(curr => ({
        ...curr,
        documentId: documentId,
        title: params.title,
        content: params.content,
        kind: params.kind,
        status: 'idle',
        isVisible: true,
      }));
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-created', {
          detail: {
            document: document
          }
        }));
      }
      
      if (params.navigateAfterCreate) {
        router.push(`/documents/${documentId}`);
      }
      
      if (typeof window !== 'undefined') {
        if (!(window as any).__DOCUMENT_CACHE) {
          (window as any).__DOCUMENT_CACHE = new Map();
        }
        (window as any).__DOCUMENT_CACHE.set(documentId, {
          id: documentId,
          title: params.title,
          content: params.content,
          kind: params.kind,
        });
      }
      
      return document;
    } catch (error) {
      console.error('[useDocumentUtils] Error creating document:', error);
      toast.error('Failed to create document');
      return null;
    } finally {
      setIsCreatingDocument(false);
    }
  };
  
  const loadDocument = async (documentId: string, params?: LoadDocumentParams) => {
    try {
      if (!documentId || documentId === 'init') {
        console.error('[useDocumentUtils] Invalid document ID:', documentId);
        return null;
      }
      
      const response = await fetch(`/api/document?id=${documentId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load document: ${response.statusText}`);
      }
      
      const documents = await response.json();
      
      if (!documents || documents.length === 0) {
        console.error('[useDocumentUtils] Document not found:', documentId);
        return null;
      }
      
      const document = documents[0];
      
      setArtifact(curr => ({
        ...curr,
        documentId: document.id,
        title: document.title,
        content: document.content || '',
        kind: document.kind as ArtifactKind,
        status: 'idle',
        isVisible: true,
      }));
      
      if (params?.navigateAfterLoad) {
        router.push(`/documents/${documentId}`);
      }
      
      return document;
    } catch (error) {
      console.error('[useDocumentUtils] Error loading document:', error);
      toast.error('Failed to load document');
      return null;
    }
  };
  
  const deleteDocument = async (documentId: string, params?: DeleteDocumentParams) => {
    try {
      if (!documentId || documentId === 'undefined' || documentId === 'null' || documentId === 'init') {
        console.error('[useDocumentUtils] Invalid document ID for deletion:', documentId);
        toast.error('Cannot delete: Invalid document ID');
        return false;
      }

      const response = await fetch(`/api/document`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: documentId,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete document');
      }
      
      if (params?.redirectUrl) {
        router.replace(params.redirectUrl);
      } else {
        router.refresh();
      }
      
      if (typeof window !== 'undefined' && (window as any).__DOCUMENT_CACHE) {
        (window as any).__DOCUMENT_CACHE.delete(documentId);
      }
      
      toast.success('Document deleted');
      return true;
    } catch (error) {
      console.error('[useDocumentUtils] Error deleting document:', error);
      toast.error('Failed to delete document');
      return false;
    }
  };

  return {
    handleNewChat,
    createNewDocument,
    renameDocument,
    isCreatingChat,
    isCreatingDocument,
    isRenamingDocument,
    createDocument,
    loadDocument,
    deleteDocument,
    handleResetChat,
  };
} 