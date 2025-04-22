import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center">
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="mb-8">Oops! The page you are looking for does not exist.</p>
      <Link href="/" className="text-blue-500 hover:underline">
        Go back home
      </Link>
    </div>
  );
} 