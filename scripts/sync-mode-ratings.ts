import 'dotenv/config';
import { recomputeLeague } from '../src/server/recompute';

async function main() {
  const fromEnv = process.env.PRISMA_RECOMPUTE_FROM;
  const fromDate = fromEnv ? new Date(fromEnv) : undefined;
  await recomputeLeague(fromDate);
}

main()
  .then(() => {
    console.log('[recompute] League ratings replayed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[recompute] Failed to replay league ratings.');
    console.error(error);
    process.exit(1);
  });
