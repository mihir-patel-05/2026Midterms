import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyCommunication, normalizeIeDistrict, scheduleERow, type FECScheduleE } from './schedule-e.js';

test('descriptions are classified by medium, specific media before generic words', () => {
  const cases: Array<[string | null, string]> = [
    ['TV AD - CONTRAST', 'TV and video'],
    ['Television production and placement', 'TV and video'],
    ['CTV/OTT streaming buy', 'TV and video'],
    ['MEDIA BUY', 'TV and video'],
    ['Digital advertising', 'Digital'],
    ['Online ads - Facebook', 'Digital'],
    ['Web video', 'Digital'],
    ['Direct mail - printing and postage', 'Mail and print'],
    ['MAILER', 'Mail and print'],
    ['Radio ad', 'Radio'],
    ['Text messages', 'Phones and texts'],
    ['Phone banking', 'Phones and texts'],
    ['Canvassing', 'Field and canvassing'],
    ['GOTV door knocking', 'Field and canvassing'],
    ['Polling', 'Polling and research'],
    ['Production costs', 'Production and consulting'],
    ['Advertising', 'Other'],
    ['', 'Other'],
    [null, 'Other'],
  ];
  for (const [description, expected] of cases) assert.equal(classifyCommunication(description), expected, String(description));
});

test('House districts are two digits; other offices carry none', () => {
  assert.equal(normalizeIeDistrict('H', '7'), '07');
  assert.equal(normalizeIeDistrict('H', '00'), '00');
  assert.equal(normalizeIeDistrict('H', ''), null);
  assert.equal(normalizeIeDistrict('S', '01'), null);
});

const line: FECScheduleE = {
  sub_id: '4102320241234567890',
  committee_id: 'C00504530',
  committee: { name: 'CONGRESSIONAL LEADERSHIP FUND' },
  candidate_id: 'H6PA07123',
  candidate_name: 'DOE, JANE',
  candidate_office: 'H',
  candidate_office_state: 'pa',
  candidate_office_district: '7',
  support_oppose_indicator: 'o',
  expenditure_amount: 250000.004,
  expenditure_date: '2026-10-01T00:00:00',
  dissemination_date: '2026-10-02',
  expenditure_description: 'TV AD',
  payee_name: 'SMART MEDIA GROUP',
  is_notice: true,
  memo_code: null,
  filing_form: 'F24',
  transaction_id: 'SE.123',
  file_number: '1890001',
  pdf_url: 'https://docquery.fec.gov/pdf/123.pdf',
};

test('a Schedule E line becomes a normalized row', () => {
  const fetchedAt = new Date('2026-10-10T12:00:00Z');
  const row = scheduleERow(line, 2026, fetchedAt);
  assert(row);
  assert.equal(row.subId, '4102320241234567890');
  assert.equal(row.committeeName, 'CONGRESSIONAL LEADERSHIP FUND');
  assert.equal(row.candidateState, 'PA');
  assert.equal(row.candidateDistrict, '07');
  assert.equal(row.supportOppose, 'O');
  assert.equal(row.amount, 250000);
  assert.equal((row.expenditureDate as Date).toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(row.communicationType, 'TV and video');
  assert.equal(row.isNotice, true);
  assert.equal(row.isMemo, false);
  assert.equal(row.fileNumber, 1890001);
  assert.equal(row.cycle, 2026);
});

test('memo lines are flagged, and lines that cannot be counted are dropped', () => {
  assert.equal(scheduleERow({ ...line, memo_code: 'X' }, 2026, new Date())?.isMemo, true);
  assert.equal(scheduleERow({ ...line, committee: null, committee_name: 'FALLBACK PAC' }, 2026, new Date())?.committeeName, 'FALLBACK PAC');
  // An unsafe numeric ID falls back to the filing's file number and transaction ID.
  assert.equal(scheduleERow({ ...line, sub_id: 4102320241234567890 }, 2026, new Date())?.subId, 'f1890001:SE.123');
  assert.equal(scheduleERow({ ...line, sub_id: null, file_number: null }, 2026, new Date()), null);
  assert.equal(scheduleERow({ ...line, committee_id: '' }, 2026, new Date()), null);
  assert.equal(scheduleERow({ ...line, expenditure_amount: 'n/a' }, 2026, new Date()), null);
  assert.equal(scheduleERow({ ...line, support_oppose_indicator: null }, 2026, new Date()), null);
});
