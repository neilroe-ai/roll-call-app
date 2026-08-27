import { describe, expect, it } from 'vitest';
import { writeHeldPoint } from './writeHeldPoint';
import { FakeSheet } from './fakeSheet';
import type { AttendanceRecord, Session } from '../domain/session';

const SESSION: Session = { id: 'sess1', groupId: 'G1', takenAt: '2026-08-24T09:00:00+08:00' };
const HELD: AttendanceRecord = {
  sessionId: 'sess1',
  studentId: 's1',
  status: 'sick',
  pointState: 'held',
  note: 'flu',
};

const seed = () => ({
  students: [{ id: 's1', name: 'Ana' }],
  sessions: [SESSION],
  attendance: [HELD],
});

const stateOf = async (sheet: FakeSheet) => (await sheet.read()).ledger.attendance[0]?.pointState;

/** A sheet that settles the point but dies before the Summary. */
class SummaryWriteFails extends FakeSheet {
  override saveStudentSummaries(): Promise<void> {
    return Promise.reject(new Error('network lost'));
  }
}

describe('writeHeldPoint', () => {
  it('settles the point', async () => {
    const sheet = new FakeSheet(seed());
    await writeHeldPoint(sheet, 'sess1', 's1', 'awarded', []);

    expect(await stateOf(sheet)).toBe('awarded');
  });

  it('writes the point state before the summary', async () => {
    const sheet = new SummaryWriteFails(seed());
    await expect(writeHeldPoint(sheet, 'sess1', 's1', 'awarded', [])).rejects.toThrow(
      'network lost',
    );

    // The decision survives; the Summary is only stale, and every figure on it
    // is worked out from the Points Ledger anyway.
    expect(await stateOf(sheet)).toBe('awarded');
  });

  it('leaves the same Sheet however often it is written', async () => {
    const sheet = new FakeSheet(seed());
    await writeHeldPoint(sheet, 'sess1', 's1', 'denied', []);
    await writeHeldPoint(sheet, 'sess1', 's1', 'denied', []);

    expect((await sheet.read()).ledger.attendance).toHaveLength(1);
    expect(await stateOf(sheet)).toBe('denied');
  });

  it('says so when there is no such record', async () => {
    const sheet = new FakeSheet(seed());

    await expect(writeHeldPoint(sheet, 'sess1', 'nobody', 'awarded', [])).rejects.toThrow(
      'no attendance record for nobody in sess1',
    );
    // Nothing was written, so the Summary was never touched either.
    expect(await stateOf(sheet)).toBe('held');
  });
});
