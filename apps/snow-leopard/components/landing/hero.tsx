"use client";

import Image from "next/image";
import { Crimson_Text } from "next/font/google";

const crimson = Crimson_Text({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

export function Hero() {
  return (
    <section id="hero" className="py-16 sm:py-24 lg:py-32 bg-background">
      <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 flex flex-col items-center text-center">
        <div className="space-y-1 sm:space-y-2">
          <div className="relative">
            <h2
              className={`text-3xl sm:text-4xl md:text-6xl lg:text-7xl xl:text-8xl ${crimson.className} tracking-[-0.02em] leading-[0.9] text-foreground font-normal`}
            >
              Tab, Tab, Apply
            </h2>
          </div>

          <div className="relative">
            <h3
              className={`text-3xl sm:text-4xl md:text-6xl lg:text-7xl xl:text-8xl ${crimson.className} tracking-[-0.02em] leading-[0.9] text-foreground font-normal`}
            >
              Brilliance
              <span className="animate-blink ml-1 font-normal">|</span>
            </h3>
          </div>
        </div>

        <p className="text-base sm:text-lg md:text-xl text-muted-foreground mt-6 sm:mt-8 max-w-xl sm:max-w-2xl text-balance mx-auto font-light leading-relaxed px-4">
          The most satisfying, intuitive AI writing tool, and it&apos;s open
          source.
        </p>

        <div className="mt-8 sm:mt-10 flex items-center justify-center">
          <div className="flex items-center rounded-full bg-muted/30 border border-muted/50 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm text-muted-foreground/90 backdrop-blur-sm">
            <span className="font-medium">Part of</span>
            <div className="ml-2 sm:ml-3 flex items-center">
              <svg
                aria-hidden="true"
                focusable="false"
                role="img"
                className="size-3 sm:size-4 mr-1.5 sm:mr-2"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2L1 21h22L12 2z"></path>
              </svg>
              <span className="font-medium">Vercel OSS 2025</span>
            </div>
          </div>
        </div>

        <div className="mt-12 sm:mt-16 lg:mt-20 flex justify-center w-full px-4">
          <div className="hero-frame w-full max-w-4xl md:max-w-6xl lg:max-w-7xl">
            <Image
              src="/images/lightmode.png"
              alt="Snow Leopard Demo Preview"
              width={1200}
              height={675}
              className="rounded-lg block dark:hidden w-full h-auto"
              priority={true}
            />
            <Image
              src="/images/darkmode.png"
              alt="Snow Leopard Demo Preview (Dark Mode)"
              width={1200}
              height={675}
              className="rounded-lg hidden dark:block w-full h-auto"
              priority={true}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
