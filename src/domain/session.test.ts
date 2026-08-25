import { describe, it, expect } from 'vitest';
import { recordAttendance, unmarkedStudentIds, type Session } from './session';
import type { Group } from './roster';

const session: Session = { id: 'sess1', groupId: 'g1', takenAt: '2026-08-25T09:05:00+08:00' };
const group: Group = { id: 'g1', name: '3A', studentIds: ['s1', 's2', 's3'] };

describe('recordAttendance', () => {
  it('derives the point state from the status', () => {
    expect(recordAttendance(session, 's1', 'present').pointState).toBe('awarded');
    expect(recordAttendance(session, 's1', 'sick').pointState).toBe('held');
  });

  it('omits the note key when no note is given', () => {
    expect(recordAttendance(session, 's1', 'present')).not.toHaveProperty('note');
  });

  it('keeps the note when one is given', () => {
    expect(recordAttendance(session, 's1', 'other', 'dentist').note).toBe('dentist');
  });
});

describe('unmarkedStudentIds', () => {
  it('lists who is left, in group order', () => {
    const records = [recordAttendance(session, 's2', 'present')];
    expect(unmarkedStudentIds(group, records)).toEqual(['s1', 's3']);
  });

  it('is empty once everyone is marked', () => {
    const records = group.studentIds.map((id) => recordAttendance(session, id, 'present'));
    expect(unmarkedStudentIds(group, records)).toEqual([]);
  });
});
