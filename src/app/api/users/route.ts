import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: {
      id: true,
      displayName: true,
      username: true,
      glickoRating: true,
      glickoRd: true
    },
    orderBy: {
      displayName: 'asc'
    }
  });
  return NextResponse.json({ users });
}
