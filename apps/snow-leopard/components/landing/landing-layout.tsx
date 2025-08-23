"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Header, Footer } from "@/components/landing";
import { useCounter } from "@/components/landing/use-counter";
import { LandingProvider } from "@/components/landing/landing-context";

interface LandingLayoutProps {
  children: React.ReactNode;
}

export function LandingLayout({ children }: LandingLayoutProps) {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean>(false);
  const [starCount, setStarCount] = useState<number>(164);
  const { count: animatedStarCount } = useCounter(starCount, 2000);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: session, error } = await authClient.getSession();
        if (error) {
          console.error("Error fetching session:", error);
          return;
        }

        const isLoggedIn = !!session?.user;
        setHasSession(isLoggedIn);

      } catch (error) {
        console.error("Error checking session unexpectedly:", error);
      }
    };

    checkSession();
  }, [router]);

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const response = await fetch('/api/github-stars');
        if (response.ok) {
          const data = await response.json();
          setStarCount(data.stars);
        }
      } catch (error) {
        console.error('Error fetching GitHub stars:', error);
      }
    };

    fetchStars();
  }, []);

  const handleBeginClick = () => {
    if (hasSession) {
      router.push("/documents");
    } else {
      router.push("/login?redirect=/documents");
    }
  };

  return (
    <LandingProvider value={{ hasSession, onBeginClick: handleBeginClick }}>
      <Header 
        hasSession={hasSession}
        animatedStarCount={animatedStarCount}
        onBeginClick={handleBeginClick}
      />
      {children}
      <Footer animatedStarCount={animatedStarCount} />
    </LandingProvider>
  );
}
