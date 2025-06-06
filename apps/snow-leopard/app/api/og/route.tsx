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
      <div style={{
        width: 1200,
        height: 630,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at center, #ffffff 60%, #f0f0f0 100%)', // floating backdrop
      }}>
        <div style={{
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle at center, #f9f9f9 0%, #e0e0e0 100%)',
          border: '8px solid #c0c0c0', // silver border
          boxShadow: '0 20px 40px rgba(0,0,0,0.15), inset 0 0 30px rgba(0,0,0,0.03)', // drop shadow for floating effect
          fontFamily: '"SF Pro Display", "Helvetica Neue", "Arial", sans-serif',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: '-0.05em',
            lineHeight: 1,
            textAlign: 'center',
            fontFamily: '"SF Pro Display", "Helvetica Neue", "Arial", sans-serif',
            color: '#1f2937', // gray-800
          }}>
            {title}
          </div>
          <div style={{
            fontSize: 28,
            fontWeight: 400,
            marginTop: 24,
            color: '#6b7280', // gray-500
            textAlign: 'center',
            fontFamily: '"SF Pro Display", "Helvetica Neue", "Arial", sans-serif',
          }}>
            Tab, Tab, Apply
          </div>
          <div style={{
            fontSize: 28,
            fontWeight: 400,
            marginTop: 8,
            color: '#6b7280',
            textAlign: 'center',
            fontFamily: '"SF Pro Display", "Helvetica Neue", "Arial", sans-serif',
          }}>
            Brilliance
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
} 