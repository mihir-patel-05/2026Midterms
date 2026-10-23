import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { prunePrimaryLosers } from './primary-pruning.service.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
// A cycle no real sync uses, so the test never touches real rows.
const CYCLE = 2092;
const NOMINEE = 'H2ZZ01001';
const LOSER = 'H2ZZ01002';
const UNDECIDED = 'H2ZZ02001';
const OTHER_YEAR_SENATOR = 'S2ZZ00001';
const ids = [NOMINEE, LOSER, UNDECIDED, OTHER_YEAR_SENATOR];
let db: PrismaClient;

async function cleanUp(): Promise<void> {
  const committees = { committeeId: { startsWith: 'CZZ' } };
  await db.receipt.deleteMany({ where: committees });
  await db.disbursement.deleteMany({ where: committees });
  await db.financialSummary.deleteMany({ where: committees });
  await db.committee.deleteMany({ where: committees });
  await db.candidateElection.deleteMany({ where: { candidateId: { in: ids } } });
  await db.election.deleteMany({ where: { cycle: CYCLE } });
  await db.candidateFinancial.deleteMany({ where: { candidateId: { in: ids } } });
  await db.candidate.deleteMany({ where: { candidateId: { in: ids } } });
}

before(async () => {
  if (!testDatabaseUrl) return;
  db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  await cleanUp();

  // CA has 52 seats, so districts 01 and 02 are real. State ZZ would not be.
  const house = (candidateId: string, district: string) => ({
    candidateId, name: candidateId, office: 'H', state: 'CA', district, cycles: [CYCLE], electionYears: [CYCLE],
  });
  await db.candidate.createMany({
    data: [
      house(NOMINEE, '01'),
      house(LOSER, '01'),
      house(UNDECIDED, '02'),
      // Elected in another year: lists the cycle for fundraising, not as an election year.
      { candidateId: OTHER_YEAR_SENATOR, name: 'SENATOR', office: 'S', state: 'CA', cycles: [CYCLE], electionYears: [CYCLE + 2] },
    ],
  });
  await db.candidateFinancial.createMany({ data: ids.map((candidateId) => ({ candidateId, cycle: CYCLE, receipts: 100 })) });
  await db.committee.createMany({
    data: [
      { committeeId: 'CZZ0001', name: 'NOMINEE FOR CONGRESS', candidateId: NOMINEE },
      { committeeId: 'CZZ0002', name: 'LOSER FOR CONGRESS', candidateId: LOSER },
    ],
  });
  const itemized = (committeeId: string) => ({ committeeId, cycle: CYCLE });
  await db.receipt.createMany({
    data: [
      { ...itemized('CZZ0001'), contributionReceiptAmount: 10 },
      { ...itemized('CZZ0002'), contributionReceiptAmount: 20 },
      { ...itemized('CZZ0002'), contributionReceiptAmount: 30 },
    ],
  });
  await db.disbursement.create({ data: { ...itemized('CZZ0002'), disbursementAmount: 5 } });
  await db.financialSummary.create({ data: { committeeId: 'CZZ0002', cycle: CYCLE } });
  const election = await db.election.create({
    data: { state: 'CA', district: '01', officeType: 'HOUSE', electionType: 'GENERAL', cycle: CYCLE, electionDate: new Date('2092-11-04') },
  });
  await db.candidateElection.createMany({
    data: [NOMINEE, LOSER].map((candidateId) => ({ candidateId, electionId: election.id, result: 'PENDING' })),
  });
});

after(async () => {
  if (!testDatabaseUrl) return;
  await cleanUp();
  await db.$disconnect();
});

test('a dry run counts what would go and deletes nothing', { skip: !testDatabaseUrl }, async () => {
  const result = await prunePrimaryLosers(CYCLE, new Set([NOMINEE]), { apply: false, db });
  assert.deepEqual(result.dropped.map((candidate) => candidate.candidateId), [LOSER]);
  assert.deepEqual(result.kept.map((candidate) => candidate.candidateId), [NOMINEE]);
  assert.deepEqual(result.deleted, { candidates: 1, committees: 1, receipts: 2, disbursements: 1 });
  assert.equal(await db.candidate.count({ where: { candidateId: { in: ids } } }), 4);
  assert.equal(await db.receipt.count({ where: { committeeId: 'CZZ0002' } }), 2);
});

test('applying deletes the loser and everything tied to them, and only that', { skip: !testDatabaseUrl }, async () => {
  const result = await prunePrimaryLosers(CYCLE, new Set([NOMINEE]), { apply: true, db });
  assert.deepEqual(result.deleted, { candidates: 1, committees: 1, receipts: 2, disbursements: 1 });

  const remaining = await db.candidate.findMany({ where: { candidateId: { in: ids } }, select: { candidateId: true } });
  assert.deepEqual(remaining.map((row) => row.candidateId).sort(), [NOMINEE, UNDECIDED, OTHER_YEAR_SENATOR].sort());
  assert.equal(await db.committee.count({ where: { committeeId: 'CZZ0002' } }), 0);
  assert.equal(await db.financialSummary.count({ where: { committeeId: 'CZZ0002' } }), 0);
  assert.equal(await db.candidateFinancial.count({ where: { candidateId: LOSER } }), 0);
  assert.equal(await db.candidateElection.count({ where: { candidateId: LOSER } }), 0);
  assert.equal(await db.receipt.count({ where: { committeeId: 'CZZ0001' } }), 1);
  assert.equal(await db.candidateElection.count({ where: { candidateId: NOMINEE } }), 1);

  const again = await prunePrimaryLosers(CYCLE, new Set([NOMINEE]), { apply: true, db });
  assert.equal(again.deleted.candidates, 0);
});
