'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useArtifact } from './use-artifact';
import { toast } from 'sonner';
import { generateUUID } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import useSWR from 'swr';

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
      
      // Navigate to new chat page
      router.push('/chat');
      router.refresh();
    } catch (error) {
      console.error('Error creating new chat:', error);
      toast.error('Failed to create new chat');
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
        title: 'Document',
        content: '',
        status: 'idle',
        kind: 'text',
        isVisible: true
      }));
      
      // Close mobile sidebar if it's open
      if (openMobile) {
        setOpenMobile(false);
      }
      
      // Start navigation early for better perceived performance
      router.push(`/chat/${newChatId}?document=${newDocId}`);
      
      try {
        // Create a new chat
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
        
        toast.success('Document created', { 
          id: 'document-created',
          duration: 2000 
        });
        
      } catch (error) {
        console.error('[Document] Error creating document:', error);
        
        // Try to recover - navigate to regular chat if document creation fails
        toast.error('Failed to create document', {
          description: error instanceof Error ? error.message : String(error),
          duration: 5000
        });
        
        // Navigate to the regular chat if we failed to create document
        router.push(`/chat/${newChatId}`);
      }
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
    
    setIsRenamingDocument(true);
    
    try {
      // Update the document title
      const response = await fetch(`/api/document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: artifact.documentId,
          title: newTitle,
          content: artifact.content,
          kind: artifact.kind
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to rename document');
      }
      
      // Update artifact state with new title
      setArtifact(current => ({
        ...current,
        title: newTitle
      }));
      
      toast.success('Document renamed', {
        duration: 2000
      });
    } catch (error) {
      console.error('Error renaming document:', error);
      toast.error('Failed to rename document');
    } finally {
      setIsRenamingDocument(false);
    }
  };

  /**
   * Creates a new chat for an existing document
   */
  const createNewChatForDocument = async () => {
    if (isCreatingChat || !artifact.documentId || artifact.documentId === 'init') return;
    
    setIsCreatingChat(true);
    const toastId = `creating-chat-for-doc-${artifact.documentId}`;
    toast.loading('Creating new chat for this document...', { id: toastId });
    
    const newChatId = generateUUID();
    const documentId = artifact.documentId;
    
    try {
      // Navigate early for better perceived performance 
      const urlWithParams = `/chat/${newChatId}?document=${documentId}`;
      router.push(urlWithParams);
      
      // Create a new chat
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
      
      toast.success('New chat created', {
        id: toastId,
        description: 'Document has been linked to a new chat',
        duration: 3000
      });
    } catch (error) {
      console.error('Error creating new chat for document:', error);
      toast.error('Failed to create new chat', { id: toastId });
    } finally {
      setIsCreatingChat(false);
    }
  };

  return {
    handleNewChat,
    createNewDocument,
    renameDocument,
    createNewChatForDocument,
    isCreatingChat,
    isCreatingDocument,
    isRenamingDocument
  };
} 