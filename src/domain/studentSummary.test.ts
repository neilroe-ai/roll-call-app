import { describe, it, expect } from 'vitest';
import { sessionsFor, shareOf, summarize, countsFor, creditedFor } from './studentSummary';
import type { Group, Student } from './group';
import type { PointsLedger } from './score';
import type { AttendanceRecord, Session } from './session';
import { adjustmentKey, noAdjustment, type Adjustment } from './adjustment';
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
  behavior: [
    { id: 'b1', studentId: 's1', groupId: 'G1', date: '2026-08-25', kind: 'positive' },
  ] as BehaviorPoint[],
};

/** The one Group the ledger above was taken in. */
const CLASS: Group = { id: 'G1', name: 'Class 01', studentIds: ['s1', 's2'] };
const SESS1: Session = { id: 'sess1', groupId: 'G1', takenAt: '2026-08-25T09:00:00+08:00' };

describe('countsFor', () => {
  it('counts the sessions a student took each status in', () => {
    expect(countsFor('s1', ledger, noAdjustment())).toEqual({
      present: 2,
      absent: 0,
      sick: 1,
      other: 0,
    });
    expect(countsFor('s2', ledger, noAdjustment())).toEqual({
      present: 0,
      absent: 1,
      sick: 0,
      other: 1,
    });
  });

  it('is all zeros for a student with no records', () => {
    expect(countsFor('s9', ledger, noAdjustment())).toEqual({
      present: 0,
      absent: 0,
      sick: 0,
      other: 0,
    });
  });
});

describe('creditedFor', () => {
  it('credits the days present and nothing that is still held', () => {
    // s1: two present, one sick still waiting on the note.
    expect(creditedFor('s1', ledger, noAdjustment())).toBe(2);
  });

  it('credits a sick or other day once its held point is awarded', () => {
    const awarded: PointsLedger = {
      attendance: [record('s1', 'present', 'awarded'), record('s1', 'sick', 'awarded')],
      behavior: [],
    };
    expect(creditedFor('s1', awarded, noAdjustment())).toBe(2);
  });

  it('credits nothing for a denied day, sick or absent', () => {
    const denied: PointsLedger = {
      attendance: [record('s1', 'sick', 'denied'), record('s1', 'absent', 'denied')],
      behavior: [],
    };
    expect(creditedFor('s1', denied, noAdjustment())).toBe(0);
  });

  it('adds the attendance the teacher carried in, absences aside', () => {
    const carried: Adjustment = {
      points: 0,
      counts: { present: 10, absent: 4, sick: 2, other: 1 },
    };
    // 2 awarded in the ledger, plus 10 + 2 + 1 carried in.
    expect(creditedFor('s1', ledger, carried)).toBe(15);
  });
});

describe('summarize', () => {
  const existing = new Map([['s1', ['2026-08-25: forgot her book']]]);
  const input = (notes = existing, adjustments = new Map<string, Adjustment>()) => ({
    students,
    groups: [CLASS],
    sessions: [SESS1],
    ledger,
    adjustments,
    notes,
  });

  it('reports the score the ledger gives, held points included as zero', () => {
    const [ana, ben] = summarize(input());
    // Two awarded attendance points plus one positive behavior point; the held
    // sick point counts nothing yet.
    expect(ana?.groups[0]?.score).toBe(3);
    expect(ben?.groups[0]?.score).toBe(0);
  });

  it('keeps the points of each group apart, with no total across them', () => {
    const reading: Group = { id: 'G2', name: 'Reading', studentIds: ['s1'] };
    const read1: Session = { id: 'read1', groupId: 'G2', takenAt: '2026-08-25T15:00:00+08:00' };
    const [ana] = summarize({
      ...input(),
      groups: [CLASS, reading],
      sessions: [SESS1, read1],
      ledger: {
        attendance: [
          ...ledger.attendance,
          { sessionId: 'read1', studentId: 's1', status: 'present', pointState: 'awarded' },
        ],
        behavior: [
          ...ledger.behavior,
          { id: 'b2', studentId: 's1', groupId: 'G2', date: '2026-08-25', kind: 'negative' },
        ],
      },
    });
    expect(ana?.groups.map((figures) => [figures.groupName, figures.score])).toEqual([
      ['Class 01', 3],
      ['Reading', 0],
    ]);
    expect(ana?.groups[1]?.sessions).toBe(1);
    expect(ana?.groups[1]?.counts.present).toBe(1);
    expect(ana?.groups[1]?.credited).toBe(1);
  });

  it('carries the notes already in the sheet through untouched', () => {
    const [ana] = summarize(input());
    expect(ana?.notes).toEqual(['2026-08-25: forgot her book']);
  });

  it('adds a new note to the bottom of the list', () => {
    const [ana] = summarize(input(), {
      on: '2026-08-26',
      byStudent: new Map([['s1', 'sick note handed in']]),
    });
    expect(ana?.notes).toEqual(['2026-08-25: forgot her book', '2026-08-26: sick note handed in']);
  });

  it('starts a list for a student who had none', () => {
    const [, ben] = summarize(input(), {
      on: '2026-08-26',
      byStudent: new Map([['s2', 'left early']]),
    });
    expect(ben?.notes).toEqual(['2026-08-26: left early']);
  });

  it('adds nothing for a blank note', () => {
    const [, ben] = summarize(input(), {
      on: '2026-08-26',
      byStudent: new Map([['s2', '   ']]),
    });
    expect(ben?.notes).toEqual([]);
  });

  it('names every student, so the tab is rewritten row for row', () => {
    expect(summarize(input(new Map())).map((row) => row.name)).toEqual(['Ana', 'Ben']);
  });
});

describe('sessionsFor', () => {
  const sessions: Session[] = [
    { id: 'x1', groupId: 'g1', takenAt: '2026-08-24T09:00:00+08:00' },
    { id: 'x2', groupId: 'g1', takenAt: '2026-08-25T09:00:00+08:00' },
    { id: 'x3', groupId: 'g2', takenAt: '2026-08-25T14:00:00+08:00' },
  ];

  it('counts every session taken for the group', () => {
    expect(sessionsFor('g1', sessions, noAdjustment())).toBe(2);
    expect(sessionsFor('g2', sessions, noAdjustment())).toBe(1);
  });

  it('counts a session the student has no record for, not just the ones they were marked in', () => {
    // s2 was marked in one session out of the two their group took.
    const marked = 1;
    expect(shareOf(marked, sessionsFor('g1', sessions, noAdjustment()))).toBe(50);
  });

  it('is nothing for a group with no sessions', () => {
    expect(sessionsFor('g9', sessions, noAdjustment())).toBe(0);
  });
});

describe('shareOf', () => {
  it('rounds to a whole percent', () => {
    expect(shareOf(2, 3)).toBe(67);
    expect(shareOf(1, 3)).toBe(33);
  });

  it('is 0% with no sessions rather than a division by zero', () => {
    expect(shareOf(0, 0)).toBe(0);
  });
});

describe('adjustments', () => {
  const groups: Group[] = [{ id: 'G1', name: 'Class 01', studentIds: ['s1'] }];
  const inClass = (adjustment: Adjustment) => new Map([[adjustmentKey('s1', 'G1'), adjustment]]);
  const carriedIn: Adjustment = {
    points: 12,
    counts: { present: 18, absent: 2, sick: 0, other: 0 },
  };
  const input = (adjustments: Map<string, Adjustment>) => ({
    students,
    groups,
    sessions: [SESS1],
    ledger,
    adjustments,
    notes: new Map<string, string[]>(),
  });

  it('adds the points the teacher carried in from paper', () => {
    const [ana] = summarize(input(inClass(carriedIn)));
    // Three from the ledger, twelve she brought with her.
    expect(ana?.groups[0]?.score).toBe(15);
  });

  it('adds the attendance she carried in to the counts', () => {
    const [ana] = summarize(input(inClass(carriedIn)));
    expect(ana?.groups[0]?.counts).toEqual({ present: 20, absent: 2, sick: 1, other: 0 });
  });

  it('counts carried-in sessions in the denominator, so shares stay sane', () => {
    const [ana] = summarize(input(inClass(carriedIn)));
    // The app has taken one session; the other 20 came in on the adjustment.
    const figures = ana?.groups[0];
    expect(figures?.sessions).toBe(21);
    expect(shareOf(figures?.counts.present ?? 0, figures?.sessions ?? 0)).toBe(95);
  });

  it('leaves a student with no adjustment exactly as the ledger says', () => {
    const [ana] = summarize(input(new Map()));
    expect(ana?.groups[0]?.score).toBe(3);
    expect(ana?.groups[0]?.counts).toEqual({ present: 2, absent: 0, sick: 1, other: 0 });
  });

  it('takes points away when the teacher corrects downwards', () => {
    const down: Adjustment = { points: -2, counts: { present: 0, absent: 0, sick: 0, other: 0 } };
    const [ana] = summarize(input(inClass(down)));
    expect(ana?.groups[0]?.score).toBe(1);
  });

  it('gives a student figures for each group they belong to, and none for others', () => {
    const [ana, ben] = summarize(input(new Map()));
    expect(ana?.groups.map((figures) => figures.groupName)).toEqual(['Class 01']);
    expect(ben?.groups).toEqual([]);
  });

  it('counts an adjustment only in the group it was typed for', () => {
    const reading: Group = { id: 'G2', name: 'Reading', studentIds: ['s1'] };
    const [ana] = summarize({
      ...input(new Map([[adjustmentKey('s1', 'G2'), carriedIn]])),
      groups: [...groups, reading],
    });
    expect(ana?.groups.map((figures) => figures.score)).toEqual([3, 12]);
  });
});
