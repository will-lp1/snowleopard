'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ArtifactKind } from '@/components/artifact';
import { useRouter } from 'next/navigation';

interface DocumentContextType {
  documentId: string;
  documentTitle: string;
  documentContent: string;
  documentKind: ArtifactKind;
  isLoading: boolean;
  updateDocument: (id: string, title: string, content: string, kind: ArtifactKind) => void;
}

const DocumentContext = createContext<DocumentContextType>({
  documentId: 'init',
  documentTitle: 'New Document',
  documentContent: '',
  documentKind: 'text',
  isLoading: false,
  updateDocument: () => {},
});

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documentId, setDocumentId] = useState<string>('init');
  const [documentTitle, setDocumentTitle] = useState<string>('New Document');
  const [documentContent, setDocumentContent] = useState<string>('');
  const [documentKind, setDocumentKind] = useState<ArtifactKind>('text');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const docIdFromUrl = url.searchParams.get('document');

      if (docIdFromUrl && docIdFromUrl !== 'undefined' && docIdFromUrl !== 'null' && docIdFromUrl !== 'init') {
        if (docIdFromUrl !== documentId) { 
          setDocumentId(docIdFromUrl);
          setIsLoading(true);
          
          if (!(window as any).__DOCUMENT_CACHE) {
            (window as any).__DOCUMENT_CACHE = new Map();
          }
          const documentCache = (window as any).__DOCUMENT_CACHE;
          
          if (documentCache.has(docIdFromUrl)) {
            const cachedDoc = documentCache.get(docIdFromUrl);
            setDocumentTitle(cachedDoc.title || 'Untitled Document');
            setDocumentContent(cachedDoc.content || '');
            setDocumentKind((cachedDoc.kind as ArtifactKind) || 'text');
            setIsLoading(false);
          } else {
            fetch(`/api/document?id=${docIdFromUrl}`)
              .then(response => response.json())
              .then(documents => {
                if (documents && documents.length > 0) {
                  const doc = documents[documents.length - 1];
                  setDocumentTitle(doc.title || 'Untitled Document');
                  setDocumentContent(doc.content || '');
                  setDocumentKind((doc.kind as ArtifactKind) || 'text');
                  documentCache.set(docIdFromUrl, doc);
                }
                setIsLoading(false);
              })
              .catch(error => {
                console.error('Error fetching document:', error);
                setIsLoading(false);
              });
          }
        }
      } else {
         if (documentId !== 'init') {
            setDocumentId('init');
            setDocumentTitle('New Document');
            setDocumentContent('');
            setDocumentKind('text');
            setIsLoading(false);
         }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleRouteChange = () => {
      const url = new URL(window.location.href);
      const docIdFromUrl = url.searchParams.get('document');
      
      if (docIdFromUrl && docIdFromUrl !== 'undefined' && docIdFromUrl !== 'null' && docIdFromUrl !== 'init' && docIdFromUrl !== documentId) {
        setDocumentId(docIdFromUrl);
        setIsLoading(true);
        
        if (!(window as any).__DOCUMENT_CACHE) {
          (window as any).__DOCUMENT_CACHE = new Map();
        }
        const documentCache = (window as any).__DOCUMENT_CACHE;
        
        if (documentCache.has(docIdFromUrl)) {
          const cachedDoc = documentCache.get(docIdFromUrl);
          setDocumentTitle(cachedDoc.title || 'Untitled Document');
          setDocumentContent(cachedDoc.content || '');
          setDocumentKind((cachedDoc.kind as ArtifactKind) || 'text');
          setIsLoading(false);
          return;
        }
        
        fetch(`/api/document?id=${docIdFromUrl}`)
          .then(response => response.json())
          .then(documents => {
            if (documents && documents.length > 0) {
              const doc = documents[documents.length - 1];
              setDocumentTitle(doc.title || 'Untitled Document');
              setDocumentContent(doc.content || '');
              setDocumentKind((doc.kind as ArtifactKind) || 'text');
              documentCache.set(docIdFromUrl, doc);
            }
            setIsLoading(false);
          })
          .catch(error => {
            console.error('Error fetching document:', error);
            setIsLoading(false);
          });
      } else if (!docIdFromUrl || docIdFromUrl === 'init') {
        if (documentId !== 'init') {
            setDocumentId('init');
            setDocumentTitle('New Document');
            setDocumentContent('');
            setDocumentKind('text');
            setIsLoading(false);
        }
      }
    };

    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [documentId]);

  const updateDocument = (id: string, title: string, content: string, kind: ArtifactKind) => {
    setDocumentId(id);
    setDocumentTitle(title);
    setDocumentContent(content);
    setDocumentKind(kind);
    
    if (typeof window !== 'undefined' && id !== 'init') {
      if (!(window as any).__DOCUMENT_CACHE) {
        (window as any).__DOCUMENT_CACHE = new Map();
      }
      const documentCache = (window as any).__DOCUMENT_CACHE;
      documentCache.set(id, {
        id,
        title,
        content,
        kind,
        createdAt: new Date().toISOString(),
      });
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleDocumentRenamed = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (!customEvent.detail) return;
      
      const { documentId: renamedId, newTitle } = customEvent.detail;
      
      if (renamedId === documentId) {
        setDocumentTitle(newTitle);
      }
    };
    
    const handleDocumentContextUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (!customEvent.detail) return;
      
      const { documentId, documentTitle, documentContent, documentKind } = customEvent.detail;
      
      setDocumentId(documentId);
      setDocumentTitle(documentTitle);
      setDocumentContent(documentContent);
      setDocumentKind(documentKind);
    };
    
    window.addEventListener('document-renamed', handleDocumentRenamed);
    window.addEventListener('document-context-updated', handleDocumentContextUpdated);
    
    return () => {
      window.removeEventListener('document-renamed', handleDocumentRenamed);
      window.removeEventListener('document-context-updated', handleDocumentContextUpdated);
    };
  }, [documentId]);

  return (
    <DocumentContext.Provider 
      value={{
        documentId,
        documentTitle,
        documentContent,
        documentKind,
        isLoading,
        updateDocument,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocumentContext() {
  return useContext(DocumentContext);
} 