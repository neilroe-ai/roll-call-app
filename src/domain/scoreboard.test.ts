import { describe, it, expect } from 'vitest';
import { scoreboardBlocks, scoreboardOf } from './scoreboard';
import { EMPTY_LEDGER, type PointsLedger } from './score';
import type { Group, Student } from './group';
import { adjustmentKey, type Adjustment } from './adjustment';
import type { Snapshot } from './snapshot';
import type { AttendanceRecord } from './session';
import type { BehaviorPoint } from './behavior';
import { summarize, type StudentSummary } from './studentSummary';

const students: Student[] = [
  { id: 's1', name: 'Cara' },
  { id: 's2', name: 'Ana' },
  { id: 's3', name: 'Ben' },
];

const CLASS: Group = { id: 'G1', name: 'Class 01', studentIds: ['s1', 's2', 's3'] };
const READING: Group = { id: 'G2', name: 'Reading', studentIds: ['s1'] };

const present = (studentId: string, sessionId = 'sess1'): AttendanceRecord => ({
  sessionId,
  studentId,
  status: 'present',
  pointState: 'awarded',
});

const behavior = (
  studentId: string,
  kind: BehaviorPoint['kind'],
  groupId = 'G1',
): BehaviorPoint => ({
  id: `b-${studentId}-${groupId}`,
  studentId,
  groupId,
  date: '2026-08-26',
  kind,
});

function summariesOf(
  ledger: PointsLedger = EMPTY_LEDGER,
  adjustments: ReadonlyMap<string, Adjustment> = new Map(),
): StudentSummary[] {
  const snapshot: Snapshot = {
    students,
    groups: [CLASS, READING],
    sessions: [
      { id: 'sess1', groupId: 'G1', takenAt: '2026-08-26T09:00:00+08:00' },
      { id: 'read1', groupId: 'G2', takenAt: '2026-08-26T15:00:00+08:00' },
    ],
    ledger,
    adjustments,
    notes: new Map(),
  };
  return summarize(snapshot);
}

describe('scoreboardOf', () => {
  it('lists the highest score first', () => {
    const entries = scoreboardOf(
      summariesOf({
        attendance: [present('s1'), present('s3')],
        behavior: [behavior('s3', 'positive')],
      }),
      CLASS,
    );
    expect(entries.map((entry) => entry.name)).toEqual(['Ben', 'Cara', 'Ana']);
    expect(entries[0]?.score).toBe(2);
  });

  it('breaks ties alphabetically so the order is stable', () => {
    expect(scoreboardOf(summariesOf(), CLASS).map((entry) => entry.name)).toEqual([
      'Ana',
      'Ben',
      'Cara',
    ]);
  });

  it('includes a student with nothing recorded, on zero', () => {
    expect(scoreboardOf(summariesOf(), CLASS)).toHaveLength(3);
  });

  it('shows a negative score rather than hiding it at zero', () => {
    const entries = scoreboardOf(
      summariesOf({ attendance: [], behavior: [behavior('s2', 'negative')] }),
      CLASS,
    );
    expect(entries.at(-1)).toEqual({ studentId: 's2', name: 'Ana', score: -1 });
  });

  it('counts the points the teacher adjusted in the sheet', () => {
    // The class sees the same Score the Summary tab shows, or the app looks
    // like it has lost points.
    const carriedIn = { points: 10, counts: { present: 0, absent: 0, sick: 0, other: 0 } };
    const entries = scoreboardOf(
      summariesOf(EMPTY_LEDGER, new Map([[adjustmentKey('s2', 'G1'), carriedIn]])),
      CLASS,
    );
    expect(entries[0]).toEqual({ studentId: 's2', name: 'Ana', score: 10 });
  });

  it('carries only name and score, nothing from the notes', () => {
    const entries = scoreboardOf(summariesOf({ attendance: [present('s1')], behavior: [] }), CLASS);
    expect(Object.keys(entries[0] ?? {})).toEqual(['studentId', 'name', 'score']);
  });

  it('keeps only the members of the group', () => {
    expect(scoreboardOf(summariesOf(), READING).map((entry) => entry.name)).toEqual(['Cara']);
  });

  it('keeps the points of each group apart', () => {
    const summaries = summariesOf({
      attendance: [present('s1'), present('s1', 'read1')],
      behavior: [behavior('s1', 'positive', 'G2')],
    });
    expect(scoreboardOf(summaries, CLASS)[0]).toEqual({ studentId: 's1', name: 'Cara', score: 1 });
    expect(scoreboardOf(summaries, READING)).toEqual([{ studentId: 's1', name: 'Cara', score: 2 }]);
  });
});

describe('scoreboardBlocks', () => {
  const groups = [
    { id: 'G1', name: 'Class 01', studentIds: ['s1', 's3'] },
    { id: 'G2', name: 'Empty', studentIds: [] },
    { id: 'G3', name: 'Reading', studentIds: ['s2'] },
  ];
  const summaries = summarize({
    students,
    groups,
    sessions: [],
    ledger: EMPTY_LEDGER,
    adjustments: new Map([
      [
        adjustmentKey('s1', 'G1'),
        { points: 2, counts: { present: 0, absent: 0, sick: 0, other: 0 } },
      ],
      [
        adjustmentKey('s3', 'G1'),
        { points: 5, counts: { present: 0, absent: 0, sick: 0, other: 0 } },
      ],
    ]),
    notes: new Map(),
  });

  it('is one list per group in grid order, with no list for everyone', () => {
    expect(scoreboardBlocks(summaries, groups).map((block) => block.title)).toEqual([
      'Class 01',
      'Reading',
    ]);
  });

  it('ranks each list highest first', () => {
    const [class01] = scoreboardBlocks(summaries, groups);
    expect(class01?.entries.map((entry) => entry.name)).toEqual(['Ben', 'Cara']);
  });

  it('has no lists when there are no groups', () => {
    expect(scoreboardBlocks(summaries, [])).toHaveLength(0);
  });
});
