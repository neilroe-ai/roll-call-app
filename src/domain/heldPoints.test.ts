import { describe, expect, it } from 'vitest';
import { heldPoints } from './heldPoints';
import { EMPTY_LEDGER, type PointsLedger } from './score';
import type { Snapshot } from './snapshot';
import type { AttendanceRecord, Session } from './session';

const STUDENTS = [
  { id: 's1', name: 'Ana' },
  { id: 's2', name: 'Ben' },
];

const SESSIONS: Session[] = [
  { id: 'later', groupId: 'G1', takenAt: '2026-08-26T09:00:00+08:00' },
  { id: 'earlier', groupId: 'G1', takenAt: '2026-08-24T09:00:00+08:00' },
];

function record(
  sessionId: string,
  studentId: string,
  extra: Partial<AttendanceRecord> = {},
): AttendanceRecord {
  return { sessionId, studentId, status: 'sick', pointState: 'held', ...extra };
}

function snapshotOf(attendance: AttendanceRecord[], sessions = SESSIONS): Snapshot {
  const ledger: PointsLedger = { ...EMPTY_LEDGER, attendance };
  return {
    students: STUDENTS,
    groups: [],
    sessions,
    ledger,
    adjustments: new Map(),
    notes: new Map(),
  };
}

describe('heldPoints', () => {
  it('lists only the points still held', () => {
    const held = heldPoints(
      snapshotOf([
        record('later', 's1', { status: 'present', pointState: 'awarded' }),
        record('later', 's2'),
        record('earlier', 's1', { status: 'absent', pointState: 'denied' }),
      ]),
    );

    expect(held.map((point) => point.studentId)).toEqual(['s2']);
  });

  it('carries who, when, what was marked and what she wrote', () => {
    const held = heldPoints(
      snapshotOf([record('earlier', 's1', { status: 'other', note: 'court' })]),
    );

    expect(held).toEqual([
      {
        sessionId: 'earlier',
        studentId: 's1',
        studentName: 'Ana',
        status: 'other',
        on: '2026-08-24',
        note: 'court',
      },
    ]);
  });

  it('puts the longest wait first', () => {
    const held = heldPoints(snapshotOf([record('later', 's1'), record('earlier', 's2')]));

    expect(held.map((point) => point.on)).toEqual(['2026-08-24', '2026-08-26']);
  });

  it('still shows a point whose Session row never landed, last and undated', () => {
    const held = heldPoints(snapshotOf([record('missing', 's1'), record('earlier', 's2')]));

    expect(held.map((point) => point.sessionId)).toEqual(['earlier', 'missing']);
    expect(held[1]?.on).toBeUndefined();
  });

  it('leaves out a point for a Student who has gone from the Students tab', () => {
    const held = heldPoints(snapshotOf([record('earlier', 'gone')]));

    expect(held).toEqual([]);
  });

  it('has nothing to show when everything is settled', () => {
    expect(heldPoints(snapshotOf([]))).toEqual([]);
  });
});
