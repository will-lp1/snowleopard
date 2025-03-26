'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useArtifact } from './use-artifact';
import { toast } from 'sonner';
import { generateUUID } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import useSWR, { useSWRConfig, mutate as globalMutate } from 'swr';
import { ArtifactKind } from '@/components/artifact';

// Make SWR mutate available globally to enable cross-component refreshing
if (typeof window !== 'undefined') {
  // Use the global mutate function directly instead of hooks
  (window as any).__SWR_MUTATE_FN = globalMutate;
}

// Add a cache for document content to improve rapid switching
if (typeof window !== 'undefined') {
  (window as any).__DOCUMENT_CACHE = new Map();
}

/**
 * Custom hook that provides utility functions for document and chat operations
 */
export function useDocumentUtils() {
  const router = useRouter();
  const { setArtifact, artifact } = useArtifact();
  const { setOpenMobile, openMobile } = useSidebar();
  const { mutate } = useSWRConfig();
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [isRenamingDocument, setIsRenamingDocument] = useState(false);
  const [isDeletingDocument, setIsDeletingDocument] = useState(false);
  const [isPendingDocumentSetup, setIsPendingDocumentSetup] = useState(false);

  /**
   * Creates a new chat and resets the artifact state
   */
  const handleNewChat = useCallback(() => {
    if (isCreatingChat) return;
    setIsCreatingChat(true);
    
    try {
      // Reset artifact state before navigation
      setArtifact({
        documentId: 'init', // Reset to initial state
        title: 'Untitled Document',
        kind: 'text',
        isVisible: true,
        status: 'idle',
        content: '',
        boundingBox: { top: 0, left: 0, width: 0, height: 0 } // Default bounding box
      });
      
      // Close mobile sidebar if open
      setOpenMobile(false);
      
      // Navigate to new chat page
      router.push('/chat');
    } catch (error) {
      console.error('Error creating new chat:', error);
      toast.error('Failed to create new chat');
    } finally {
      setTimeout(() => {
        setIsCreatingChat(false);
      }, 500);
    }
  }, [router, setArtifact, setOpenMobile, isCreatingChat]);

  /**
   * Creates a new document and navigates to it
   */
  const createNewDocument = useCallback(async () => {
    if (isCreatingDocument) return;
    
    setIsCreatingDocument(true);
    
    try {
      // Generate random IDs for the new chat and document
      const newChatId = generateUUID();
      const newDocId = generateUUID();
      
      console.log('[Document] Creating new document:', {
        chatId: newChatId,
        documentId: newDocId
      });
      
      // Set artifact state first for immediate feedback
      setArtifact(curr => ({
        ...curr,
        documentId: newDocId,
        title: 'Untitled Document',
        content: '',
        status: 'idle',
        kind: 'text',
        isVisible: true
      }));
      
      // Close mobile sidebar if it's open
      if (openMobile) {
        setOpenMobile(false);
      }
      
      // Create a new chat first to ensure it exists before navigating
      const chatResponse = await fetch('/api/chat/new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: newChatId,
          title: 'New Document Chat',
        }),
      });
      
      if (!chatResponse.ok) {
        const chatErrorData = await chatResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Document] Failed to create chat:', chatResponse.status, chatErrorData);
        throw new Error(`Failed to create chat: ${chatResponse.status} ${chatErrorData.error || ''}`);
      }
      
      // Create a new document
      const docResponse = await fetch('/api/document', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: newDocId,
          chatId: newChatId,
          title: 'Untitled Document',
          content: '',
          kind: 'text',
        }),
      });
      
      if (!docResponse.ok) {
        const docErrorData = await docResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Document] Failed to create document:', docResponse.status, docErrorData);
        throw new Error(`Failed to create document: ${docResponse.status} ${docErrorData.error || ''}`);
      }
      
      // Only navigate after both resources are created successfully
      router.push(`/chat/${newChatId}?document=${newDocId}`);
      
      // Show success toast after navigation has likely started
      setTimeout(() => {
        toast.success('Document created', { 
          id: 'document-created',
          duration: 2000 
        });
      }, 500);
      
    } catch (error) {
      console.error('[Document] Error creating document:', error);
      
      // Try to recover - navigate to regular chat if document creation fails
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
  }, [router, setArtifact, openMobile, setOpenMobile, isCreatingDocument]);

  /**
   * Renames an existing document
   */
  const renameDocument = useCallback(async (newTitle: string) => {
    if (!artifact.documentId || artifact.documentId === 'init') {
      toast.error('No document to rename');
      return;
    }

    try {
      setIsRenamingDocument(true);
      
      // Validate the title
      if (!newTitle || !newTitle.trim()) {
        toast.error('Document title cannot be empty');
        return;
      }
      
      // Log the request details for debugging
      console.log('[DocumentUtils] Renaming document:', {
        id: artifact.documentId,
        oldTitle: artifact.title,
        newTitle: newTitle
      });
      
      const response = await fetch(`/api/document?id=${artifact.documentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: newTitle }),
      });

      // Get response data whether successful or not for better error handling
      const responseData = await response.json().catch(() => null);
      
      if (!response.ok) {
        console.error('[DocumentUtils] Rename error details:', {
          status: response.status,
          statusText: response.statusText,
          data: responseData
        });
        throw new Error(`Failed to rename document: ${response.status} ${response.statusText}`);
      }

      // Update the artifact state with the new title
      setArtifact(curr => ({
        ...curr,
        title: newTitle
      }));

      // Force refresh all document lists in the UI
      // This ensures the sidebar and other components show the updated title
      setTimeout(() => {
        // Refresh documents list in sidebar
        window.dispatchEvent(new CustomEvent('document-renamed', { 
          detail: { 
            documentId: artifact.documentId, 
            newTitle 
          } 
        }));
        
        // Mutate SWR cache to refresh all document lists
        const mutator = (window as any).__SWR_MUTATE_FN;
        if (typeof mutator === 'function') {
          mutator('/api/documents');
          mutator('/api/history');
        }
      }, 100);

      toast.success('Document renamed');
      return true;
    } catch (error) {
      console.error('[DocumentUtils] Error renaming document:', error);
      toast.error('Failed to rename document');
      return false;
    } finally {
      setIsRenamingDocument(false);
    }
  }, [artifact.documentId, artifact.title, setArtifact]);

  /**
   * Creates a new chat for an existing document
   */
  const createNewChatForDocument = useCallback(async () => {
    if (isCreatingChat || !artifact.documentId || artifact.documentId === 'init') return;
    
    setIsCreatingChat(true);
    const toastId = `creating-chat-for-doc-${artifact.documentId}`;
    toast.loading('Creating new chat for this document...', { id: toastId });
    
    const newChatId = generateUUID();
    const documentId = artifact.documentId;
    
    try {
      // Create a new chat first
      const chatResponse = await fetch('/api/chat/new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: newChatId,
          title: artifact.title || 'Document Chat',
        }),
      });
      
      if (!chatResponse.ok) {
        throw new Error('Failed to create new chat');
      }
      
      // Update document with the new chat ID (this creates a new version with the new chatId)
      const docResponse = await fetch(`/api/document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: documentId,
          chatId: newChatId,
          title: artifact.title,
          content: artifact.content,
          kind: artifact.kind
        }),
      });
      
      if (!docResponse.ok) {
        throw new Error('Failed to update document with new chat');
      }
      
      // Navigate after resources are created successfully
      router.push(`/chat/${newChatId}?document=${documentId}`);
      
      toast.success('New chat created', {
        id: toastId,
        description: 'Document has been linked to a new chat',
        duration: 3000
      });
    } catch (error) {
      console.error('Error creating new chat for document:', error);
      toast.error('Failed to create new chat', { id: toastId });
    } finally {
      setTimeout(() => {
        setIsCreatingChat(false);
      }, 500);
    }
  }, [artifact, router, isCreatingChat]);

  /**
   * Prepare document setup - just sets UI state without creating the document yet
   */
  const prepareNewDocument = useCallback(() => {
    // Only set up the UI state for a new document, don't create it in the database yet
    setArtifact(curr => ({
      ...curr,
      documentId: 'init',
      title: 'Untitled Document',
      content: '',
      status: 'idle',
      kind: 'text',
      isVisible: true
    }));
    
    setIsPendingDocumentSetup(true);
    
    // Close mobile sidebar if open
    if (openMobile) {
      setOpenMobile(false);
    }
  }, [setArtifact, openMobile, setOpenMobile]);

  /**
   * Create a new document when user starts editing or names it
   */
  const createDocument = useCallback(async (options: {
    title?: string;
    content?: string;
    kind?: ArtifactKind;
    chatId?: string | null;
    navigateAfterCreate?: boolean;
  } = {}) => {
    if (isCreatingDocument) return null;
    
    try {
      setIsCreatingDocument(true);
      
      const newDocId = generateUUID();
      const title = options.title || 'Untitled Document';
      
      // If we need a chat but don't have one, create it
      let chatId = options.chatId;
      if (!chatId && options.navigateAfterCreate !== false) {
        const newChatId = generateUUID();
        
        // Create a new chat
        const chatResponse = await fetch('/api/chat/new', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: newChatId,
            title: 'New Chat',
          }),
        });
        
        if (!chatResponse.ok) {
          throw new Error('Failed to create new chat');
        }
        
        chatId = newChatId;
      }
      
      // Update artifact state for immediate feedback
      setArtifact(curr => ({
        ...curr,
        documentId: newDocId,
        title,
        content: options.content || '',
        kind: (options.kind || 'text') as ArtifactKind,
        status: 'idle',
        isVisible: true
      }));
      
      // Create document in database
      const docResponse = await fetch('/api/document', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: newDocId,
          chatId,
          title,
          content: options.content || '',
          kind: options.kind || 'text',
        }),
      });
      
      if (!docResponse.ok) {
        const errorData = await docResponse.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Failed to create document: ${errorData.error || 'Server error'}`);
      }
      
      const data = await docResponse.json();
      
      // Navigate if requested and we have a chat ID
      if (options.navigateAfterCreate !== false && chatId) {
        router.push(`/chat/${chatId}?document=${newDocId}`);
      }
      
      // Reset the pending flag
      setIsPendingDocumentSetup(false);
      
      return data.id;
    } catch (error) {
      console.error('[DocumentUtils] Error creating document:', error);
      toast.error('Failed to create document');
      return null;
    } finally {
      setTimeout(() => {
        setIsCreatingDocument(false);
      }, 500);
    }
  }, [router, setArtifact, isCreatingDocument]);
  
  /**
   * Delete a document
   */
  const deleteDocument = useCallback(async (documentId: string, options: {
    redirectUrl?: string;
  } = {}) => {
    try {
      setIsDeletingDocument(true);
      
      const response = await fetch(`/api/document?id=${documentId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete document');
      }
      
      // If the deleted document is the current one, reset artifact and navigate
      if (documentId === artifact.documentId) {
        setArtifact(curr => ({
          ...curr,
          documentId: 'init',
          title: 'Untitled Document',
          content: '',
          status: 'idle',
          kind: 'text' as ArtifactKind,
        }));
        
        // Navigate to redirectUrl if provided, otherwise to home
        if (options.redirectUrl) {
          router.push(options.redirectUrl);
        } else {
          router.push('/');
        }
      }
      // Don't navigate if we're not deleting the current document
      
      toast.success('Document deleted');
      return true;
    } catch (error) {
      console.error('[DocumentUtils] Error deleting document:', error);
      toast.error('Failed to delete document');
      return false;
    } finally {
      setIsDeletingDocument(false);
    }
  }, [artifact.documentId, router, setArtifact]);
  
  /**
   * Load a specific document
   */
  const loadDocument = useCallback(async (documentId: string, options: {
    navigateAfterLoad?: boolean;
    chatId?: string;
  } = {}) => {
    try {
      console.log('[DocumentUtils] Loading document:', documentId);
      
      // Validate document ID
      if (!documentId || documentId === 'init' || documentId === 'undefined' || documentId === 'null') {
        console.error('[DocumentUtils] Invalid document ID:', documentId);
        toast.error('Invalid document ID');
        return null;
      }
      
      // Track request to handle potential race conditions
      const requestTimestamp = Date.now();
      (window as any).__LAST_DOCUMENT_REQUEST = requestTimestamp;
      
      // Check cache first for immediate content display
      const documentCache = (window as any).__DOCUMENT_CACHE;
      if (documentCache && documentCache.has(documentId)) {
        const cachedDoc = documentCache.get(documentId);
        console.log('[DocumentUtils] Using cached document:', documentId);
        
        // Update artifact content from cache immediately for faster display
        setArtifact(curr => ({
          ...curr,
          documentId: cachedDoc.id,
          title: cachedDoc.title,
          content: cachedDoc.content || '',
          kind: cachedDoc.kind as ArtifactKind,
          status: 'streaming' // Set to streaming to show we're still loading fresh content
        }));
      } else {
        // No cache - set loading state
        setArtifact(curr => ({
          ...curr,
          status: 'streaming' // Use streaming status to indicate loading
        }));
      }
      
      const response = await fetch(`/api/document?id=${documentId}`);
      
      // Check if this is still the latest request before continuing
      if ((window as any).__LAST_DOCUMENT_REQUEST !== requestTimestamp) {
        console.log('[DocumentUtils] Aborting stale document load:', documentId);
        return null; // Don't process older requests
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('[DocumentUtils] Error fetching document:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
      }
      
      const documents = await response.json();
      
      if (!documents || documents.length === 0) {
        console.error('[DocumentUtils] No documents returned for ID:', documentId);
        toast.error('Document not found');
        return null;
      }
      
      const document = documents[documents.length - 1]; // Get the latest version
      console.log('[DocumentUtils] Document loaded successfully:', document.id);
      
      // Check again if this is still the latest request
      if ((window as any).__LAST_DOCUMENT_REQUEST !== requestTimestamp) {
        console.log('[DocumentUtils] Discarding stale document content:', documentId);
        return null;
      }
      
      // Update cache for future rapid switching
      if (documentCache && document) {
        documentCache.set(documentId, document);
      }
      
      // Update artifact state before navigation to ensure content is available
      setArtifact(curr => ({
        ...curr,
        documentId: document.id,
        title: document.title,
        content: document.content || '',
        kind: document.kind as ArtifactKind,
        status: 'idle',
        isVisible: true,
      }));
      
      // Use a small delay to ensure state updates are processed before navigation
      // This prevents the race condition causing empty content
      if (options.navigateAfterLoad !== false) {
        const chatId = options.chatId || document.chatId;
        const targetUrl = chatId 
          ? `/chat/${chatId}?document=${document.id}`
          : `/chat?document=${document.id}`;
          
        console.log('[DocumentUtils] Navigating to:', targetUrl);
        
        // Small delay to ensure state updates are processed before navigation
        setTimeout(() => {
          router.push(targetUrl);
        }, 50);
      }
      
      return document;
    } catch (error) {
      console.error('[DocumentUtils] Error loading document:', error);
      toast.error('Failed to load document');
      
      // Reset loading state on error
      setArtifact(curr => ({
        ...curr,
        status: 'idle'
      }));
      
      return null;
    }
  }, [router, setArtifact]);

  return {
    handleNewChat,
    createNewDocument,
    renameDocument,
    createNewChatForDocument,
    isCreatingChat,
    isCreatingDocument,
    isRenamingDocument,
    prepareNewDocument,
    createDocument,
    isDeletingDocument,
    deleteDocument,
    loadDocument,
    isPendingDocumentSetup
  };
} 