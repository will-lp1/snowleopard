"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

interface FooterProps {
  animatedStarCount: number;
}

export function Footer({ animatedStarCount }: FooterProps) {
  return (
    <footer className="w-full border-t border-border bg-background/80 backdrop-blur-sm py-8 sm:py-12 mt-8">
      <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          {/* Left Section - Community Engagement */}
          <div className="flex flex-col items-center md:items-start space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium text-foreground">Join our community</h3>
            <div className="flex flex-col items-center md:items-start space-y-2 sm:space-y-3">
              <Link 
                href="https://discord.gg/pZCeQpvMPA" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Image src="/images/discord-logo.png" alt="Discord" width={16} height={16} className="size-3 sm:size-4" />
                Join our Discord
              </Link>
              <Link 
                href="https://github.com/will-lp1/snowleopard" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Image src="/images/github-logo.png" alt="Github" width={16} height={16} className="dark:invert size-3 sm:size-4" />
                Contribute on Github | ★ {animatedStarCount.toLocaleString()}
              </Link>
              <Link 
                href="https://twitter.com/snowleopard" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="size-3 sm:size-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Follow us on Twitter
              </Link>
            </div>
          </div>

          {/* Right Section - Navigation and Social */}
          <div className="flex flex-col items-center md:items-end space-y-4 sm:space-y-6">
            {/* Social Media Icons */}
            <div className="flex items-center gap-3 sm:gap-4">
              <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="size-4 sm:size-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </Link>
              <Link href="https://twitter.com/snowleopard" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="size-4 sm:size-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </Link>
              <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="size-4 sm:size-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </Link>
            </div>

            {/* Navigation Links */}
            <div className="flex flex-col items-center md:items-end space-y-1 sm:space-y-2">
              <Link href="/contributors" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors">
                Contributors
              </Link>
              <Link href="#" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom - Copyright */}
        <div className="border-t border-border mt-6 sm:mt-8 pt-4 sm:pt-6">
          <div className="flex items-center gap-3">
            <span className="text-xs sm:text-sm text-muted-foreground">© {new Date().getFullYear()} Snow Leopard. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
