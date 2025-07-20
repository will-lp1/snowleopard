'use client';

import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { T } from 'gt-next';
import { LoaderIcon } from './icons';

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
          <Check className="mr-2 size-4" />
          <T>Done</T>
        </>
      ) : (
        children
      )}
    </Button>
  );
}
