import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock('@/server/auth', () => ({
  auth: vi.fn()
}));

import { prisma } from '@/lib/prisma';
import { auth } from '@/server/auth';
import { PATCH } from '@/app/api/admin/users/[id]/route';

const jsonMock = vi.fn();

vi.mock('next/server', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const originalJson = actual.NextResponse.json.bind(actual.NextResponse);
  actual.NextResponse.json = vi.fn((body: any, init?: ResponseInit) => {
    jsonMock(body, init);
    return originalJson(body, init);
  });
  return actual;
});

beforeEach(() => {
  vi.clearAllMocks();
  jsonMock.mockClear();
});

describe('PATCH /api/admin/users/[id]', () => {
  it('returns 400 for invalid handle without hitting update', async () => {
    (auth as any).mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } });
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'user1',
      role: 'USER',
      active: true,
      displayName: 'Alex Kim',
      username: 'alex'
    });

    const request = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ username: 'Bad Handle!' })
    });

    await PATCH(request, { params: { id: 'user1' } });

    expect(jsonMock).toHaveBeenCalled();
    const lastCall = jsonMock.mock.calls.at(-1);
    const body = lastCall?.[0];
    const init = lastCall?.[1] as ResponseInit | undefined;
    expect(init?.status).toBe(400);
    expect(body.error).toMatch(/Handles must be 3-32 characters/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
