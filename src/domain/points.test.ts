import { describe, it, expect } from 'vitest';
import { attendancePoints, behaviorPoints, initialPointState, resolveHeld } from './points';

describe('initialPointState', () => {
  it('present is awarded, absent is denied', () => {
    expect(initialPointState('present')).toBe('awarded');
    expect(initialPointState('absent')).toBe('denied');
  });

  it('sick and other are held pending documentation', () => {
    expect(initialPointState('sick')).toBe('held');
    expect(initialPointState('other')).toBe('held');
  });
});

describe('resolveHeld', () => {
  it('awards with documentation, denies without', () => {
    expect(resolveHeld(true)).toBe('awarded');
    expect(resolveHeld(false)).toBe('denied');
  });
});

describe('attendancePoints', () => {
  it('only an awarded point is worth 1', () => {
    expect(attendancePoints('awarded')).toBe(1);
    expect(attendancePoints('held')).toBe(0);
    expect(attendancePoints('denied')).toBe(0);
  });
});

describe('behaviorPoints', () => {
  it('positive is +1, negative is -1', () => {
    expect(behaviorPoints('positive')).toBe(1);
    expect(behaviorPoints('negative')).toBe(-1);
  });
});
