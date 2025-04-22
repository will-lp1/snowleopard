'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ReactNode } from 'react';

interface AuthFormProps {
  action: (formData: FormData) => void;
  defaultEmail?: string;
  children: ReactNode;
}

export function AuthForm({
  action,
  defaultEmail = '',
  children,
}: AuthFormProps) {
  return (
    <form action={action} className="flex flex-col gap-6 px-4 sm:px-16">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          defaultValue={defaultEmail}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          required
        />
      </div>
      {children}
    </form>
  );
}
