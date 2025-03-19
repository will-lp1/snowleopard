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
  const { setOpenMobile } = useSidebar();
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
   * Creates a new document and associated chat, then navigates to it
   */
  const createNewDocument = async () => {
    if (isCreatingDocument) return;
    setIsCreatingDocument(true);
    
    toast.loading('Creating new document...');
    
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
      
      // Reset artifact state BEFORE navigation
      setArtifact({
        documentId: newDocId,
        title: 'New Document',
        kind: 'text',
        isVisible: true,
        status: 'idle',
        content: '',
        boundingBox: { top: 0, left: 0, width: 0, height: 0 } // Default bounding box
      });
      
      // Close mobile sidebar if open
      setOpenMobile(false);
      
      // Navigate to the new chat with the new document
      router.push(`/chat/${newChatId}?document=${newDocId}`);
      
      toast.success('New document created', {
        description: 'Document has been linked to a new chat',
        duration: 3000
      });
    } catch (error) {
      console.error('Error creating new document:', error);
      toast.error('Failed to create new document');
    } finally {
      setIsCreatingDocument(false);
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
    toast.loading('Creating new chat for this document...');
    
    const newChatId = generateUUID();
    
    try {
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
          id: artifact.documentId,
          chatId: newChatId,
          title: artifact.title,
          content: artifact.content,
          kind: artifact.kind
        }),
      });
      
      if (!docResponse.ok) {
        throw new Error('Failed to update document with new chat');
      }
      
      // Navigate to the new chat with the existing document
      router.push(`/chat/${newChatId}?document=${artifact.documentId}`);
      
      toast.success('New chat created', {
        description: 'Document has been linked to a new chat',
        duration: 3000
      });
    } catch (error) {
      console.error('Error creating new chat for document:', error);
      toast.error('Failed to create new chat');
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