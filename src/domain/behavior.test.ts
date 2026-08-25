import { describe, it, expect } from 'vitest';
import { calendarDateOf } from './behavior';

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
