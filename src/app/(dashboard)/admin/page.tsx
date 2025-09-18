import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { prisma } from '@/lib/prisma';
import { AllowlistManager } from '@/features/admin/allowlist-manager';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    redirect('/');
  }

  const entries = await prisma.allowlistEmail.findMany({
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <h2 className="text-lg font-semibold">Allowlist</h2>
      <p className="text-sm text-slate-500">Only emails listed here can sign in.</p>
      <div className="mt-6">
        <AllowlistManager initialEntries={entries} />
      </div>
    </div>
  );
}
