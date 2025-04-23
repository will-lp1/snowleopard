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

/**
 * Custom hook that provides utility functions for document and chat operations
 */
export function useDocumentUtils() {
  const router = useRouter();
  const { setArtifact, artifact } = useArtifact();
  const { setOpenMobile, openMobile } = useSidebar();
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [isRenamingDocument, setIsRenamingDocument] = useState(false);

  /**
   * Resets the chat state without changing the document view.
   * Dispatches an event to notify the chat component.
   */
  const handleResetChat = () => {
    console.log('[useDocumentUtils] Resetting chat state');
    // Dispatch an event that the chat component listens for
    // This event will signal the useChat hook to reset its messages and generate a new ID
    window.dispatchEvent(new CustomEvent('reset-chat-state'));
    
    // Close mobile sidebar if open
    if (openMobile) {
      setOpenMobile(false);
    }
  };

  /**
   * Creates a new chat and resets the artifact state
   */
  const handleNewChat = () => {
    if (isCreatingChat) return;
    setIsCreatingChat(true);
    
    try {
      // Reset artifact state before navigation
      setArtifact({
        documentId: 'init', // Reset to initial state
        title: 'New Document',
        kind: 'text',
        isVisible: true,
        status: 'idle',
        content: '',
        boundingBox: { top: 0, left: 0, width: 0, height: 0 } // Default bounding box
      });
      
      // Close mobile sidebar if open
      setOpenMobile(false);
      
      // Navigate to documents page
      router.push('/documents');
      router.refresh();
    } catch (error) {
      console.error('Error creating new document:', error);
      toast.error('Failed to create new document');
    } finally {
      setIsCreatingChat(false);
    }
  };

  /**
   * Creates a new document and navigates to it
   */
  const createNewDocument = async () => {
    if (isCreatingDocument) return;
    
    setIsCreatingDocument(true);
    const newDocId = generateUUID();
    
    try {
      console.log('[Document] Creating new document:', {
        documentId: newDocId
      });
      
      // Create the document in the database first
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
      
      // Dispatch an event to notify the sidebar to update immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-created', {
          detail: {
            document: document
          }
        }));
      }
      
      // Close mobile sidebar if it's open
      if (openMobile) {
        setOpenMobile(false);
      }
      
      toast.success('Document created', { 
        id: 'document-created',
        duration: 2000 
      });
      
      // Always navigate directly to the document page
      router.push(`/documents/${newDocId}`);
      
    } catch (error) {
      console.error('[Document] Error creating document:', error);
      
      toast.error('Failed to create document', {
        description: error instanceof Error ? error.message : String(error),
        duration: 5000
      });
    } finally {
      // Always cleanup to enable future document creation
      setTimeout(() => {
        setIsCreatingDocument(false);
      }, 1000);
    }
  };

  /**
   * Renames an existing document
   */
  const renameDocument = async (newTitle: string) => {
    if (isRenamingDocument || !artifact.documentId || artifact.documentId === 'init') return;

    if (!newTitle.trim()) {
      toast.error('Document title cannot be empty');
      return;
    }

    const originalTitle = artifact.title; // Store original title for potential revert
    setIsRenamingDocument(true);

    try {
      // Send the update to the server using POST
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
        // No state was changed yet, just throw error
        const errorData = await response.json().catch(() => ({ error: 'Unknown error during rename' }));
        throw new Error(`Failed to rename document: ${errorData.error || response.statusText}`);
      }

      // --- Success Case: Update state and dispatch event AFTER successful API call ---
      const updatedDocumentData = await response.json(); // Get potentially updated data

      // Update local artifact state
      setArtifact(current => ({
        ...current,
        // Use title from response if available, otherwise use the requested newTitle
        title: updatedDocumentData?.title || newTitle
      }));

      // Dispatch the event now that the server has confirmed
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-renamed', {
          detail: {
            documentId: artifact.documentId,
            newTitle: updatedDocumentData?.title || newTitle
          }
        }));
      }
      // Note: SWR mutations for list and specific item could also be triggered here
      // For example: mutate('/api/document'); mutate(`/api/document?id=${artifact.documentId}`);

      // Add to document cache (if still using manual cache alongside SWR)
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
      // No need to revert state as it wasn't changed optimistically
    } finally {
      setIsRenamingDocument(false);
    }
  };

  // Create a new document
  const createDocument = async (params: CreateDocumentParams) => {
    setIsCreatingDocument(true);
    
    try {
      // Generate a document ID or use the provided one
      const documentId = params.providedId || generateUUID();
      
      // Create the document
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
      
      // Update the artifact state
      setArtifact(curr => ({
        ...curr,
        documentId: documentId,
        title: params.title,
        content: params.content,
        kind: params.kind,
        status: 'idle',
        isVisible: true,
      }));
      
      // Dispatch an event to notify the sidebar to update immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('document-created', {
          detail: {
            document: document
          }
        }));
      }
      
      // Navigate to document view if needed
      if (params.navigateAfterCreate) {
        router.push(`/documents/${documentId}`);
      }
      
      // Add to document cache for immediate access
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
  
  // Load a document by ID
  const loadDocument = async (documentId: string, params?: LoadDocumentParams) => {
    try {
      if (!documentId || documentId === 'init') {
        console.error('[useDocumentUtils] Invalid document ID:', documentId);
        return null;
      }
      
      // Fetch the document
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
      
      // Update the artifact state
      setArtifact(curr => ({
        ...curr,
        documentId: document.id,
        title: document.title,
        content: document.content || '',
        kind: document.kind as ArtifactKind,
        status: 'idle',
        isVisible: true,
      }));
      
      // Navigate to document view if needed
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
  
  // Delete a document by ID
  const deleteDocument = async (documentId: string, params?: DeleteDocumentParams) => {
    try {
      // Check if the document ID is valid
      if (!documentId || documentId === 'undefined' || documentId === 'null' || documentId === 'init') {
        console.error('[useDocumentUtils] Invalid document ID for deletion:', documentId);
        toast.error('Cannot delete: Invalid document ID');
        return false;
      }

      // Perform the delete operation
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
      
      // Navigate to redirect URL if provided, using replace to prevent history stacking
      if (params?.redirectUrl) {
        router.replace(params.redirectUrl);
      } else {
        // Force a soft refresh of the current page to prevent flicker
        router.refresh();
      }
      
      // Remove from document cache
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