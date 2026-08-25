import { describe, it, expect } from 'vitest';
import { NOTHING_SAVED, saveRollCall, type SaveProgress } from './saveRollCall';
import { FakeSheet } from '../infra/fakeSheet';
import { beginRollCall, mark } from '../domain/rollCall';
import type { Session } from '../domain/session';
import type { Group, Student } from '../domain/group';
import type { SheetGateway } from '../infra/sheetGateway';

const session: Session = { id: 'sess1', groupId: 'g1', takenAt: '2026-08-26T09:05:00+08:00' };
const students: Student[] = [
  { id: 's1', name: 'Ana' },
  { id: 's2', name: 'Ben' },
];
const group: Group = { id: 'g1', name: '3A', studentIds: ['s1', 's2'] };

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

const run = async (sheet: SheetGateway, progress: SaveProgress) => {
  let latest = progress;
  await saveRollCall(sheet, marked(), progress, (next) => (latest = next));
  return latest;
};

describe('saveRollCall', () => {
  it('writes the records and the session', async () => {
    const sheet = new FakeSheet();
    await run(sheet, NOTHING_SAVED);

    expect(await sheet.listAttendance()).toHaveLength(2);
    expect(await sheet.listSessions()).toEqual([session]);
  });

  it('writes the records before the session', async () => {
    const sheet = new SessionWriteFails();
    await expect(run(sheet, NOTHING_SAVED)).rejects.toThrow('network lost');

    // Points survive a half-finished save; the missing Session row does not
    // cost the class anything.
    expect(await sheet.listAttendance()).toHaveLength(2);
    expect(await sheet.listSessions()).toEqual([]);
  });

  it('reports the records as saved even when the session write fails', async () => {
    let latest = NOTHING_SAVED;
    await expect(
      saveRollCall(new SessionWriteFails(), marked(), NOTHING_SAVED, (next) => (latest = next)),
    ).rejects.toThrow();
    expect(latest).toEqual({ recordsSaved: true });
  });

  it('does not write the records twice when a retry finishes the job', async () => {
    const sheet = new FakeSheet();
    await sheet.appendAttendance([]); // no-op, keeps the sheet shape explicit
    await run(sheet, { recordsSaved: true });

    expect(await sheet.listAttendance()).toEqual([]);
    expect(await sheet.listSessions()).toEqual([session]);
  });

  it('a full retry after a failed session write saves each student once', async () => {
    const sheet = new FakeSheet();
    const failing = new SessionWriteFails();
    let progress = NOTHING_SAVED;
    await expect(
      saveRollCall(failing, marked(), progress, (next) => (progress = next)),
    ).rejects.toThrow();

    // The teacher taps Save again; the same roll call, now against a working
    // connection, must not append a second set of records.
    await saveRollCall(sheet, marked(), progress, (next) => (progress = next));
    expect(await sheet.listAttendance()).toEqual([]);
    expect(await sheet.listSessions()).toEqual([session]);
  });
});
