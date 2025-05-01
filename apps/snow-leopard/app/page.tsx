"use client";

import Link from "next/link";
import Image from "next/image";
import { Crimson_Text } from "next/font/google";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const crimson = Crimson_Text({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: session, error } = await authClient.getSession();

        if (error) {
          console.error("Error fetching session:", error);
          return;
        }

        if (session?.user) {
          router.push("/documents");
        } else {
        }
      } catch (error) {
        console.error("Error checking session unexpectedly:", error);
      }
    };

    checkSession();
  }, [router]);

  const handleBeginClick = async () => {
    const { data: session } = await authClient.getSession();
    if (session?.user) {
      router.push("/documents");
    } else {
      router.push("/login?redirect=/documents");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="absolute top-0 w-full flex justify-between items-center px-6 py-4 z-10">
        <h1 className="text-xl font-normal tracking-tighter text-foreground/90">
          snow leopard
        </h1>
        <button
          onClick={handleBeginClick}
          className="px-4 py-1.5 rounded-full bg-card text-card-foreground border border-border  hover:bg-muted transition-colors text-sm"
        >
          Begin
        </button>
      </header>

      {/* Main Content */}
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        {/* Snow Leopard Left */}
        {/* <div className="fixed left-0 bottom-40 pointer-events-none select-none">
          <Image
            src="/images/snow-leopard-left.png"
            alt=""
            width={400}
            height={400}
            className="max-w-[300px] md:max-w-[400px] "
          />
        </div> */}

        {/* Snow Leopard Right */}
        {/* <div className="fixed right-0 bottom-40 pointer-events-none select-none mix-blend-multiply">
          <Image
            src="/images/snow-leopard-right.png"
            alt=""
            width={400}
            height={400}
            className="max-w-[300px] md:max-w-[400px] opacity-15"
          />
        </div> */}

        <div className="flex flex-col items-center max-w-4xl mb-32">
          {/* Title Group */}
          <div className="space-y-0">
            <div className="relative">
              <h2
                className={`text-6xl md:text-[128px] ${crimson.className} tracking-[-0.08em] leading-none text-foreground`}
              >
                Tab, Tab, Apply
              </h2>
            </div>

            <div className="relative mt-0">
              <h3
                className={`text-6xl md:text-[128px] ${crimson.className} tracking-[-0.06em] leading-none text-foreground `}
              >
                Brilliance
                <span className="animate-blink ml-0.5 font-normal">|</span>
              </h3>
            </div>
          </div>

          {/* Tagline */}
          <p className="text-xl text-muted-foreground mt-1 max-w-md text-balance mx-auto font-light">
            The most satisfying, intuitive AI writing tool, and it&apos;s open
            source.
          </p>

          {/* CTA Buttons */}
          <div className="flex gap-2 mt-6 justify-center">
            <Link
              href="/login"
              className="group px-4 py-1.5 rounded-full bg-card text-card-foreground border border-border shadow-sm hover:bg-muted transition-all duration-200 text-sm flex items-center hover:border-border/80"
            >
              Begin{" "}
              <span className="inline-block ml-2 text-xs transition-transform group-hover:translate-x-0.5">
                ›
              </span>
            </Link>
            <Link
              href="https://github.com/will-lp1/snowleopard"
              target="_blank"
              rel="noopener noreferrer"
              className="group px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground  hover:bg-muted transition-all duration-200 text-sm flex items-center hover:border-border/80"
            >
              GitHub{" "}
              <span className="inline-block ml-2 text-xs transition-transform group-hover:translate-x-0.5">
                ›
              </span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
