import { notFound } from 'next/navigation';
import { auth } from '@/server/auth';
import { getTournamentDetail } from '@/server/tournament-service';
import { TournamentDetailClient } from '@/features/tournaments/tournament-detail';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function TournamentDetailPage({ params }: PageProps) {
  const tournament = await getTournamentDetail(params.id);
  if (!tournament) {
    notFound();
  }

  const session = await auth();
  const role = session?.user?.role === 'ADMIN' ? 'ADMIN' : 'USER';

  return <TournamentDetailClient tournament={tournament} userId={session?.user?.id ?? null} role={role} />;
}
