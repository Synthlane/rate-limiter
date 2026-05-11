require('dotenv').config();

const assert = require('assert');
const { v4: uuidv4 } = require('uuid');
const TokenBucket = require('../core/bucket');
const db = require('../core/db');

const CAPACITY = 10;
const TOTAL_REQUESTS = 20;

function printRound(label, results) {
  const allowed = results.filter((r) => r.allowed === 1).length;
  const denied = results.length - allowed;

  console.log(`\n${label}`);
  console.log(`Allowed: ${allowed}, Denied: ${denied}`);
  console.table(
    results.map((r, i) => ({
      idx: i + 1,
      workerId: r.workerId,
      requestId: r.requestId,
      allowed: r.allowed,
      tokensLeft: r.tokensLeft,
      version: r.version,
      retries: r.retries,
      isRace: r.isRace,
    }))
  );

  return { allowed, denied };
}

function printSummary(unsafeSummary, atomicSummary) {
  console.log('\nSummary');
  console.table([
    {
      round: 'unsafeConsume',
      capacity: CAPACITY,
      totalRequests: TOTAL_REQUESTS,
      allowed: unsafeSummary.allowed,
      denied: unsafeSummary.denied,
      expectation: 'allowed > 10',
    },
    {
      round: 'atomicConsume',
      capacity: CAPACITY,
      totalRequests: TOTAL_REQUESTS,
      allowed: atomicSummary.allowed,
      denied: atomicSummary.denied,
      expectation: 'allowed == 10',
    },
  ]);
}

async function runRound(bucket, clientId, mode) {
  const requests = Array.from({ length: TOTAL_REQUESTS }, async (_, index) => {
    const workerId = `worker-${index + 1}`;
    const requestId = uuidv4();

    const result =
      mode === 'unsafe'
        ? await bucket.unsafeConsume(clientId)
        : await bucket.atomicConsume(clientId);

    const event = {
      clientId,
      workerId,
      requestId,
      allowed: result.allowed === 1,
      tokensLeft: result.tokensLeft,
      retries: 0,
      isRace: mode === 'unsafe',
    };

    await db.saveEvent(event);

    return {
      workerId,
      requestId,
      retries: 0,
      isRace: mode === 'unsafe',
      ...result,
    };
  });

  return Promise.all(requests);
}

async function main() {
  const bucket = new TokenBucket();

  try {
    await db.setupTable();

    const clientUnsafe = 'client-unsafe-race';
    await bucket.initBucket(clientUnsafe, CAPACITY, 1);
    const unsafeResults = await runRound(bucket, clientUnsafe, 'unsafe');
    const unsafeSummary = printRound('Round 1: unsafeConsume (broken)', unsafeResults);
    assert(
      unsafeSummary.allowed > CAPACITY,
      `Expected unsafe round allowed > ${CAPACITY}, got ${unsafeSummary.allowed}`
    );

    const clientAtomic = 'client-atomic-race';
    await bucket.initBucket(clientAtomic, CAPACITY, 1);
    const atomicResults = await runRound(bucket, clientAtomic, 'atomic');
    const atomicSummary = printRound('Round 2: atomicConsume (fixed)', atomicResults);
    assert.strictEqual(
      atomicSummary.allowed,
      CAPACITY,
      `Expected atomic round allowed == ${CAPACITY}, got ${atomicSummary.allowed}`
    );

    printSummary(unsafeSummary, atomicSummary);

    const metrics = await db.getMetrics();
    console.log('\nAggregated DB metrics');
    console.table([metrics]);

    console.log('\nRace test passed.');
  } finally {
    await bucket.disconnect();
    await db.disconnect();
  }
}

main().catch((err) => {
  console.error('Race test failed:', err);
  process.exitCode = 1;
});
