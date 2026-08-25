import { describe, it, expect } from 'vitest';
import {
  beginRollCall,
  isComplete,
  mark,
  markOf,
  noteOf,
  recordsToSave,
  setNote,
  remaining,
  unmark,
} from './rollCall';
import type { Group, Student } from './group';
import type { Session } from './session';

const session: Session = { id: 'sess1', groupId: 'g1', takenAt: '2026-08-26T09:05:00+08:00' };
const students: Student[] = [
  { id: 's1', name: 'Ana' },
  { id: 's2', name: 'Ben' },
  { id: 's3', name: 'Cara' },
];
const group: Group = { id: 'g1', name: '3A', studentIds: ['s2', 's1'] };

const begin = () => beginRollCall(session, group, students);

describe('beginRollCall', () => {
  it('rolls in group order, not student order', () => {
    expect(begin().roll.map((student) => student.name)).toEqual(['Ben', 'Ana']);
  });

  it('leaves out ids with no matching student', () => {
    const ghosted = { ...group, studentIds: ['s1', 's9'] };
    expect(beginRollCall(session, ghosted, students).roll).toHaveLength(1);
  });

  it('starts with nothing marked', () => {
    expect(begin().marks.size).toBe(0);
    expect(isComplete(begin())).toBe(false);
  });
});

describe('mark', () => {
  it('records the status and the point state it implies', () => {
    const marked = mark(begin(), 's1', 'sick', 'flu');
    expect(markOf(marked, 's1')).toMatchObject({ status: 'sick', pointState: 'held', note: 'flu' });
  });

  it('replaces an earlier mark when the teacher taps again', () => {
    const corrected = mark(mark(begin(), 's1', 'absent'), 's1', 'present');
    expect(markOf(corrected, 's1')?.status).toBe('present');
    expect(corrected.marks.size).toBe(1);
  });

  it('does not mutate the roll call it was given', () => {
    const before = begin();
    mark(before, 's1', 'present');
    expect(before.marks.size).toBe(0);
  });
});

describe('setNote', () => {
  it('holds a note for a student who is not marked yet', () => {
    const noted = setNote(begin(), 's1', 'arrived late');
    expect(noteOf(noted, 's1')).toBe('arrived late');
    expect(noted.marks.size).toBe(0);
  });

  it('attaches the note to the record once the student is marked', () => {
    const noted = mark(setNote(begin(), 's1', 'arrived late'), 's1', 'present');
    expect(markOf(noted, 's1')?.note).toBe('arrived late');
  });

  it('updates the record of a student already marked', () => {
    const noted = setNote(mark(begin(), 's1', 'sick'), 's1', 'flu');
    expect(markOf(noted, 's1')?.note).toBe('flu');
  });

  it('keeps the note when the status changes', () => {
    const changed = mark(setNote(mark(begin(), 's1', 'sick'), 's1', 'flu'), 's1', 'present');
    expect(markOf(changed, 's1')).toMatchObject({ status: 'present', note: 'flu' });
  });

  it('trims the text and treats blank as no note', () => {
    expect(noteOf(setNote(begin(), 's1', '  flu  '), 's1')).toBe('flu');
    const cleared = setNote(setNote(mark(begin(), 's1', 'sick'), 's1', 'flu'), 's1', '   ');
    expect(noteOf(cleared, 's1')).toBeUndefined();
    expect(markOf(cleared, 's1')?.note).toBeUndefined();
  });

  it('does not mutate the roll call it was given', () => {
    const before = begin();
    setNote(before, 's1', 'flu');
    expect(noteOf(before, 's1')).toBeUndefined();
  });
});

describe('unmark', () => {
  it('puts the student back among the remaining', () => {
    const marked = mark(begin(), 's1', 'present');
    expect(remaining(unmark(marked, 's1')).map((student) => student.id)).toEqual(['s2', 's1']);
  });

  it('keeps the note, which is about the student not the tap', () => {
    const marked = setNote(mark(begin(), 's1', 'sick'), 's1', 'flu');
    expect(noteOf(unmark(marked, 's1'), 's1')).toBe('flu');
  });
});

describe('remaining and isComplete', () => {
  it('counts down in roll order', () => {
    const marked = mark(begin(), 's1', 'present');
    expect(remaining(marked).map((student) => student.id)).toEqual(['s2']);
  });

  it('is complete once everyone on the roll is marked', () => {
    const done = mark(mark(begin(), 's1', 'present'), 's2', 'absent');
    expect(isComplete(done)).toBe(true);
    expect(remaining(done)).toEqual([]);
  });
});

describe('recordsToSave', () => {
  it('returns records in roll order, not tap order', () => {
    const done = mark(mark(begin(), 's1', 'present'), 's2', 'absent');
    expect(recordsToSave(done).map((record) => record.studentId)).toEqual(['s2', 's1']);
  });

  it('returns only what is marked so far', () => {
    expect(recordsToSave(mark(begin(), 's1', 'present'))).toHaveLength(1);
  });
});
