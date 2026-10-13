import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaClient, type Prisma } from '@prisma/client';
import { getCandidateOutsideSpending, getRaceOutsideSpending } from './outside-spending.service.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
// A cycle no real sync uses, so the test never touches real rows.
const CYCLE = 2094;
let db: PrismaClient;

let n = 0;
const row = (overrides: Partial<Prisma.IndependentExpenditureCreateManyInput>): Prisma.IndependentExpenditureCreateManyInput => ({
  subId: `t-${CYCLE}-${++n}`,
  cycle: CYCLE,
  committeeId: 'C1',
  committeeName: 'ALPHA FUND',
  candidateId: 'H0PA07001',
  candidateName: 'DOE, JANE',
  candidateOffice: 'H',
  candidateState: 'PA',
  candidateDistrict: '07',
  supportOppose: 'S',
  amount: 100,
  expenditureDate: new Date('2026-08-01'),
  description: 'TV AD',
  communicationType: 'TV and video',
  isNotice: false,
  isMemo: false,
  fetchedAt: new Date(),
  ...overrides,
});

before(async () => {
  if (!testDatabaseUrl) return;
  db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  await db.independentExpenditure.createMany({
    data: [
      // C1 regular reports run through Aug 20.
      row({ amount: 1000, expenditureDate: new Date('2026-08-01') }),
      row({ amount: 500, expenditureDate: new Date('2026-08-20'), description: 'Digital ads', communicationType: 'Digital' }),
      // A notice repeated on that regular report: not counted.
      row({ amount: 1000, expenditureDate: new Date('2026-08-01'), isNotice: true }),
      // A newer notice not yet on a regular report: counted.
      row({ amount: 2000, expenditureDate: new Date('2026-09-30'), isNotice: true, description: 'Mailer', communicationType: 'Mail and print' }),
      // A memo line: never counted.
      row({ amount: 9999, isMemo: true }),
      // C2 has only notices (no regular report yet): all counted, against Doe.
      row({ committeeId: 'C2', committeeName: 'BETA PAC', supportOppose: 'O', amount: 3000, expenditureDate: new Date('2026-10-01'), isNotice: true }),
      // Another candidate in the same race.
      row({ committeeId: 'C2', committeeName: 'BETA PAC', candidateId: 'H0PA07002', candidateName: 'ROE, RICHARD', amount: 700 }),
      // Another race: never mixed in.
      row({ candidateId: 'H0PA08001', candidateDistrict: '08', amount: 50000 }),
    ],
  });
});

after(async () => {
  if (!testDatabaseUrl) return;
  await db.independentExpenditure.deleteMany({ where: { cycle: CYCLE } });
  await db.$disconnect();
});

test('notices already repeated on a regular report, and memo lines, are not counted', { skip: !testDatabaseUrl }, async () => {
  const result = await getCandidateOutsideSpending(db, 'H0PA07001', CYCLE);
  assert.equal(result.support, 3500);
  assert.equal(result.oppose, 3000);
  assert.equal(result.total, 6500);
  assert.equal(result.count, 4);
  assert.equal(result.fromNotices, 5000);
  assert.equal(result.candidateName, 'DOE, JANE');
});

test('spenders and communication types keep support and opposition apart', { skip: !testDatabaseUrl }, async () => {
  const result = await getCandidateOutsideSpending(db, 'H0PA07001', CYCLE);
  assert.deepEqual(result.bySpender.map((item) => [item.committeeName, item.support, item.oppose]), [['ALPHA FUND', 3500, 0], ['BETA PAC', 0, 3000]]);
  assert.deepEqual(result.byType.map((item) => [item.type, item.total]), [['TV and video', 4000], ['Mail and print', 2000], ['Digital', 500]]);
  assert.deepEqual(result.recent.map((item) => [item.date, item.amount, item.supportOppose, item.isNotice]), [
    ['2026-10-01', 3000, 'O', true], ['2026-09-30', 2000, 'S', true], ['2026-08-20', 500, 'S', false], ['2026-08-01', 1000, 'S', false],
  ]);
  assert.equal(result.coverage.status, 'not_synced');
  assert.equal(result.coverage.latestExpenditureDate, '2026-10-01');
});

test('a race lists each candidate and only that race', { skip: !testDatabaseUrl }, async () => {
  const race = await getRaceOutsideSpending(db, { state: 'PA', office: 'H', district: '07', cycle: CYCLE });
  assert.deepEqual(race.candidates.map((item) => [item.candidateName, item.support, item.oppose]), [['DOE, JANE', 3500, 3000], ['ROE, RICHARD', 700, 0]]);
  assert.equal(race.total, 7200);
  assert.deepEqual(race.topSpenders.map((item) => [item.committeeName, item.total]), [['BETA PAC', 3700], ['ALPHA FUND', 3500]]);
});

test('a candidate with no outside spending gets zeros, not an error', { skip: !testDatabaseUrl }, async () => {
  const result = await getCandidateOutsideSpending(db, 'H0ZZ00000', CYCLE);
  assert.equal(result.total, 0);
  assert.deepEqual(result.bySpender, []);
  assert.equal(result.coverage.latestExpenditureDate, null);
});
