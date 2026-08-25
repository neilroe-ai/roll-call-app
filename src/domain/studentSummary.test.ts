import { describe, it, expect } from 'vitest';
import { noteEntry, sessionsCounted, shareOf, summarize, tallyFor } from './studentSummary';
import type { Student } from './group';
import type { PointsLedger } from './score';
import type { AttendanceRecord } from './session';
import type { BehaviorPoint } from './behavior';

const students: Student[] = [
  { id: 's1', name: 'Ana' },
  { id: 's2', name: 'Ben' },
];

const record = (
  studentId: string,
  status: AttendanceRecord['status'],
  pointState: AttendanceRecord['pointState'],
): AttendanceRecord => ({ sessionId: 'sess1', studentId, status, pointState });

const ledger: PointsLedger = {
  attendance: [
    record('s1', 'present', 'awarded'),
    record('s1', 'present', 'awarded'),
    record('s1', 'sick', 'held'),
    record('s2', 'absent', 'denied'),
    record('s2', 'other', 'held'),
  ],
  behavior: [{ id: 'b1', studentId: 's1', date: '2026-08-25', kind: 'positive' } as BehaviorPoint],
};

describe('tallyFor', () => {
  it('counts the sessions a student took each status in', () => {
    expect(tallyFor('s1', ledger)).toEqual({ present: 2, absent: 0, sick: 1, other: 0 });
    expect(tallyFor('s2', ledger)).toEqual({ present: 0, absent: 1, sick: 0, other: 1 });
  });

  it('is all zeros for a student with no records', () => {
    expect(tallyFor('s9', ledger)).toEqual({ present: 0, absent: 0, sick: 0, other: 0 });
  });
});

describe('noteEntry', () => {
  it('dates the note and trims it', () => {
    expect(noteEntry('2026-08-26', '  flu  ')).toBe('2026-08-26: flu');
  });
});

describe('summarize', () => {
  const existing = new Map([['s1', ['2026-08-25: forgot her book']]]);

  it('reports the score the ledger gives, held points included as zero', () => {
    const [ana, ben] = summarize(students, ledger, existing);
    // Two awarded attendance points plus one positive behavior point; the held
    // sick point counts nothing yet.
    expect(ana?.score).toBe(3);
    expect(ben?.score).toBe(0);
  });

  it('carries the notes already in the sheet through untouched', () => {
    const [ana] = summarize(students, ledger, existing);
    expect(ana?.notes).toEqual(['2026-08-25: forgot her book']);
  });

  it('adds a new note to the bottom of the list', () => {
    const [ana] = summarize(students, ledger, existing, {
      on: '2026-08-26',
      byStudent: new Map([['s1', 'sick note handed in']]),
    });
    expect(ana?.notes).toEqual(['2026-08-25: forgot her book', '2026-08-26: sick note handed in']);
  });

  it('starts a list for a student who had none', () => {
    const [, ben] = summarize(students, ledger, existing, {
      on: '2026-08-26',
      byStudent: new Map([['s2', 'left early']]),
    });
    expect(ben?.notes).toEqual(['2026-08-26: left early']);
  });

  it('adds nothing for a blank note', () => {
    const [, ben] = summarize(students, ledger, existing, {
      on: '2026-08-26',
      byStudent: new Map([['s2', '   ']]),
    });
    expect(ben?.notes).toEqual([]);
  });

  it('names every student, so the tab is rewritten row for row', () => {
    expect(summarize(students, ledger, new Map()).map((row) => row.name)).toEqual(['Ana', 'Ben']);
  });
});

describe('sessionsCounted and shareOf', () => {
  it('counts every session the student was given a status in', () => {
    expect(sessionsCounted(tallyFor('s1', ledger))).toBe(3);
  });

  it('works out the share of that student own sessions', () => {
    const tally = tallyFor('s1', ledger);
    const sessions = sessionsCounted(tally);
    expect(shareOf(tally.present, sessions)).toBe(67);
    expect(shareOf(tally.sick, sessions)).toBe(33);
  });

  it('is 0% for a student with no sessions rather than a division by zero', () => {
    expect(sessionsCounted(tallyFor('s9', ledger))).toBe(0);
    expect(shareOf(0, 0)).toBe(0);
  });
});
