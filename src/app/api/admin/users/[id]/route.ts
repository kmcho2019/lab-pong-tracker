import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { auth } from '@/server/auth';
import { prisma } from '@/lib/prisma';
import { normalizeUsername, validateDisplayName } from '@/server/user-utils';

const payloadSchema = z.object({
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  displayName: z.string().optional(),
  username: z.string().optional()
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

  let nextDisplayName = user.displayName;
  let nextUsername = user.username;

  if (updates.displayName !== undefined) {
    nextDisplayName = validateDisplayName(updates.displayName);
  }

  if (updates.username !== undefined) {
    nextUsername = await normalizeUsername(prisma, updates.username, {
      currentUserId: user.id,
      displayName: nextDisplayName
    });
  }

  const dataToUpdate: Record<string, unknown> = {};

  if (nextRole !== user.role) dataToUpdate.role = nextRole;
  if (nextActive !== user.active) dataToUpdate.active = nextActive;
  if (nextDisplayName !== user.displayName) dataToUpdate.displayName = nextDisplayName;
  if (nextUsername !== user.username) dataToUpdate.username = nextUsername;

  const updatedUser = Object.keys(dataToUpdate).length
    ? await prisma.user.update({
        where: { id: user.id },
        data: dataToUpdate,
        select: {
          id: true,
          displayName: true,
          email: true,
          role: true,
          active: true,
          username: true
        }
      })
    : {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        active: user.active,
        username: user.username
      };

  return NextResponse.json({ user: updatedUser });
}
