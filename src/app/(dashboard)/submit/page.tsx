import { auth } from '@/server/auth';
import { SubmitMatchForm } from '@/features/matches/submit-form';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SubmitPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/signin');
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <h2 className="text-lg font-semibold">Log a Match</h2>
      <p className="text-sm text-slate-500">Single game format, win-by margin enforced.</p>
      <div className="mt-6">
        <SubmitMatchForm />
      </div>
    </div>
  );
}
