import 'dotenv/config';
import { PrismaClient, MatchStatus, MatchType } from '@prisma/client';
import { recomputeLeague } from '../src/server/recompute';
import { slugFromDisplayName } from '../src/server/user-utils';

const prisma = new PrismaClient();

const playersSeed = [
  {
    email: 'kim@example.com',
    displayName: '김철수',
    image: null
  },
  {
    email: 'han@example.com',
    displayName: '한민지',
    image: null
  },
  {
    email: 'park@example.com',
    displayName: '박민수',
    image: null
  },
  {
    email: 'sofia@example.com',
    displayName: 'Sofia 최',
    image: null
  }
];

const matchesSeed = [
  {
    playedAt: new Date('2024-10-01T12:15:00.000Z'),
    matchType: MatchType.SINGLES,
    team1Score: 11,
    team2Score: 7,
    team1: ['kim@example.com'],
    team2: ['han@example.com'],
    note: 'Opening rally of the new season'
  },
  {
    playedAt: new Date('2024-10-02T12:45:00.000Z'),
    matchType: MatchType.SINGLES,
    team1Score: 8,
    team2Score: 11,
    team1: ['park@example.com'],
    team2: ['sofia@example.com'],
    note: 'Sofia controlled the mid-game'
  },
  {
    playedAt: new Date('2024-10-03T13:20:00.000Z'),
    matchType: MatchType.SINGLES,
    team1Score: 14,
    team2Score: 12,
    team1: ['kim@example.com'],
    team2: ['park@example.com']
  },
  {
    playedAt: new Date('2024-10-04T18:40:00.000Z'),
    matchType: MatchType.SINGLES,
    team1Score: 11,
    team2Score: 9,
    team1: ['han@example.com'],
    team2: ['sofia@example.com'],
    note: 'Tactical backhand exchanges'
  },
  {
    playedAt: new Date('2024-10-05T11:05:00.000Z'),
    matchType: MatchType.SINGLES,
    team1Score: 9,
    team2Score: 11,
    team1: ['kim@example.com'],
    team2: ['sofia@example.com']
  },
  {
    playedAt: new Date('2024-10-06T14:30:00.000Z'),
    matchType: MatchType.SINGLES,
    team1Score: 13,
    team2Score: 11,
    team1: ['han@example.com'],
    team2: ['park@example.com'],
    note: 'Extended deuce battle'
  },
  {
    playedAt: new Date('2024-10-07T08:55:00.000Z'),
    matchType: MatchType.SINGLES,
    team1Score: 9,
    team2Score: 11,
    team1: ['sofia@example.com'],
    team2: ['han@example.com']
  },
  {
    playedAt: new Date('2024-10-08T17:10:00.000Z'),
    matchType: MatchType.SINGLES,
    team1Score: 10,
    team2Score: 12,
    team1: ['park@example.com'],
    team2: ['kim@example.com']
  }
];

async function main() {
  const allowlist = (process.env.EMAIL_ALLOWLIST ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

  for (const email of allowlist) {
    await prisma.allowlistEmail.upsert({
      where: { email },
      update: {},
      create: { email }
    });
  }

  const users = new Map<string, { id: string }>();

  for (const player of playersSeed) {
    const user = await prisma.user.upsert({
      where: { email: player.email },
      update: {
        displayName: player.displayName
      },
      create: {
        email: player.email,
        displayName: player.displayName,
        username: slugFromDisplayName(player.displayName),
        image: player.image
      }
    });
    users.set(player.email, { id: user.id });
  }

  for (const seed of matchesSeed) {
    const team1Ids = seed.team1.map((email) => users.get(email)?.id).filter((value): value is string => Boolean(value));
    const team2Ids = seed.team2.map((email) => users.get(email)?.id).filter((value): value is string => Boolean(value));

    if (!team1Ids.length || !team2Ids.length) {
      continue;
    }

    const created = await prisma.match.create({
      data: {
        matchType: seed.matchType,
        status: MatchStatus.CONFIRMED,
        team1Score: seed.team1Score,
        team2Score: seed.team2Score,
        targetPoints: 11,
        winByMargin: 2,
        playedAt: seed.playedAt,
        note: seed.note,
        enteredById: team1Ids[0],
        confirmedById: team2Ids[0],
        confirmedAt: seed.playedAt,
        teams: {
          create: [
            { teamNo: 1 },
            { teamNo: 2 }
          ]
        }
      },
      include: {
        teams: true
      }
    });

    const teamOne = created.teams.find((team) => team.teamNo === 1);
    const teamTwo = created.teams.find((team) => team.teamNo === 2);
    if (!teamOne || !teamTwo) {
      continue;
    }

    await prisma.matchParticipant.createMany({
      data: [
        ...team1Ids.map((userId) => ({
          matchId: created.id,
          userId,
          teamId: teamOne.id
        })),
        ...team2Ids.map((userId) => ({
          matchId: created.id,
          userId,
          teamId: teamTwo.id
        }))
      ]
    });

    await prisma.auditLog.create({
      data: {
        matchId: created.id,
        message: 'SEEDED_MATCH'
      }
    });
  }

  await recomputeLeague();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
