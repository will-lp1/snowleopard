"use client";

import { createContext, useContext, ReactNode } from "react";

interface LandingContextType {
  hasSession: boolean;
  onBeginClick: () => void;
}

const LandingContext = createContext<LandingContextType | undefined>(undefined);

export function useLandingContext() {
  const context = useContext(LandingContext);
  if (context === undefined) {
    throw new Error('useLandingContext must be used within a LandingProvider');
  }
  return context;
}

interface LandingProviderProps {
  children: ReactNode;
  value: LandingContextType;
}

export function LandingProvider({ children, value }: LandingProviderProps) {
  return (
    <LandingContext.Provider value={value}>
      {children}
    </LandingContext.Provider>
  );
}
