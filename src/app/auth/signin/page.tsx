import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';

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
            <form key={provider.id} action={`/api/auth/signin/${provider.id}`} method="post">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-200 px-4 py-2 font-medium text-slate-700 shadow hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
              >
                Continue with {provider.name}
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
