'use client';

import { signIn } from 'next-auth/react';

interface SignInButtonProps {
  providerId: string;
  providerName: string;
}

export function SignInButton({ providerId, providerName }: SignInButtonProps) {
  return (
    <button
      type="button"
      onClick={() => signIn(providerId)}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-200 px-4 py-2 font-medium text-slate-700 shadow hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
    >
      Continue with {providerName}
    </button>
  );
}
