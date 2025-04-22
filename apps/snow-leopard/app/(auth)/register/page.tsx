'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { toast } from '@/components/toast';
import { AuthForm } from '@/components/auth-form'; 
import { SubmitButton } from '@/components/submit-button';

export default function RegisterPage() {
  const router = useRouter();
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isEmailSuccessful, setIsEmailSuccessful] = useState(false);
  const [email, setEmail] = useState('');

  const handleEmailSignup = async (formData: FormData) => {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const name = email.split('@')[0] || 'User';
    setEmail(email);

    await authClient.signUp.email({
      email,
      password,
      name,
      callbackURL: "/documents" 
    }, {
      onRequest: () => {
        setIsEmailLoading(true);
        setIsEmailSuccessful(false);
      },
      onSuccess: (ctx) => {
        setIsEmailLoading(false);
        setIsEmailSuccessful(true);
        toast({
          type: 'success',
          description: 'Account created! Redirecting...'
        });
        router.refresh();
      },
      onError: (ctx) => {
        setIsEmailLoading(false);
        setIsEmailSuccessful(false);
        console.error("Email Signup Error:", ctx.error);
        toast({
          type: 'error',
          description: ctx.error.message || 'Failed to create account.',
        });
      },
    });
  };

  return (
    <div className="flex h-dvh w-screen items-start pt-12 md:pt-0 md:items-center justify-center bg-background">
      <div className="w-full max-w-md overflow-hidden rounded-2xl flex flex-col gap-12">
        <div className="flex flex-col items-center justify-center gap-2 px-8 text-center">
          <h3 className="text-xl font-semibold dark:text-zinc-50">Sign Up</h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Create your account with email and password
          </p>
        </div>

        <div className="px-8">
          <AuthForm action={handleEmailSignup} defaultEmail={email}>
            <SubmitButton 
              isSuccessful={isEmailSuccessful}
            >
              Sign Up
            </SubmitButton>
          </AuthForm>
        </div>
        
        <p className="text-center text-sm text-gray-600 dark:text-zinc-400">
          {'Already have an account? '}
          <Link
            href="/login"
            className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
          >
            Sign in
          </Link>
          {' instead.'}
        </p>
      </div>
    </div>
  );
}
