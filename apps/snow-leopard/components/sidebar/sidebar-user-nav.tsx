'use client';
import { ChevronUp, Loader2 } from 'lucide-react';
import { T, useGT, Branch, Var } from 'gt-next';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import { useTheme } from 'next-themes';
import { toast } from '@/components/toast';
import type { ClientUser as User } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Paywall } from '@/components/paywall';

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

export function SidebarUserNav({ user }: { user: User | null }) {
  const t = useGT();
  const { setTheme, theme } = useTheme();
  const router = useRouter();

  const [isSignOutLoading, setIsSignOutLoading] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

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
        const res = await fetch('/api/user/subscription-status');
        const result = await res.json();
        if (!isMounted) return;
        if (!res.ok) {
          throw new Error(result.error || 'Failed to load subscription info.');
        }
        if (result.hasActiveSubscription) {
          setSubscription({
            id: '',
            plan: 'pro',
            status: 'active',
            trialEnd: null,
            periodEnd: null,
            cancelAtPeriodEnd: false,
          });
        } else {
          setSubscription(null);
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Error fetching subscription:', err);
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

  let statusText = t('No active plan');
  let planName = t('Free');
  let ctaText = t('Subscribe');
  let ctaAction = () => setIsPaywallOpen(true);
  let ctaLoading = isSubscriptionLoading;

  if (isSubscriptionLoading) {
    statusText = t('Loading...');
    planName = t('Checking');
  } else if (subscriptionError) {
    statusText = t('Error loading status');
    planName = t('Error');
  } else if (subscription) {
    planName = formatPlanName(subscription.plan);
    const now = new Date();
    if (subscription.status === 'trialing') {
      const trialEndDate = subscription.trialEnd || subscription.periodEnd;
      const ends = new Date(trialEndDate || '').getTime();
      if (ends > now.getTime()) {
        statusText = t('Trial ends {date}', { date: formatDate(trialEndDate) });
        ctaText = t('Upgrade');
        ctaAction = () => setIsPaywallOpen(true);
        ctaLoading = isSubscriptionLoading;
      } else {
        statusText = t('Trial ended {date}', { date: formatDate(trialEndDate) });
        ctaText = t('Subscribe');
        ctaAction = () => setIsPaywallOpen(true);
        ctaLoading = isSubscriptionLoading;
      }
    } else if (subscription.status === 'active') {
      if (subscription.cancelAtPeriodEnd) {
        statusText = t('Cancels {date}', { date: formatDate(subscription.periodEnd) });
      } else {
        statusText = t('Renews {date}', { date: formatDate(subscription.periodEnd) });
      }
      ctaText = t('Manage');
      ctaAction = handleManageBilling;
      ctaLoading = isBillingLoading;
    }
  }

  const isLoading = isSignOutLoading || isBillingLoading || isSubscriptionLoading;

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={isLoading}>
              <SidebarMenuButton className="border border-r data-[state=open]:border-border text-accent-foreground data-[state=open]:text-sidebar-accent-foreground h-10">
                <span className="truncate">{user.email ?? 'User'}</span>
                <ChevronUp className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" className="w-[--radix-popper-anchor-width]">
              {isStripeEnabled && (
                <>
                  <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    <T>Subscription</T>
                  </DropdownMenuLabel>
                  <div className="px-2 py-1.5 text-sm space-y-1">
                    <p className="font-medium">{planName}</p>
                    <p className="text-xs text-muted-foreground">{statusText}</p>
                    <button
                      onClick={ctaAction}
                      disabled={ctaLoading}
                      className="mt-2 text-sm font-medium text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {ctaLoading ? <Loader2 className="h-4 w-4 animate-spin inline-block mr-1 text-muted-foreground" /> : <T><Var>{ctaText}</Var></T>}
                    </button>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                disabled={isLoading}
              >
                <T>
                  <Branch 
                    branch={theme} 
                    light={<>Toggle dark mode</>} 
                    dark={<>Toggle light mode</>}
                  >
                    Toggle theme mode
                  </Branch>
                </T>
              </DropdownMenuItem>
              {!isStripeEnabled && <DropdownMenuSeparator />}

              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={handleSignOut}
                disabled={isLoading}
              >
                {isSignOutLoading ? (
                  <T><><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing out...</></T>
                ) : (
                   <T>Sign out</T>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <Paywall isOpen={isPaywallOpen} onOpenChange={setIsPaywallOpen} />
    </>
  );
}
