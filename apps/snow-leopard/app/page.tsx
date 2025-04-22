'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Crimson_Text } from 'next/font/google'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client' // Import Better Auth client

const crimson = Crimson_Text({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
})

export default function Home() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true) // Start loading until session check completes
  const router = useRouter()
  // Remove Supabase client initialization
  // const supabase = createClient()

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Use Better Auth client to get session
        const { data: session, error } = await authClient.getSession();
        
        if (error) {
           console.error('Error fetching session:', error);
           // Stay on landing page if session check fails
           setIsLoading(false);
           return;
        }

        if (session?.user) {
          // If user is logged in, redirect to documents
          router.push('/documents')
          // No need to set isLoading to false here, as we are navigating away
        } else {
          // If user is not logged in, stop loading and show the landing page
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Error checking session unexpectedly:', error)
        // Also stop loading on error to prevent infinite spinner
        setIsLoading(false)
      }
    }

    checkSession()
  }, [router]) // router is generally stable

  const handleBeginClick = async () => {
    setIsLoading(true); // Show loading indicator on click
    const { data: session } = await authClient.getSession()
    if (session?.user) {
      router.push('/documents')
    } else {
      // Redirect to login, keeping the intended destination
      router.push('/login?redirect=/documents') 
    }
    // setIsLoading(false); // Loading stops on navigation or page load
  }

  // Don't render content while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        {/* Simple loading indicator */}
        <div className="size-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="absolute top-0 w-full flex justify-between items-center px-8 py-6 z-10">
        <h1 className="text-lg font-normal text-foreground/90">
          snow leopard
        </h1>
        <button 
          onClick={handleBeginClick}
          className="px-6 py-2 rounded-full bg-card text-card-foreground border border-border shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-muted transition-colors text-sm"
        >
          Begin
        </button>
      </header>

      {/* Main Content */}
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        {/* Snow Leopard Left */}
        <div className="fixed left-0 bottom-40 pointer-events-none select-none mix-blend-multiply">
          <Image
            src="/images/snow-leopard-left.png"
            alt=""
            width={400}
            height={400}
            className="max-w-[300px] md:max-w-[400px] opacity-15"
          />
        </div>

        {/* Snow Leopard Right */}
        <div className="fixed right-0 bottom-40 pointer-events-none select-none mix-blend-multiply">
          <Image
            src="/images/snow-leopard-right.png"
            alt=""
            width={400}
            height={400}
            className="max-w-[300px] md:max-w-[400px] opacity-15"
          />
        </div>

        <div className="space-y-6 max-w-4xl mb-32">
          {/* Video Preview Button */}
          <button 
            onClick={() => setIsDialogOpen(true)}
            className="group px-6 py-2 rounded-full bg-card text-card-foreground border border-border shadow-sm hover:bg-muted transition-all duration-200 text-sm flex items-center gap-2 hover:border-border/80 mx-auto mb-4"
          >
            <svg className="size-4 text-muted-foreground" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Watch demo
          </button>

          {/* Video Dialog */}
          <dialog 
            open={isDialogOpen} 
            className="fixed inset-0 size-full bg-transparent p-0 m-0 max-w-none max-h-none z-50"
          >
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsDialogOpen(false)}
            />
            <div className="fixed inset-0 flex items-center justify-center p-4">
              <div className="relative w-full max-w-4xl bg-card rounded-2xl shadow-2xl overflow-hidden">
                {/* Close button */}
                <button 
                  onClick={() => setIsDialogOpen(false)}
                  className="absolute top-4 right-4 z-10 size-8 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 transition-colors"
                >
                  <svg className="size-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                
                {/* Video container with 16:9 aspect ratio */}
                <div className="relative pt-[56.25%] bg-black">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-muted-foreground text-sm">Video content will go here</p>
                  </div>
                </div>
              </div>
            </div>
          </dialog>

          {/* Title Group */}
          <div className="space-y-0">
            <div className="relative">
              <h2 className={`text-[96px] ${crimson.className} tracking-[-0.02em] leading-[0.8] text-foreground`}>
                Tab, Tab, Apply
              </h2>
            </div>
            
            <div className="relative mt-1">
              <h3 className={`text-[80px] ${crimson.className} tracking-[-0.01em] text-foreground font-bold`}>
                Brilliance<span className="animate-blink ml-0.5 font-normal">|</span>
              </h3>
            </div>
          </div>

          {/* Tagline */}
          <p className="text-base text-muted-foreground max-w-md mx-auto font-light">
            the most satisfying, intuitive ai writing tool,
            <br />
            and it&apos;s open source
          </p>
          
          {/* CTA Buttons */}
          <div className="flex gap-3 justify-center mt-8">
            <Link 
              href="/login"
              className="group px-6 py-2 rounded-full bg-card text-card-foreground border border-border shadow-sm hover:bg-muted transition-all duration-200 text-sm flex items-center hover:border-border/80"
            >
              Begin <span className="inline-block ml-1 text-xs transition-transform group-hover:translate-x-0.5">›</span>
            </Link>
            <Link 
              href="https://github.com/will-lp1/cursorforwriting"
              target="_blank"
              rel="noopener noreferrer"
              className="group px-6 py-2 rounded-full bg-card text-card-foreground border border-border shadow-sm hover:bg-muted transition-all duration-200 text-sm flex items-center hover:border-border/80"
            >
              GIT <span className="inline-block ml-1 text-xs transition-transform group-hover:translate-x-0.5">›</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

// Add this to your globals.css
/* 
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.animate-blink {
  animation: blink 1s step-end infinite;
}
*/
