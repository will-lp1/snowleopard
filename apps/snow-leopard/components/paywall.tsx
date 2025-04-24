'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button'; 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { toast } from '@/components/toast';
import { CheckCircle, X, Loader2, Check } from 'lucide-react';
import { cn } from "@/lib/utils";

interface PaywallProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  required?: boolean;
}

// Define features for plans
const proFeatures = [
  "Unlimited documents",
  "Advanced AI models",
  "Priority support",
  "Team collaboration features (coming soon)",
  "Access to all future updates"
];

const freeFeatures = [
  "Up to 5 documents",
  "Standard AI model",
  "Basic support"
];

// Plan display data - separate from the config in lib/auth.ts
// This array defines how the plans are presented in the UI.
const displayPlans = [
  {
    displayName: 'Monthly',
    planName: 'snowleopard',
    price: '$8',
    billing: '/ month',
    trialText: 'Includes 3-day free trial',
    features: [
      'Unlimited Documents',
      'Advanced AI Features',
      'Priority Support',
      'Access all features',
    ],
    stripePriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'monthly_placeholder',
    annual: false,
  },
  {
    displayName: 'Annual',
    planName: 'snowleopard',
    price: '$49',
    billing: '/ year',
    trialText: 'Includes 3-day free trial',
    features: [
      'All Pro features',
      'Significant cost savings',
      'Priority support',
    ],
    stripePriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID || 'yearly_placeholder',
    annual: true,
  },
];

export function Paywall({ isOpen, onOpenChange, required = false }: PaywallProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const router = useRouter();

  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut({}, {
        onSuccess: () => {
          setIsSigningOut(false);
          router.push('/login');
          router.refresh();
          toast({ type: 'success', description: 'Signed out successfully.' });
        },
        onError: (ctx) => {
          setIsSigningOut(false);
          console.error('Error signing out:', ctx.error);
          toast({
            type: 'error',
            description: ctx.error.message || 'Failed to sign out.'
          });
        }
      });
    } catch (error) {
      setIsSigningOut(false);
      console.error('Sign out function error:', error);
      toast({ type: 'error', description: 'An unexpected error occurred during sign out.' });
    }
  };

  const handleUpgrade = async (planName: string, annual: boolean = false) => {
    const displayPlan = displayPlans.find(p => 
      p.planName.toLowerCase() === planName.toLowerCase() && 
      p.annual === annual
    );

    setIsLoading(true);
    setLoadingPlanId(displayPlan?.stripePriceId || null);
    console.log(`Initiating subscription upgrade to plan: ${planName}, annual: ${annual}`);

    try {
      const currentUrl = window.location.href;

      const { error } = await authClient.subscription.upgrade({
        plan: planName,
        annual: annual,
        successUrl: currentUrl,
        cancelUrl: currentUrl,
      });

      if (error) {
        console.error('Stripe Checkout Error (via Better Auth):', error);
        toast({ 
          type: 'error', 
          description: error.message || 'Failed to initiate checkout. Please try again.' 
        });
      }
    } catch (err) {
      console.error('Unexpected error during upgrade:', err);
      toast({ 
        type: 'error', 
        description: 'An unexpected error occurred. Please try again.'
      });
    } finally {
      setIsLoading(false);
      setLoadingPlanId(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (required && !open) {
      return;
    }
    onOpenChange(open);
  };
  
  const handleInteractOutside = (event: Event) => {
    if (required) {
      event.preventDefault();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl p-0 overflow-hidden"
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={(event) => {
          if (required) {
            event.preventDefault();
          }
        }}
        hideCloseButton={required}
      >
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
               <h1 className="text-lg font-normal text-white/80">
                  snow leopard
               </h1>
             </div>
          </div>

          <div className="p-8 md:p-10 flex flex-col">
            <div className="flex-grow">
              <DialogHeader className="mb-8 text-left">
                <DialogTitle className="text-2xl sm:text-3xl font-semibold">Join the Pack</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                {displayPlans.map((plan) => (
                  <div 
                    key={plan.displayName} 
                    className={cn(
                      "border rounded-lg p-5 flex flex-col gap-4 transition-colors h-48",
                    )}
                  >
                    <div className="flex-grow">
                      <div className="flex-grow">
                        <h4 className="font-semibold text-base mb-1">{plan.displayName}</h4>
                        <p className="text-lg font-bold text-foreground/90">{plan.price} <span className="text-sm font-normal text-muted-foreground">{plan.billing}</span></p>
                         {plan.trialText && (
                          <p className="text-xs text-green-600 mt-1 font-medium">{plan.trialText}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto">
                      <Button 
                        onClick={() => handleUpgrade(plan.planName, plan.annual)}
                        disabled={isLoading}
                        className="w-full px-5 py-2 rounded-full bg-card text-card-foreground border border-border shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-muted transition-colors text-sm shrink-0"
                        variant={"default"}
                      >
                        {isLoading && loadingPlanId === plan.stripePriceId ? (
                          <><Loader2 className="mr-2 size-4 animate-spin" /> Processing...</>
                        ) : plan.annual ? 'Start Annual' : 'Start Free Trial'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="mt-8 pt-4 flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                  * A plan is required to continue.
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline" 
                  size="icon"
                  className="size-7 opacity-70 hover:opacity-100"
                  asChild
                >
                  <Link href="https://github.com/will-lp1/snowleopard" target="_blank" rel="noopener noreferrer">
                    <Image src="/images/github-logo.png" alt="Github" width={14} height={14} />
                  </Link>
                </Button>

                <Button
                  variant="outline" 
                  size="icon"
                  className="size-7 opacity-70 hover:opacity-100"
                  asChild
                >
                  <Link href="https://discord.gg/yourinvite" target="_blank" rel="noopener noreferrer">
                    <Image src="/images/discord-logo.png" alt="Discord" width={24} height={24} />
                  </Link>
                </Button>

                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs text-muted-foreground hover:text-foreground h-7 px-2 ml-2"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                >
                  {isSigningOut ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                  Sign Out
                </Button>
              </div>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper function placeholder (replace with actual Stripe.js loading)
// async function getStripe() { 
//   // Load Stripe.js asynchronously
//   return null; 
// } 