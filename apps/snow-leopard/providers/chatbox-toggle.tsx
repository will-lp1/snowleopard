"use client";

import { createContext, useState } from "react";

export const ChatboxToggleContext = createContext<{
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}>({
  isOpen: true,
  setIsOpen: () => {},
});

export function ChatboxToggleProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  return (
    <ChatboxToggleContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </ChatboxToggleContext.Provider>
  );
}