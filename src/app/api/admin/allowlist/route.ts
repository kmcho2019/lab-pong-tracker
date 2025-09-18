import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const currentUser = session.user;

  const emails = await prisma.allowlistEmail.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json({ emails });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const currentUser = session.user;

  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const entry = await prisma.allowlistEmail.upsert({
    where: { email },
    update: {
      note: typeof body.note === 'string' ? body.note : undefined
    },
    create: {
      email,
      note: typeof body.note === 'string' ? body.note : undefined,
      addedById: currentUser.id
    }
  });

  return NextResponse.json({ entry });
}
