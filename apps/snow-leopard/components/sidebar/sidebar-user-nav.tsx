'use client';
import { ChevronUp, Loader2, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import { useTheme } from 'next-themes';
import { toast } from '@/components/toast';
import type { ClientUser as User } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

type Subscription = {
  id: string;
  plan: string;
  status: string;
  trialEnd?: Date | string | null;
  periodEnd?: Date | string | null;
  cancelAtPeriodEnd?: boolean;
};

function formatDate(dateString: string | Date | undefined | null): string {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (e) {
    console.error("Error formatting date:", e);
    return 'Invalid Date';
  }
}

function formatPlanName(planName: string | undefined | null): string {
  if (!planName) return 'Unknown Plan';
  return planName.charAt(0).toUpperCase() + planName.slice(1);
}

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export function SidebarUserNav({ user }: { user: User | null }) {
  const { setTheme, theme } = useTheme();
  const router = useRouter();

  const [isSignOutLoading, setIsSignOutLoading] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(false);

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  const isStripeEnabled = process.env.NEXT_PUBLIC_STRIPE_ENABLED === 'true';

  useEffect(() => {
    if (!isStripeEnabled || !user) {
       setIsSubscriptionLoading(false);
      return;
    }

    let isMounted = true;
    setIsSubscriptionLoading(true);
    setSubscriptionError(null);

    const fetchSubscription = async () => {
      try {
        const { data, error: fetchError } = await authClient.subscription.list();
        if (!isMounted) return;
        if (fetchError) throw new Error(fetchError.message || 'Failed to fetch subscription data.');

        const activeSub = data?.find(sub => sub.status === 'active' || sub.status === 'trialing') as Subscription | undefined;
        setSubscription(activeSub || null);
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Error fetching subscription:", err);
        setSubscriptionError(err.message || 'Could not load subscription info.');
        setSubscription(null);
      } finally {
        if (isMounted) setIsSubscriptionLoading(false);
      }
    };

    fetchSubscription();
    return () => { isMounted = false; };
  }, [user, isStripeEnabled]);

  const handleSignOut = async () => {
    setIsSignOutLoading(true);
    await authClient.signOut({
    }, {
      onRequest: () => {
          setIsSignOutLoading(true); 
      },
      onSuccess: () => {
          router.push('/login');
          router.refresh(); 
      },
      onError: (ctx) => {
          setIsSignOutLoading(false);
          console.error('Error signing out:', ctx.error);
          toast({
            type: 'error',
            description: ctx.error.message || 'Failed to sign out.'
          });
      }
    });
  };

  const handleManageBilling = async () => {
    if (isBillingLoading || isSubscriptionLoading || subscriptionError || !subscription) return;
    setIsBillingLoading(true);
    try {
      const { error: cancelError } = await authClient.subscription.cancel({
        returnUrl: window.location.href,
      });
      if (cancelError) throw new Error(cancelError.message || 'Failed to redirect to billing portal.');
    } catch (err: any) {
      console.error("handleManageBilling error:", err);
      toast({ type: 'error', description: err.message || 'Could not open billing portal.' });
      setIsBillingLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  let statusText = 'No active plan';
  let planName = 'Free';
  let canManage = false;

  if (isSubscriptionLoading) {
    statusText = 'Loading...';
    planName = 'Checking';
  } else if (subscriptionError) {
    statusText = 'Error loading status';
    planName = 'Error';
  } else if (subscription) {
    planName = formatPlanName(subscription.plan);
    canManage = true;
    if (subscription.status === 'trialing') {
      const trialEndDate = subscription.trialEnd || subscription.periodEnd;
      statusText = `Trial ends ${formatDate(trialEndDate)}`;
    } else if (subscription.status === 'active') {
      if (subscription.cancelAtPeriodEnd) {
        statusText = `Cancels ${formatDate(subscription.periodEnd)}`;
      } else {
        statusText = `Renews ${formatDate(subscription.periodEnd)}`;
      }
    }
  }

  const isLoading = isSignOutLoading || isBillingLoading || isSubscriptionLoading;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isLoading}>
            <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent bg-background data-[state=open]:text-sidebar-accent-foreground h-10">
              <span className="truncate">{user.email ?? 'User'}</span>
              <ChevronUp className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            className="w-[--radix-popper-anchor-width]"
            onCloseAutoFocus={(e) => {
              if (isBillingLoading) {
                e.preventDefault();
              }
            }}
          >
            {isStripeEnabled && (
              <>
                <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  Billing
                </DropdownMenuLabel>
                <div 
                  className={cn(
                     "flex items-center justify-between px-2 py-1.5 text-sm",
                     canManage && "cursor-pointer hover:bg-muted rounded-sm mx-1 px-1",
                     (isBillingLoading || isSubscriptionLoading) && "opacity-60 cursor-default pointer-events-none"
                  )}
                  onClick={canManage && !isBillingLoading && !isSubscriptionLoading ? handleManageBilling : undefined}
                  role={canManage ? "button" : undefined}
                  tabIndex={canManage ? 0 : -1}
                  aria-disabled={isBillingLoading || isSubscriptionLoading || !canManage}
                  onKeyDown={(e) => { 
                     if (canManage && (e.key === 'Enter' || e.key === ' ')) {
                       handleManageBilling();
                     }
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium capitalize text-foreground/90">{planName}</span>
                    <span className="text-muted-foreground text-xs">{statusText}</span>
                  </div>
                  {canManage && !isBillingLoading && !isSubscriptionLoading && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-2" />
                  )}
                  {isBillingLoading && (
                     <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />
                  )}
                </div>
                <DropdownMenuSeparator />
              </>
            )}

            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              disabled={isLoading}
            >
              {`Toggle ${theme === 'light' ? 'dark' : 'light'} mode`}
            </DropdownMenuItem>
            
            {!isStripeEnabled && <DropdownMenuSeparator />}

            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={handleSignOut}
              disabled={isLoading}
            >
              {isSignOutLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing out...</>
              ) : (
                 'Sign out'
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
