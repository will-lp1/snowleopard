'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/toast';
import { T, useGT } from 'gt-next';
import Image from 'next/image';

interface OnboardProps {
  isOpen: boolean;
  onOpenChange?: (open: boolean) => void;
  required?: boolean;
}

export function Onboard({ isOpen, onOpenChange, required = false }: OnboardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const t = useGT();

  const handleStartTrial = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/user/start-trial', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast({ type: 'error', description: data.error || t('Could not start trial.') });
      } else if (data.alreadyInTrial) {
        toast({ type: 'info', description: t('You already have an active trial.') });
      } else if (data.alreadyActive) {
        toast({ type: 'info', description: t('You already have an active subscription.') });
      } else {
        toast({ type: 'success', description: t('Free trial started! Enjoy.') });
        onOpenChange?.(false);
        await mutate('/api/user/subscription-status');
        router.refresh();
      }
    } catch (err) {
      console.error('Start trial error:', err);
      toast({ type: 'error', description: t('Unexpected error starting trial.') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (required && !open) return;
    onOpenChange?.(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl p-0 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="relative h-64 md:h-full overflow-hidden">
            <Image
              src="/images/snowleopards.jpg"
              alt="Snow Leopard"
              layout="fill"
              objectFit="cover"
              className="filter grayscale contrast-110 brightness-90"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent md:bg-gradient-to-r md:from-black/40 md:via-transparent"></div>
            <div className="absolute top-8 left-8 z-10">
              <T>
                <h1 className="text-lg font-normal text-white/80">snow leopard</h1>
              </T>
            </div>
          </div>
          <div className="p-8 md:p-10 flex flex-col relative">
            <DialogHeader className="mb-4 text-left">
              <T>
                <DialogTitle className="text-2xl sm:text-3xl font-semibold">Start Your Free Trial</DialogTitle>
              </T>
              <T>
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  Try Snow Leopard free for 3 days. No credit card required.
                </DialogDescription>
              </T>
            </DialogHeader>
            {/* Features list removed for simplicity */}
            <DialogFooter className="mt-8 pt-4 border-t flex items-center">
              <Button
                onClick={handleStartTrial}
                disabled={isLoading}
                className="w-full px-5 py-2 rounded-full bg-card text-card-foreground border border-border shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-muted transition-colors"
              >
                {isLoading ? t('Starting...') : t('Start Trial')}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 