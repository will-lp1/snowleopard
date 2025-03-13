'use client';

import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

interface SubmitButtonProps {
  isSuccessful: boolean;
  children: React.ReactNode;
}

export function SubmitButton({ isSuccessful, children }: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      className="w-full"
      disabled={isSuccessful}
    >
      {isSuccessful ? (
        <>
          <Check className="mr-2 h-4 w-4" />
          Done
        </>
      ) : (
        children
      )}
    </Button>
  );
}
