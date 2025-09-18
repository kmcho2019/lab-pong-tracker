import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { SignInButton } from '@/components/sign-in-button';

const providers = [
  { id: 'google', name: 'Google' },
  { id: 'github', name: 'GitHub' }
];

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) {
    redirect('/');
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <div className="rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <h1 className="text-xl font-semibold">Sign in to Lab Pong Tracker</h1>
        <p className="mt-2 text-sm text-slate-500">
          Only allowlisted lab emails can access the submission tools.
        </p>
        <div className="mt-6 space-y-3">
          {providers.map((provider) => (
            <SignInButton
              key={provider.id}
              providerId={provider.id}
              providerName={provider.name}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
