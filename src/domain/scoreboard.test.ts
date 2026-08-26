import { describe, it, expect } from 'vitest';
import { scoreboard } from './scoreboard';
import { EMPTY_LEDGER } from './score';
import type { Student } from './group';
import type { AttendanceRecord } from './session';
import type { BehaviorPoint } from './behavior';

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

describe('scoreboard', () => {
  it('lists the highest score first', () => {
    const entries = scoreboard(
      students,
      { attendance: [present('s1'), present('s3')], behavior: [behavior('s3', 'positive')] },
      new Map(),
    );
    expect(entries.map((entry) => entry.name)).toEqual(['Ben', 'Cara', 'Ana']);
    expect(entries[0]?.score).toBe(2);
  });

  it('breaks ties alphabetically so the order is stable', () => {
    expect(scoreboard(students, EMPTY_LEDGER, new Map()).map((entry) => entry.name)).toEqual([
      'Ana',
      'Ben',
      'Cara',
    ]);
  });

  it('includes a student with nothing recorded, on zero', () => {
    expect(scoreboard(students, EMPTY_LEDGER, new Map())).toHaveLength(3);
  });

  it('shows a negative score rather than hiding it at zero', () => {
    const entries = scoreboard(
      students,
      { attendance: [], behavior: [behavior('s2', 'negative')] },
      new Map(),
    );
    expect(entries.at(-1)).toEqual({ studentId: 's2', name: 'Ana', score: -1 });
  });

  it('counts the points the teacher adjusted in the sheet', () => {
    // The class sees the same Score the Summary tab shows, or the app looks
    // like it has lost points.
    const carriedIn = { points: 10, counts: { present: 0, absent: 0, sick: 0, other: 0 } };
    const entries = scoreboard(students, EMPTY_LEDGER, new Map([['s2', carriedIn]]));
    expect(entries[0]).toEqual({ studentId: 's2', name: 'Ana', score: 10 });
  });

  it('carries only name and score, nothing from the notes', () => {
    const entries = scoreboard(students, { attendance: [present('s1')], behavior: [] }, new Map());
    expect(Object.keys(entries[0] ?? {})).toEqual(['studentId', 'name', 'score']);
  });
});
