import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type SuggestionLength = 'short' | 'medium' | 'long';

interface AiOptionsState {
  suggestionLength: SuggestionLength;
  customInstructions: string;
  setSuggestionLength: (length: SuggestionLength) => void;
  setCustomInstructions: (instructions: string) => void;
}

export const useAiOptions = create<AiOptionsState>()(
  persist(
    (set) => ({
      suggestionLength: 'medium', // Default value
      customInstructions: '', // Default value
      setSuggestionLength: (length) => set({ suggestionLength: length }),
      setCustomInstructions: (instructions) => set({ customInstructions: instructions }),
    }),
    {
      name: 'ai-options-storage', // Name for localStorage key
      storage: createJSONStorage(() => localStorage), // Use localStorage
    }
  )
); 