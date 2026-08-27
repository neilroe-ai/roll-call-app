import { describe, it, expect } from 'vitest';
import { awardBehavior, calendarDateOf, signOf } from './behavior';

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
    expect(awardBehavior('b1', 's1', '2026-08-26', 'positive')).toEqual({
      id: 'b1',
      studentId: 's1',
      date: '2026-08-26',
      kind: 'positive',
    });
  });

  it('keeps the note the teacher wrote, trimmed', () => {
    expect(awardBehavior('b1', 's1', '2026-08-26', 'negative', '  threw a pen  ').note).toBe(
      'threw a pen',
    );
  });

  it('leaves a blank note off rather than storing an empty one', () => {
    expect(awardBehavior('b1', 's1', '2026-08-26', 'positive', '   ').note).toBeUndefined();
  });
});

describe('signOf', () => {
  it('signs the point the way the teacher reads it', () => {
    expect(signOf('positive')).toBe('+1');
    expect(signOf('negative')).toBe('-1');
  });
});
