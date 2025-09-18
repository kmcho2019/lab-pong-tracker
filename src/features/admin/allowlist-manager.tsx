'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface AllowlistEntry {
  id: string;
  email: string;
  note: string | null;
  createdAt: string | Date;
}

interface AllowlistManagerProps {
  initialEntries: AllowlistEntry[];
}

export function AllowlistManager({ initialEntries }: AllowlistManagerProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, note })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to add email');
      }
      return response.json() as Promise<{ entry: AllowlistEntry }>;
    },
    onSuccess: ({ entry }) => {
      setEntries((prev) => [
        entry,
        ...prev
      ]);
      setEmail('');
      setNote('');
      setSuccess('Email added to allowlist');
      setError(null);
    },
    onError: (error: any) => {
      setError(error.message ?? 'Failed to add email');
      setSuccess(null);
    }
  });

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-[2fr,1fr]">
          <label className="flex flex-col gap-1 text-sm">
            <span>Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Note</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
            />
          </label>
        </div>
        <button
          type="submit"
          className="self-start rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Saving…' : 'Add to allowlist'}
        </button>
        {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-500">{success}</p> : null}
      </form>

      <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 text-sm dark:border-slate-700">
        <table className="w-full table-auto">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2">Added</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-200 dark:border-slate-700">
                <td className="px-3 py-2">{entry.email}</td>
                <td className="px-3 py-2">{entry.note ?? '—'}</td>
                <td className="px-3 py-2 text-slate-500">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
