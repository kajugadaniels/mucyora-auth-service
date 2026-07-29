import { createPrismaClient } from '@mucyora/db';

const connectionString = process.env.PERFORMANCE_DATABASE_URL;
if (!connectionString || process.env.ALLOW_QUERY_PLAN_INSPECTION !== 'true') {
  throw new Error(
    'Set PERFORMANCE_DATABASE_URL and ALLOW_QUERY_PLAN_INSPECTION=true for an approved disposable database branch.',
  );
}
if (/prod(uction)?/i.test(new URL(connectionString).hostname)) {
  throw new Error('Production query-plan inspection is forbidden.');
}

const database = createPrismaClient({ connectionString });
const queries = {
  refreshLookup:
    'EXPLAIN (FORMAT JSON) SELECT id FROM refresh_tokens WHERE "tokenDigest" = $1',
  activeSessions:
    'EXPLAIN (FORMAT JSON) SELECT id FROM auth_sessions WHERE "userId" = $1 AND status = $2 AND "expiresAt" > now() ORDER BY "expiresAt" LIMIT 50',
  verificationAttempts:
    'EXPLAIN (FORMAT JSON) SELECT id FROM identity_verification_attempts WHERE "userId" = $1 AND purpose = $2 AND status = $3 ORDER BY "startedAt" DESC LIMIT 1',
  stepUpTarget:
    'EXPLAIN (FORMAT JSON) SELECT id FROM step_up_challenges WHERE "userId" = $1 AND purpose = $2 AND "targetResourceDigest" = $3 AND status = $4 AND "expiresAt" > now() LIMIT 1',
  outboxDelivery:
    'EXPLAIN (FORMAT JSON) SELECT id FROM outbox_events WHERE "publishedAt" IS NULL AND "deadLetteredAt" IS NULL AND "nextAttemptAt" <= now() ORDER BY "createdAt" LIMIT 20',
} as const;

async function main(): Promise<void> {
  const parameters: Record<keyof typeof queries, unknown[]> = {
    refreshLookup: ['synthetic-digest'],
    activeSessions: ['synthetic-user', 'ACTIVE'],
    verificationAttempts: [
      'synthetic-user',
      'ACCOUNT_ENROLLMENT',
      'MEDIA_PENDING',
    ],
    stepUpTarget: [
      'synthetic-user',
      'DEVICE_TRANSFER',
      'synthetic-target-digest',
      'PENDING',
    ],
    outboxDelivery: [],
  };

  for (const [name, query] of Object.entries(queries) as Array<
    [keyof typeof queries, string]
  >) {
    const plan = await database.$queryRawUnsafe(query, ...parameters[name]);
    process.stdout.write(`${JSON.stringify({ query: name, plan })}\n`);
  }
}

main().finally(() => database.$disconnect());
