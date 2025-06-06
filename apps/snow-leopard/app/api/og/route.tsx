import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // ?title=<title>
  const hasTitle = searchParams.has('title');
  const title = hasTitle
    ? searchParams.get('title')?.slice(0, 100)
    : 'Snow Leopard';

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#030712', // gray-950
          color: '#f9fafb', // gray-50
          backgroundImage: 'linear-gradient(135deg, #111827 0%, #030712 100%)',
          fontFamily: '"SF Pro Display", "Helvetica Neue", "Arial", sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 100,
            fontWeight: 800,
            letterSpacing: '-0.05em',
            lineHeight: 1,
            whiteSpace: 'pre-wrap',
            textAlign: 'center',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 400,
            marginTop: 24,
            color: '#d1d5db', // gray-300
            textAlign: 'center',
          }}
        >
          Tab, Tab, Apply Brilliance
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
} 