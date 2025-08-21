"use client";

import useSWR from "swr";
import { useCallback, useMemo } from "react";

export interface CurrentDocument {
  documentId: string;
  title: string;
  content: string;
  status: "idle" | "loading" | "streaming";
}

export const initialDocument: CurrentDocument = {
  documentId: "init",
  title: "",
  content: "",
  status: "idle",
};

export function useDocument() {
  const { data, mutate } = useSWR<CurrentDocument>("current-document", null, {
    fallbackData: initialDocument,
  });

  const document = data ?? initialDocument;

  const setDocument = useCallback(
    (update: CurrentDocument | ((prev: CurrentDocument) => CurrentDocument)) => {
      mutate(prev => (typeof update === "function" ? (update as any)(prev ?? initialDocument) : update), false);
    },
    [mutate]
  );

  return useMemo(() => ({ document, setDocument }), [document, setDocument]);
}