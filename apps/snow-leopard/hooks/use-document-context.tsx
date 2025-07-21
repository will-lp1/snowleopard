'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ArtifactKind } from '@/components/artifact';
import { useParams, useRouter } from 'next/navigation';
import { useGT } from 'gt-next';

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
  documentTitle: 'New Document', // This will be internationalized in the provider
  documentContent: '',
  documentKind: 'text',
  isLoading: false,
  updateDocument: () => {},
});

export function DocumentProvider({ children }: { children: ReactNode }) {
  const t = useGT();
  const [documentId, setDocumentId] = useState<string>('init');
  const [documentTitle, setDocumentTitle] = useState<string>(t('New Document'));
  const [documentContent, setDocumentContent] = useState<string>('');
  const [documentKind, setDocumentKind] = useState<ArtifactKind>('text');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    const docIdFromParams = params?.id as string | undefined;

    const isValidId = (id: string | undefined): id is string => 
      !!id && id !== 'undefined' && id !== 'null' && id !== 'init';

    if (isValidId(docIdFromParams)) {
      if (docIdFromParams !== documentId) { 
        setDocumentId(docIdFromParams);
        setDocumentTitle(t('Loading...'));
        setDocumentContent('');
        setDocumentKind('text');
        setIsLoading(true);
        
        fetch(`/api/document?id=${docIdFromParams}`)
          .then(response => {
            if (!response.ok) {
              if (response.status === 404) {
                 console.warn(`Document ${docIdFromParams} not found.`);
                 setDocumentId('init');
                 setDocumentTitle(t('Not Found'));
                 setDocumentContent('');
                 setDocumentKind('text');
              } else {
                throw new Error(`Failed to fetch document: ${response.statusText}`);
              }
              return null;
            }
            return response.json();
          })
          .then(documents => {
            if (documents && documents.length > 0) {
              const doc = documents[documents.length - 1]; 
              setDocumentTitle(doc.title || t('Untitled Document'));
              setDocumentContent(doc.content || '');
              setDocumentKind((doc.kind as ArtifactKind) || 'text');
            } else if (documentId !== 'init' && documents !== null) {
               console.warn(`No document versions found for ID: ${docIdFromParams}, resetting.`);
               setDocumentId('init');
               setDocumentTitle(t('New Document'));
               setDocumentContent('');
               setDocumentKind('text');
            }
          })
          .catch(error => {
            console.error('[DocumentContext] Error fetching document:', error);
            setDocumentId('init');
            setDocumentTitle(t('Error Loading'));
            setDocumentContent('');
            setDocumentKind('text');
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    } else {
       if (documentId !== 'init') {
          setDocumentId('init');
          setDocumentTitle(t('New Document'));
          setDocumentContent('');
          setDocumentKind('text');
          setIsLoading(false);
       }
    }
  }, [params?.id, documentId, t]);

  const updateDocument = (id: string, title: string, content: string, kind: ArtifactKind) => {
    setDocumentId(id);
    setDocumentTitle(title);
    setDocumentContent(content);
    setDocumentKind(kind);
  };

  useEffect(() => {
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