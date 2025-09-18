import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: { id: string };
}

export async function GET(request: Request, context: RouteContext) {
  const match = await prisma.match.findUnique({
    where: { id: context.params.id },
    include: {
      participants: {
        include: { user: true, team: true }
      },
      auditLogs: true
    }
  });

  if (!match) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ match });
}
