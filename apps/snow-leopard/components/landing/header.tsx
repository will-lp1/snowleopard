"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Star } from 'lucide-react';

interface HeaderProps {
  hasSession: boolean;
  animatedStarCount: number;
  onBeginClick: () => void;
}

export function Header({ hasSession, animatedStarCount, onBeginClick }: HeaderProps) {
  return (
    <header className="absolute top-0 w-full z-10 py-4 sm:py-6">
      <div className="container mx-auto flex justify-between items-center px-4 sm:px-6 md:px-8 lg:px-12">
        {/* Left Side - Company name */}
        <h1 className="text-lg sm:text-xl font-normal tracking-tighter text-foreground/90">
          snow leopard
        </h1>

        {/* Right Side - GitHub + CTA */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* GitHub button */}
          <Link
            href="https://github.com/will-lp1/snowleopard"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center rounded-md border border-white/20 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-white hover:bg-white/10 transition-colors duration-200"
          >
            <Image 
              src="/images/github-logo.png" 
              alt="Github" 
              width={16} 
              height={16} 
              className="dark:invert mr-1 sm:mr-2 size-3 sm:size-4" 
            />
            <span className="mr-1 sm:mr-2 hidden sm:inline">GitHub</span>
            <span className="mx-1 sm:mx-2 text-muted-foreground/60">|</span>
            <Star className="size-3 sm:size-4 mr-1 sm:mr-1.5 transition-colors duration-200 group-hover:text-yellow-300 group-hover:fill-yellow-300"/>
            <span className="counter-value font-mono text-xs sm:text-sm">
              {animatedStarCount.toLocaleString()}
            </span>
          </Link>

          {/* CTA Button */}
          <Button
            size="sm"
            className="rounded-md px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium"
            onClick={onBeginClick}
          >
            {hasSession ? "Start Writing" : "Get Started"}
          </Button>
        </div>
      </div>
    </header>
  );
}
