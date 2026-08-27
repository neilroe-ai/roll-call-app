/**
 * The Notes Log: what a line says, and when a line is added at all. Every path
 * into a Student's log goes through here, so these are the only places those
 * two questions are answered.
 */
import { describe, expect, it } from 'vitest';
import { addLine, behaviorText, noteLine } from './notesLog';

describe('noteLine', () => {
  it('dates the note and trims it', () => {
    expect(noteLine('2026-08-26', '  flu  ')).toBe('2026-08-26: flu');
  });

  it('is no line at all when the teacher wrote nothing', () => {
    // She can open the field, think better of it and walk away.
    expect(noteLine('2026-08-26', '   ')).toBeUndefined();
    expect(noteLine('2026-08-26', '')).toBeUndefined();
    expect(noteLine('2026-08-26', undefined)).toBeUndefined();
  });
});

describe('behaviorText', () => {
  it('puts the sign in front of the note', () => {
    expect(behaviorText('positive', 'helped a classmate')).toBe('+1 helped a classmate');
    expect(behaviorText('negative', 'threw a pen')).toBe('-1 threw a pen');
  });

  it('is nothing at all when the point was never explained', () => {
    // The bare fact of the point is already in the Behavior tab.
    expect(behaviorText('positive', undefined)).toBeUndefined();
    expect(behaviorText('negative', '  ')).toBeUndefined();
  });
});

describe('addLine', () => {
  it('adds to the bottom, keeping what is already there', () => {
    expect(addLine(['2026-08-25: late'], '2026-08-26: late again')).toEqual([
      '2026-08-25: late',
      '2026-08-26: late again',
    ]);
  });

  it('leaves the log exactly as it was when there is no line', () => {
    const log = ['2026-08-25: late'];
    expect(addLine(log, undefined)).toEqual(log);
  });

  it('never rewrites or removes what is already written', () => {
    const log = ['2026-08-25: late'];
    addLine(log, '2026-08-26: late again');
    expect(log).toEqual(['2026-08-25: late']);
  });
});
