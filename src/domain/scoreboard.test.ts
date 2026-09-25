import { describe, it, expect } from 'vitest';
import { scoreboard, scoreboardBlocks, scoreboardOf } from './scoreboard';
import { EMPTY_LEDGER, type PointsLedger } from './score';
import type { Student } from './group';
import type { Adjustment } from './adjustment';
import type { Snapshot } from './snapshot';
import type { AttendanceRecord } from './session';
import type { BehaviorPoint } from './behavior';
import type { StudentSummary } from './studentSummary';

const students: Student[] = [
  { id: 's1', name: 'Cara' },
  { id: 's2', name: 'Ana' },
  { id: 's3', name: 'Ben' },
];

const present = (studentId: string): AttendanceRecord => ({
  sessionId: 'sess1',
  studentId,
  status: 'present',
  pointState: 'awarded',
});

const behavior = (studentId: string, kind: BehaviorPoint['kind']): BehaviorPoint => ({
  id: `b-${studentId}`,
  studentId,
  date: '2026-08-26',
  kind,
});

function snapshotOf(
  ledger: PointsLedger = EMPTY_LEDGER,
  adjustments: ReadonlyMap<string, Adjustment> = new Map(),
): Snapshot {
  return {
    students,
    groups: [],
    sessions: [],
    ledger,
    adjustments,
    notes: new Map(),
  };
}

describe('scoreboard', () => {
  it('lists the highest score first', () => {
    const entries = scoreboard(
      snapshotOf({
        attendance: [present('s1'), present('s3')],
        behavior: [behavior('s3', 'positive')],
      }),
    );
    expect(entries.map((entry) => entry.name)).toEqual(['Ben', 'Cara', 'Ana']);
    expect(entries[0]?.score).toBe(2);
  });

  it('breaks ties alphabetically so the order is stable', () => {
    expect(scoreboard(snapshotOf()).map((entry) => entry.name)).toEqual(['Ana', 'Ben', 'Cara']);
  });

  it('includes a student with nothing recorded, on zero', () => {
    expect(scoreboard(snapshotOf())).toHaveLength(3);
  });

  it('shows a negative score rather than hiding it at zero', () => {
    const entries = scoreboard(
      snapshotOf({ attendance: [], behavior: [behavior('s2', 'negative')] }),
    );
    expect(entries.at(-1)).toEqual({ studentId: 's2', name: 'Ana', score: -1 });
  });

  it('counts the points the teacher adjusted in the sheet', () => {
    // The class sees the same Score the Summary tab shows, or the app looks
    // like it has lost points.
    const carriedIn = { points: 10, counts: { present: 0, absent: 0, sick: 0, other: 0 } };
    const entries = scoreboard(snapshotOf(EMPTY_LEDGER, new Map([['s2', carriedIn]])));
    expect(entries[0]).toEqual({ studentId: 's2', name: 'Ana', score: 10 });
  });

  it('carries only name and score, nothing from the notes', () => {
    const entries = scoreboard(snapshotOf({ attendance: [present('s1')], behavior: [] }));
    expect(Object.keys(entries[0] ?? {})).toEqual(['studentId', 'name', 'score']);
  });
});

describe('scoreboardOf', () => {
  const entries = [
    { studentId: 's1', name: 'Ana', score: 5 },
    { studentId: 's2', name: 'Ben', score: 3 },
    { studentId: 's3', name: 'Cara', score: 1 },
  ];

  it('is everyone when no group is picked', () => {
    expect(scoreboardOf(entries, undefined)).toEqual(entries);
  });

  it('keeps only the members of the group, in scoreboard order', () => {
    const group = { id: 'G1', name: 'Class 01', studentIds: ['s3', 's1'] };
    expect(scoreboardOf(entries, group).map((entry) => entry.name)).toEqual(['Ana', 'Cara']);
  });
});

describe('scoreboardBlocks', () => {
  const summary = (studentId: string, name: string, score: number) =>
    ({ studentId, name, score }) as StudentSummary;
  const summaries = [summary('s1', 'Cara', 2), summary('s2', 'Ana', 5), summary('s3', 'Ben', 5)];
  const groups = [
    { id: 'G1', name: 'Class 01', studentIds: ['s1', 's3'] },
    { id: 'G2', name: 'Empty', studentIds: [] },
    { id: 'G3', name: 'Reading', studentIds: ['s2'] },
  ];

  it('puts everyone first, then each group in grid order', () => {
    expect(scoreboardBlocks(summaries, groups).map((block) => block.title)).toEqual([
      'Everyone',
      'Class 01',
      'Reading',
    ]);
  });

  it('ranks each list highest first, ties alphabetical', () => {
    const [everyone, class01] = scoreboardBlocks(summaries, groups);
    expect(everyone?.entries.map((entry) => entry.name)).toEqual(['Ana', 'Ben', 'Cara']);
    expect(class01?.entries.map((entry) => entry.name)).toEqual(['Ben', 'Cara']);
  });

  it('is only the everyone list when there are no groups', () => {
    expect(scoreboardBlocks(summaries, [])).toHaveLength(1);
  });
});
