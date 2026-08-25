import { describe, it, expect } from 'vitest';
import { EMPTY_LEDGER, scoreFor } from './score';
import type { BehaviorPoint } from './behavior';
import type { AttendanceRecord } from './session';

const attendance = (studentId: string, pointState: AttendanceRecord['pointState']) => ({
  sessionId: 'sess1',
  studentId,
  status: 'present' as const,
  pointState,
});

const behavior = (studentId: string, kind: BehaviorPoint['kind'], id: string): BehaviorPoint => ({
  id,
  studentId,
  date: '2026-08-25',
  kind,
});

describe('scoreFor', () => {
  it('sums attendance and behavior points for one student only', () => {
    const records = [attendance('s1', 'awarded'), attendance('s2', 'awarded')];
    const points = [behavior('s1', 'positive', 'b1'), behavior('s2', 'negative', 'b2')];
    expect(scoreFor('s1', { attendance: records, behavior: points })).toBe(2);
  });

  it('counts held points as 0 until they resolve', () => {
    expect(scoreFor('s1', { attendance: [attendance('s1', 'held')], behavior: [] })).toBe(0);
    expect(scoreFor('s1', { attendance: [attendance('s1', 'awarded')], behavior: [] })).toBe(1);
  });

  it('can go negative on behavior alone', () => {
    expect(scoreFor('s1', { attendance: [], behavior: [behavior('s1', 'negative', 'b1')] })).toBe(
      -1,
    );
  });

  it('is 0 for a student with no records', () => {
    expect(scoreFor('s9', EMPTY_LEDGER)).toBe(0);
  });
});
