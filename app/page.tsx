import Link from 'next/link'
import Image from 'next/image'
import { Crimson_Text } from 'next/font/google'

const crimson = Crimson_Text({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
})

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      {/* Header */}
      <header className="absolute top-0 w-full flex justify-between items-center px-8 py-6 z-10">
        <h1 className="text-lg font-normal text-gray-800">
          cursorforwriting
        </h1>
        <Link 
          href="/chat"
          className="px-6 py-2 rounded-full bg-white border border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-gray-50 transition-colors text-sm"
        >
          Begin
        </Link>
      </header>

      {/* Main Content */}
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center relative">
        {/* Snow Leopard Left */}
        <div className="absolute left-0 bottom-32 pointer-events-none select-none mix-blend-multiply">
          <Image
            src="/images/snow-leopard-left.png"
            alt=""
            width={400}
            height={400}
            className="max-w-[300px] md:max-w-[400px] opacity-[0.20]"
          />
        </div>

        {/* Snow Leopard Right */}
        <div className="absolute right-0 bottom-32 pointer-events-none select-none mix-blend-multiply">
          <Image
            src="/images/snow-leopard-right.png"
            alt=""
            width={400}
            height={400}
            className="max-w-[300px] md:max-w-[400px] opacity-[0.20]"
          />
        </div>

        <div className="space-y-6 max-w-4xl -mt-16">
          {/* Title Group */}
          <div className="space-y-0">
            <div className="relative mb-0">
              <h2 className={`text-[96px] ${crimson.className} tracking-[-0.02em] leading-[0.8] text-gray-900`}>
                Tab, Tab, Apply
              </h2>
              
              {/* Accept/Reject UI - Floating control */}
              <div className="absolute top-1 right-2 bg-white/90 rounded-md px-1.5 py-0.5 flex items-center space-x-2 shadow-sm border border-gray-200">
                <button className="text-gray-400 hover:text-gray-600 text-xs transition-colors">×</button>
                <div className="h-3 w-px bg-gray-200"></div>
                <button className="text-gray-400 hover:text-gray-600 text-xs transition-colors">↓</button>
              </div>
            </div>
            
            <div className="relative inline-block mt-1">
              <div className="absolute inset-0 bg-[#E6F0FF] opacity-20"></div>
              <h3 className={`text-[80px] ${crimson.className} relative z-10 tracking-[-0.01em] text-gray-900 font-bold`}>
                Brilliance<span className="animate-blink ml-0.5 font-normal">|</span>
              </h3>
            </div>
          </div>

          {/* Tagline */}
          <p className="text-base text-gray-600 dark:text-gray-400 max-w-md mx-auto font-light mt-2">
            The most satisfying and intuitive ai writing tool,
            <br />
            and it's open source
          </p>
          
          {/* CTA Buttons */}
          <div className="flex gap-3 justify-center mt-4">
            <Link 
              href="/chat"
              className="group px-6 py-2 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-all duration-200 text-sm flex items-center hover:border-gray-300"
            >
              Begin <span className="inline-block ml-1 text-xs transition-transform group-hover:translate-x-0.5">›</span>
            </Link>
            <Link 
              href="https://github.com/will-lp1/cursorforwriting"
              target="_blank"
              rel="noopener noreferrer"
              className="group px-6 py-2 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-all duration-200 text-sm flex items-center hover:border-gray-300"
            >
              GIT <span className="inline-block ml-1 text-xs transition-transform group-hover:translate-x-0.5">›</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Video Container */}
      <div className="absolute bottom-0 w-full -z-10">
        <div className="relative mx-auto max-w-5xl px-4">
          <div className="w-full h-72 bg-white rounded-t-[28px] border border-zinc-200/50 shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.03)] backdrop-blur-[1px]" />
        </div>
      </div>
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
