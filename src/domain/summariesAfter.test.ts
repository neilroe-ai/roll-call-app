import { describe, expect, it } from 'vitest';
import {
  afterBehaviorPoint,
  afterNote,
  afterResolvedHeldPoint,
  afterRollCall,
} from './summariesAfter';
import { awardBehavior, type CalendarDate } from './behavior';
import { beginRollCall, mark } from './rollCall';
import { EMPTY_LEDGER, type PointsLedger } from './score';
import type { Group, Student } from './group';
import type { AttendanceRecord, Session } from './session';
import type { Snapshot } from './snapshot';
import type { StudentSummary } from './studentSummary';

const STUDENTS: Student[] = [
  { id: 's1', name: 'Ana' },
  { id: 's2', name: 'Ben' },
];
const GROUP: Group = { id: 'G1', name: '3A', studentIds: ['s1', 's2'] };
const SESSION: Session = { id: 'sess1', groupId: 'G1', takenAt: '2026-08-26T09:05:00+08:00' };

function snapshotOf(over: Partial<Snapshot> = {}): Snapshot {
  return {
    students: STUDENTS,
    groups: [GROUP],
    sessions: [],
    ledger: EMPTY_LEDGER,
    adjustments: new Map(),
    notes: new Map(),
    ...over,
  };
}

const rowFor = (summaries: StudentSummary[], studentId: string): StudentSummary => {
  const row = summaries.find((candidate) => candidate.studentId === studentId);
  if (!row) throw new Error(`no summary for ${studentId}`);
  return row;
};

describe('afterRollCall', () => {
  const marked = () => {
    const started = beginRollCall(SESSION, GROUP, STUDENTS);
    return mark(mark(started, 's1', 'present'), 's2', 'sick', 'flu');
  };

  it('scores the marks the roll call is about to save', () => {
    const summaries = afterRollCall(snapshotOf(), marked());

    // Present is awarded at once; sick is held, and a held point scores
    // nothing until the teacher resolves it.
    expect(rowFor(summaries, 's1').score).toBe(1);
    expect(rowFor(summaries, 's2').score).toBe(0);
  });

  it('counts the Session being saved, which is not on the Sheet yet', () => {
    const summaries = afterRollCall(snapshotOf(), marked());

    // Leaving it out would rate every Student against one Session fewer than
    // they were actually at.
    expect(rowFor(summaries, 's1').sessions).toBe(1);
    expect(rowFor(summaries, 's1').counts.present).toBe(1);
    expect(rowFor(summaries, 's2').counts.sick).toBe(1);
  });

  it('files a Note under the day the Session was taken, not the day it is saved', () => {
    const summaries = afterRollCall(snapshotOf(), marked());

    expect(rowFor(summaries, 's2').notes).toEqual(['2026-08-26: flu']);
    expect(rowFor(summaries, 's1').notes).toEqual([]);
  });

  it('adds to the Notes the Sheet already holds', () => {
    const notes = new Map([['s2', ['2026-08-01: was late']]]);
    const summaries = afterRollCall(snapshotOf({ notes }), marked());

    expect(rowFor(summaries, 's2').notes).toEqual(['2026-08-01: was late', '2026-08-26: flu']);
  });
});

describe('afterBehaviorPoint', () => {
  const TODAY = '2026-08-26' as CalendarDate;

  it('moves the Score the moment the point is awarded', () => {
    const point = awardBehavior('b1', 's1', TODAY, 'positive');
    const summaries = afterBehaviorPoint(snapshotOf(), point);

    expect(rowFor(summaries, 's1').score).toBe(1);
    expect(rowFor(summaries, 's2').score).toBe(0);
  });

  it('writes the reason into the log with its sign, under the point’s own date', () => {
    const point = awardBehavior('b1', 's1', TODAY, 'negative', 'threw a pen');
    const summaries = afterBehaviorPoint(snapshotOf(), point);

    expect(rowFor(summaries, 's1').score).toBe(-1);
    expect(rowFor(summaries, 's1').notes).toEqual(['2026-08-26: -1 threw a pen']);
  });

  it('earns no line when no reason was given', () => {
    const point = awardBehavior('b1', 's1', TODAY, 'positive');

    expect(rowFor(afterBehaviorPoint(snapshotOf(), point), 's1').notes).toEqual([]);
  });
});

describe('afterResolvedHeldPoint', () => {
  const held: AttendanceRecord = {
    sessionId: 'sess1',
    studentId: 's1',
    status: 'sick',
    pointState: 'held',
    note: 'flu',
  };
  const withHeld = () => {
    const ledger: PointsLedger = { ...EMPTY_LEDGER, attendance: [held] };
    return snapshotOf({ sessions: [SESSION], ledger });
  };

  it('awards the point, and the Score moves with it', () => {
    const summaries = afterResolvedHeldPoint(withHeld(), 'sess1', 's1', 'awarded');

    expect(rowFor(summaries, 's1').score).toBe(1);
  });

  it('denies the point, and the Score stays where it was', () => {
    const summaries = afterResolvedHeldPoint(withHeld(), 'sess1', 's1', 'denied');

    expect(rowFor(summaries, 's1').score).toBe(0);
  });

  it('touches no other Record, and writes no Note', () => {
    const other: AttendanceRecord = { ...held, studentId: 's2' };
    const ledger: PointsLedger = { ...EMPTY_LEDGER, attendance: [held, other] };
    const summaries = afterResolvedHeldPoint(
      snapshotOf({ sessions: [SESSION], ledger }),
      'sess1',
      's1',
      'awarded',
    );

    expect(rowFor(summaries, 's2').score).toBe(0);
    expect(rowFor(summaries, 's1').notes).toEqual([]);
  });
});

describe('afterNote', () => {
  it('adds the line and changes no Score', () => {
    const summaries = afterNote(snapshotOf(), 's1', 'moved seats', '2026-08-27');

    expect(rowFor(summaries, 's1').notes).toEqual(['2026-08-27: moved seats']);
    expect(rowFor(summaries, 's1').score).toBe(0);
    expect(rowFor(summaries, 's2').notes).toEqual([]);
  });
});
