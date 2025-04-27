'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { toast } from '@/components/toast';
import { AuthForm } from '@/components/auth-form';
import { SubmitButton } from '@/components/submit-button';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/documents';
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [email, setEmail] = useState('');

  const handleEmailLogin = async (formData: FormData) => {
    const currentEmail = formData.get('email') as string;
    const password = formData.get('password') as string;
    setEmail(currentEmail);

    await authClient.signIn.email({
      email: currentEmail,
      password,
      callbackURL: redirectTo,
    }, {
      onRequest: () => {
        setIsLoading(true);
        setIsSuccessful(false);
      },
      onSuccess: () => {
        setIsLoading(false);
        setIsSuccessful(true);
        toast({ type: 'success', description: 'Signed in successfully! Redirecting...' });
        router.push(redirectTo);
      },
      onError: (ctx) => {
        setIsLoading(false);
        setIsSuccessful(false);
        console.error("Email Login Error:", ctx.error);
        toast({
          type: 'error',
          description: ctx.error.message || 'Failed to sign in.',
        });
      },
    });
  };

  return (
    <div className="flex h-dvh w-screen items-start pt-12 md:pt-0 md:items-center justify-center bg-background">
      <div className="w-full max-w-md overflow-hidden rounded-2xl flex flex-col gap-12">
        <div className="flex flex-col items-center justify-center gap-2 px-8 text-center">
          <h3 className="text-xl font-semibold dark:text-zinc-50">Sign In</h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Sign in with your email and password
          </p>
        </div>
        
        <div className="px-8">
          <AuthForm action={handleEmailLogin} defaultEmail={email}> 
            <SubmitButton 
              isSuccessful={isSuccessful}
            >
              Sign In
            </SubmitButton>
          </AuthForm>
        </div>

        <p className="text-center text-sm text-gray-600 dark:text-zinc-400">
          {"Don't have an account? "}
          <Link
            href="/register"
            className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
