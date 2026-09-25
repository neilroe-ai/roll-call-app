import { describe, it, expect } from 'vitest';
import { awardBehavior, calendarDateOf, defaultBehaviorGroup, signOf } from './behavior';

describe('calendarDateOf', () => {
  it('uses the date where the teacher is, not the date in UTC', () => {
    // Midnight local time. In any timezone east or west of UTC this instant
    // falls on a different UTC date, which is what would misdate a note.
    const justAfterMidnight = new Date(2026, 7, 26, 0, 30);
    expect(calendarDateOf(justAfterMidnight)).toBe('2026-08-26');
  });

  it('pads the month and the day', () => {
    expect(calendarDateOf(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});

describe('awardBehavior', () => {
  it('records the kind against a student and a date', () => {
    expect(awardBehavior('b1', 's1', 'G1', '2026-08-26', 'positive')).toEqual({
      id: 'b1',
      studentId: 's1',
      groupId: 'G1',
      date: '2026-08-26',
      kind: 'positive',
    });
  });

  it('keeps the note the teacher wrote, trimmed', () => {
    expect(awardBehavior('b1', 's1', 'G1', '2026-08-26', 'negative', '  threw a pen  ').note).toBe(
      'threw a pen',
    );
  });

  it('leaves a blank note off rather than storing an empty one', () => {
    expect(awardBehavior('b1', 's1', 'G1', '2026-08-26', 'positive', '   ').note).toBeUndefined();
  });
});

describe('signOf', () => {
  it('signs the point the way the teacher reads it', () => {
    expect(signOf('positive')).toBe('+1');
    expect(signOf('negative')).toBe('-1');
  });
});

describe('defaultBehaviorGroup', () => {
  const CLASS = { id: 'G1', name: 'Class 01', studentIds: ['s1', 's2'] };
  const READING = { id: 'G2', name: 'Reading circle', studentIds: ['s1'] };
  const session = (id: string, groupId: string, takenAt: string) => ({ id, groupId, takenAt });

  it('is the group she last took roll for', () => {
    const sessions = [
      session('a', 'G2', '2026-08-24T15:00:00+08:00'),
      session('b', 'G1', '2026-08-25T09:00:00+08:00'),
    ];
    expect(defaultBehaviorGroup('s1', [CLASS, READING], sessions)?.id).toBe('G1');
  });

  it('skips a later roll call for a group the student is not in', () => {
    const sessions = [
      session('a', 'G2', '2026-08-24T15:00:00+08:00'),
      session('b', 'G1', '2026-08-25T09:00:00+08:00'),
    ];
    const other = { id: 'G1', name: 'Class 01', studentIds: ['s2'] };
    expect(defaultBehaviorGroup('s1', [other, READING], sessions)?.id).toBe('G2');
  });

  it('is the first of their groups before any roll call', () => {
    expect(defaultBehaviorGroup('s1', [CLASS, READING], [])?.id).toBe('G1');
  });

  it('is nothing for a student in no group', () => {
    expect(defaultBehaviorGroup('s9', [CLASS, READING], [])).toBeUndefined();
  });
});
