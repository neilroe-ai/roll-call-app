import { describe, it, expect } from 'vitest';
import { scoreboard } from './scoreboard';
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
      [present('s1'), present('s3')],
      [behavior('s3', 'positive')],
    );
    expect(entries.map((entry) => entry.name)).toEqual(['Ben', 'Cara', 'Ana']);
    expect(entries[0]?.score).toBe(2);
  });

  it('breaks ties alphabetically so the order is stable', () => {
    expect(scoreboard(students, [], []).map((entry) => entry.name)).toEqual(['Ana', 'Ben', 'Cara']);
  });

  it('includes a student with nothing recorded, on zero', () => {
    expect(scoreboard(students, [], [])).toHaveLength(3);
  });

  it('shows a negative score rather than hiding it at zero', () => {
    const entries = scoreboard(students, [], [behavior('s2', 'negative')]);
    expect(entries.at(-1)).toEqual({ studentId: 's2', name: 'Ana', score: -1 });
  });

  it('carries only name and score, nothing from the notes', () => {
    const entries = scoreboard(students, [present('s1')], []);
    expect(Object.keys(entries[0] ?? {})).toEqual(['studentId', 'name', 'score']);
  });
});
