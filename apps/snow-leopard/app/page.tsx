"use client";

import { 
  Hero, 
  Features, 
  SocialProof, 
  LandingStyles 
} from "@/components/landing";

export default function Home() {

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <Hero />
      <Features />
      <SocialProof />
      <LandingStyles />
    </div>
  );
}