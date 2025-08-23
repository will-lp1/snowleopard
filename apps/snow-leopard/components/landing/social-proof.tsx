"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Crimson_Text } from "next/font/google";
import { useLandingContext } from "@/components/landing/landing-context";

const crimson = Crimson_Text({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

interface SocialProofProps {
  hasSession?: boolean;
  onBeginClick?: () => void;
}

export function SocialProof({ hasSession: propHasSession, onBeginClick: propOnBeginClick }: SocialProofProps) {
  const { hasSession, onBeginClick } = useLandingContext();
  
  const finalHasSession = propHasSession ?? hasSession;
  const finalOnBeginClick = propOnBeginClick ?? onBeginClick;
  return (
    <section id="social-proof" className="py-12 sm:py-16 lg:py-20 bg-background">
      <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className={`text-3xl sm:text-4xl md:text-5xl font-medium ${crimson.className} tracking-tight text-foreground`}>
            Loved by many
          </h2>
        </div>
        
        <TooltipProvider>
          <div className="flex flex-col items-center justify-center gap-4 sm:gap-5 max-w-3xl mx-auto px-4">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-sm sm:text-base text-muted-foreground text-center">
              <span>Used by</span>
              <Link 
                href="https://twitter.com/dps" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                <Image 
                  src="/images/dps.jpg" 
                  alt="David Singleton" 
                  width={28} 
                  height={28} 
                  className="size-7 rounded-full object-cover" 
                />
                <span className="text-sm">@dps</span>
              </Link>
              <span>the ex-CTO of</span>
              <Image 
                src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg" 
                alt="Stripe" 
                width={64} 
                height={26} 
                className="h-5 w-auto opacity-85" 
              />
            </div>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-sm sm:text-base text-muted-foreground text-center">
              <span>Part of the</span>
              <Link
                href="https://vercel.com/ai-accelerator"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:underline underline-offset-2"
              >
                Vercel AI Accelerator
              </Link>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                    & used by the Vercel team
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-sm font-normal">
                  Including{' '}
                  <a 
                    href="https://twitter.com/leerob" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="font-medium text-blue-600 hover:text-blue-700"
                  >
                    @leerob
                  </a>
                </TooltipContent>
              </Tooltip>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-x-2.5 gap-y-2 text-sm sm:text-base text-muted-foreground text-center">
              <span>We&apos;re open-source & self-hostable</span>
            </div>
          </div>
        </TooltipProvider>
        <div className="mt-10 text-center">
          <Button
            variant="secondary"
            size="lg"
            className="rounded-full px-8 py-3"
            onClick={finalOnBeginClick}
          >
            {finalHasSession ? "Open Snow Leopard" : "Get Started"}
          </Button>
        </div>
      </div>
    </section>
  );
}
