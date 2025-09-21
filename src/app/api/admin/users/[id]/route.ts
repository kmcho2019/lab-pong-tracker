import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { auth } from '@/server/auth';
import { prisma } from '@/lib/prisma';

const payloadSchema = z.object({
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional()
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Context {
  params: { id: string };
}

export async function PATCH(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = context.params;
  const body = await request.json().catch(() => undefined);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes supplied' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (user.id === session.user.id && updates.role === Role.USER) {
    return NextResponse.json({ error: 'Cannot demote yourself from the admin console.' }, { status: 400 });
  }

  const nextRole = updates.role ?? user.role;
  const nextActive = updates.active ?? user.active;

  if (user.role === Role.ADMIN && (nextRole !== Role.ADMIN || !nextActive)) {
    const remainingAdmins = await prisma.user.count({
      where: {
        id: { not: user.id },
        role: Role.ADMIN,
        active: true
      }
    });

    if (remainingAdmins === 0) {
      return NextResponse.json({ error: 'Cannot remove the final active admin. Promote another admin first.' }, { status: 400 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      role: updates.role ?? user.role,
      active: updates.active ?? user.active
    },
    select: {
      id: true,
      displayName: true,
      email: true,
      role: true,
      active: true
    }
  });

  return NextResponse.json({ user: updated });
}
