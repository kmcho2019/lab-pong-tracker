'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import type { Role } from '@prisma/client';
import { formatDate } from '@/utils/time';
import { findDuplicateDisplayNames, formatDisplayLabel } from '@/utils/name-format';

interface AdminUserRow {
  id: string;
  displayName: string;
  username: string;
  email: string;
  role: Role;
  active: boolean;
  lastMatchAt: string | null;
}

interface UserLifecycleManagerProps {
  users: AdminUserRow[];
}

export function UserLifecycleManager({ users }: UserLifecycleManagerProps) {
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ displayName: string; username: string }>({ displayName: '', username: '' });
  const router = useRouter();

  const duplicateNames = useMemo(() => findDuplicateDisplayNames(users.map(({ displayName }) => ({ displayName }))), [users]);

  const filteredUsers = useMemo(() => {
    if (!filter.trim()) return users;
    const query = filter.trim().toLowerCase();
    return users.filter((user) =>
      user.displayName.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.username.toLowerCase().includes(query)
    );
  }, [filter, users]);

  const handleUpdate = (
    id: string,
    payload: { role?: Role; active?: boolean; displayName?: string; username?: string },
    afterSuccess?: () => void
  ) => {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      try {
        const response = await fetch(`/api/admin/users/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setError(body.error || 'Unable to update user.');
          return;
        }
        setMessage('Member settings updated.');
        router.refresh();
        afterSuccess?.();
      } catch (err) {
        setError('Unable to update user.');
      }
    });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Member Lifecycle</h2>
          <p className="text-sm text-slate-500">Promote successors, freeze alumni accounts, and reactivate returning players.</p>
        </div>
        <input
          type="search"
          placeholder="Search name or email"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-600 dark:bg-slate-700"
        />
      </div>
      {message ? <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="max-h-80 overflow-y-auto rounded border border-slate-200 dark:border-slate-700">
        <table className="w-full table-auto text-sm">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left">Member</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last match</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const isEditing = editingUserId === user.id;
              return (
                <tr key={user.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {isEditing
                        ? (
                            <input
                              type="text"
                              value={editValues.displayName}
                              onChange={(event) =>
                                setEditValues((previous) => ({ ...previous, displayName: event.target.value }))
                              }
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700"
                            />
                          )
                        : formatDisplayLabel(user.displayName, user.username, duplicateNames)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{user.email}</div>
                    <div className="text-xs text-slate-500">@{user.username}</div>
                    {isEditing ? (
                      <div className="mt-2 text-xs text-slate-500">
                        Handle (@)
                        <input
                          type="text"
                          value={editValues.username}
                          onChange={(event) =>
                            setEditValues((previous) => ({ ...previous, username: event.target.value }))
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700"
                          placeholder="Leave blank to auto-generate"
                        />
                      </div>
                    ) : null}
                  </td>
                <td className="px-3 py-2 align-top">
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                      user.role === 'ADMIN'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {user.role.toLowerCase()}
                  </span>
                  <span
                    className={clsx(
                      'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                      user.active ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                    )}
                  >
                    {user.active ? 'active' : 'frozen'}
                  </span>
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-500">
                  {user.lastMatchAt ? formatDate(user.lastMatchAt) : '—'}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="rounded border border-blue-400 px-3 py-1 font-semibold text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-300 dark:hover:bg-blue-900/30"
                          onClick={() =>
                            handleUpdate(
                              user.id,
                              { displayName: editValues.displayName, username: editValues.username },
                              () => setEditingUserId(null)
                            )
                          }
                          disabled={isPending}
                        >
                          Save names
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                          onClick={() => setEditingUserId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                        onClick={() => {
                          setEditingUserId(user.id);
                          setEditValues({ displayName: user.displayName, username: user.username });
                          setMessage(null);
                          setError(null);
                        }}
                        disabled={isPending}
                      >
                        Edit name
                      </button>
                    )}
                    {user.role === 'ADMIN' ? (
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                        onClick={() => handleUpdate(user.id, { role: 'USER' })}
                        disabled={isPending}
                      >
                        Demote to user
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded border border-emerald-400 px-3 py-1 font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                        onClick={() => handleUpdate(user.id, { role: 'ADMIN', active: true })}
                        disabled={isPending}
                      >
                        Promote to admin
                      </button>
                    )}
                    {user.active ? (
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-3 py-1 font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                        onClick={() => handleUpdate(user.id, { active: false })}
                        disabled={isPending}
                      >
                        Freeze account
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded border border-blue-400 px-3 py-1 font-semibold text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-300 dark:hover:bg-blue-900/30"
                        onClick={() => handleUpdate(user.id, { active: true })}
                        disabled={isPending}
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
        {filteredUsers.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">No members match “{filter}”.</p>
        ) : null}
      </div>
    </section>
  );
}
