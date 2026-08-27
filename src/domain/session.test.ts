import { describe, it, expect } from 'vitest';
import { recordAttendance, type Session } from './session';

const session: Session = { id: 'sess1', groupId: 'g1', takenAt: '2026-08-25T09:05:00+08:00' };

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
