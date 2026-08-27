import { describe, it, expect } from 'vitest';
import { writeRollCall } from './writeRollCall';
import { FakeSheet } from './fakeSheet';
import { beginRollCall, mark } from '../domain/rollCall';
import type { Session } from '../domain/session';
import type { Group, Student } from '../domain/group';
import { SUMMARY_TAB } from './rows';

const SCORE = SUMMARY_TAB.header.indexOf('Score');

const session: Session = { id: 'sess1', groupId: 'G1', takenAt: '2026-08-26T09:05:00+08:00' };
const students: Student[] = [
  { id: 's1', name: 'Ana' },
  { id: 's2', name: 'Ben' },
];
const group: Group = { id: 'G1', name: '3A', studentIds: ['s1', 's2'] };

const marked = () => {
  const started = beginRollCall(session, group, students);
  return mark(mark(started, 's1', 'present'), 's2', 'sick', 'flu');
};

/** A sheet whose Session write always fails, standing in for a token that died
    between the two calls. */
class SessionWriteFails extends FakeSheet {
  override appendSession(): Promise<void> {
    return Promise.reject(new Error('network lost'));
  }
}

/** A sheet that has the records and the session, but died before the Summary. */
class SummaryWriteFails extends FakeSheet {
  override saveStudentSummaries(): Promise<void> {
    return Promise.reject(new Error('network lost'));
  }
}

describe('writeRollCall', () => {
  it('writes the records and the session', async () => {
    const sheet = new FakeSheet();
    await writeRollCall(sheet, marked(), await sheet.read());

    expect((await sheet.read()).ledger.attendance).toHaveLength(2);
    expect((await sheet.read()).sessions).toEqual([session]);
  });

  it('works the Summary out from the roll call it is saving, not from the Sheet', async () => {
    const sheet = new FakeSheet({ students });
    await writeRollCall(sheet, marked(), await sheet.read());

    // Ana was present, so her point is awarded and her Score is 1. Ben was
    // sick, so his point is held and scores nothing yet. Neither figure is on
    // the Sheet when the write begins.
    const rows = await sheet.rowsForTest('Summary');
    expect(rows[1]?.[SCORE]).toBe('1');
    expect(rows[2]?.[SCORE]).toBe('0');

    // The Note is filed under the day the Session was taken, not the day it
    // was saved.
    expect((await sheet.read()).notes.get('s2')).toEqual(['2026-08-26: flu']);
  });

  it('writes the records before the session', async () => {
    const sheet = new SessionWriteFails();
    await expect(writeRollCall(sheet, marked(), await sheet.read())).rejects.toThrow(
      'network lost',
    );

    // Points survive a half-finished save; the missing Session row does not
    // cost the class anything.
    expect((await sheet.read()).ledger.attendance).toHaveLength(2);
    expect((await sheet.read()).sessions).toEqual([]);
  });

  it('a retry after a failed session write saves each student once', async () => {
    const sheet = new SessionWriteFails();
    await expect(writeRollCall(sheet, marked(), await sheet.read())).rejects.toThrow();

    // The teacher taps Save again. What already landed is read back from the
    // Sheet, so the records are not appended a second time.
    const working = new FakeSheet({ attendance: [...(await sheet.read()).ledger.attendance] });
    await writeRollCall(working, marked(), await working.read());

    expect((await working.read()).ledger.attendance).toHaveLength(2);
    expect((await working.read()).sessions).toEqual([session]);
  });

  it('a retry after a failed summary write adds no second session row', async () => {
    const sheet = new SummaryWriteFails();
    await expect(writeRollCall(sheet, marked(), await sheet.read())).rejects.toThrow();

    const working = new FakeSheet({
      attendance: [...(await sheet.read()).ledger.attendance],
      sessions: [...(await sheet.read()).sessions],
    });
    await writeRollCall(working, marked(), await working.read());

    expect((await working.read()).ledger.attendance).toHaveLength(2);
    expect((await working.read()).sessions).toEqual([session]);
  });

  it('writing the same roll call twice changes nothing', async () => {
    const sheet = new FakeSheet();
    await writeRollCall(sheet, marked(), await sheet.read());
    await writeRollCall(sheet, marked(), await sheet.read());

    expect((await sheet.read()).ledger.attendance).toHaveLength(2);
    expect((await sheet.read()).sessions).toEqual([session]);
  });
});
