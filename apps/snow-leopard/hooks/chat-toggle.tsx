"use client";

import { useContext } from "react";
import { ChatboxToggleContext } from "@/providers/chatbox-toggle";

export function useChatToggle(): { isOpen: boolean; setIsOpen: (isOpen: boolean) => void } {
  const { isOpen, setIsOpen } = useContext(ChatboxToggleContext);
  return { isOpen, setIsOpen };
}