import { describe, it, expect } from 'vitest';
import { FakeSheet } from './fakeSheet';
import { recordAttendance, type Session } from '../domain/session';
import { scoreFor } from '../domain/score';

const session: Session = { id: 'sess1', groupId: 'g1', takenAt: '2026-08-25T09:05:00+08:00' };

describe('FakeSheet', () => {
  it('starts empty apart from headers', async () => {
    const sheet = new FakeSheet();
    expect(await sheet.listStudents()).toEqual([]);
    expect(await sheet.listAttendance()).toEqual([]);
  });

  it('returns what was seeded', async () => {
    const sheet = new FakeSheet({
      students: [{ id: 's1', name: 'Ana' }],
      groups: [{ id: 'g1', name: '3A', studentIds: ['s1'] }],
    });
    expect(await sheet.listStudents()).toEqual([{ id: 's1', name: 'Ana' }]);
    expect((await sheet.listGroups())[0]?.studentIds).toEqual(['s1']);
  });

  it('reads back a batch of appended attendance', async () => {
    const sheet = new FakeSheet();
    await sheet.appendAttendance([
      recordAttendance(session, 's1', 'present'),
      recordAttendance(session, 's2', 'sick', 'flu'),
    ]);
    const records = await sheet.listAttendance();
    expect(records).toHaveLength(2);
    expect(records[1]?.note).toBe('flu');
  });

  it('resolves a held point in place, leaving the status alone', async () => {
    const sheet = new FakeSheet();
    await sheet.appendAttendance([recordAttendance(session, 's1', 'sick', 'flu')]);
    await sheet.setPointState('sess1', 's1', 'awarded');

    const record = (await sheet.listAttendance())[0];
    expect(record?.pointState).toBe('awarded');
    expect(record?.status).toBe('sick');
    expect(record?.note).toBe('flu');
  });

  it('rejects resolving a record that is not there', async () => {
    const sheet = new FakeSheet();
    await expect(sheet.setPointState('sess1', 's9', 'awarded')).rejects.toThrow(
      'no attendance record for s9 in sess1',
    );
  });

  it('feeds the domain: a resolved sick note raises the Score', async () => {
    const sheet = new FakeSheet();
    await sheet.appendAttendance([recordAttendance(session, 's1', 'sick', 'flu')]);
    await sheet.appendBehavior({
      id: 'b1',
      studentId: 's1',
      date: '2026-08-25',
      kind: 'positive',
    });

    const ledger = async () => ({
      attendance: await sheet.listAttendance(),
      behavior: await sheet.listBehavior(),
    });

    const before = scoreFor('s1', await ledger());
    await sheet.setPointState('sess1', 's1', 'awarded');
    const after = scoreFor('s1', await ledger());

    expect(before).toBe(1);
    expect(after).toBe(2);
  });

  it('appends sessions', async () => {
    const sheet = new FakeSheet();
    await sheet.appendSession(session);
    expect(await sheet.listSessions()).toEqual([session]);
  });
});
