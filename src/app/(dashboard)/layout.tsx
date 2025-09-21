import Link from 'next/link';
import { ReactNode } from 'react';
import { auth } from '@/server/auth';

const navLinks = [
  { href: '/', label: 'Leaderboard' },
  { href: '/history', label: 'History' },
  { href: '/players', label: 'Players' },
  { href: '/tournaments', label: 'Tournaments' },
  { href: '/submit', label: 'Submit' }
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2 rounded-2xl bg-slate-800/90 px-6 py-5 text-slate-100 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Lab Table Tennis League</h1>
            <p className="text-sm text-slate-300">Track matches, rankings, and rivalries in real time.</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {session?.user ? (
              <span>
                {session.user.name ?? session.user.email} · {Math.round(session.user.rating)}
              </span>
            ) : (
              <Link className="rounded-full bg-white px-3 py-1 font-medium text-slate-900" href="/auth/signin">
                Sign in
              </Link>
            )}
          </div>
        </div>
        <nav className="flex flex-wrap gap-3 text-sm">
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full bg-slate-700 px-3 py-1 font-medium text-slate-100 transition hover:bg-slate-600"
            >
              {item.label}
            </Link>
          ))}
          {session?.user?.role === 'ADMIN' ? (
            <Link
              href="/admin"
              className="rounded-full border border-emerald-400 px-3 py-1 font-medium text-emerald-200"
            >
              Admin
            </Link>
          ) : null}
        </nav>
      </header>
      <section className="flex-1">{children}</section>
    </div>
  );
}
