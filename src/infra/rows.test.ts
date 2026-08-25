import { describe, it, expect } from 'vitest';
import {
  RowError,
  decodeAttendance,
  decodeBehavior,
  decodeGroup,
  decodeStudent,
  decodeTab,
  encodeAttendance,
  encodeBehavior,
  encodeGroup,
  STUDENTS_TAB,
} from './rows';

describe('student rows', () => {
  it('round-trips', () => {
    expect(decodeStudent(['s1', 'Ana'], 2)).toEqual({ id: 's1', name: 'Ana' });
  });

  it('trims whitespace the teacher typed', () => {
    expect(decodeStudent(['  s1 ', ' Ana '], 2)).toEqual({ id: 's1', name: 'Ana' });
  });

  it('accepts a numeric id, because Sheets turns 101 into a number', () => {
    expect(decodeStudent([101, 'Ana'], 2).id).toBe('101');
  });

  it('names the tab and the sheet row when a cell is missing', () => {
    expect(() => decodeStudent(['s1'], 7)).toThrow(RowError);
    expect(() => decodeStudent(['s1'], 7)).toThrow('Students row 7: name is required');
  });
});

describe('group rows', () => {
  it('round-trips membership through one comma-separated cell', () => {
    const group = { id: 'g1', name: '3A', studentIds: ['s1', 's2'] };
    expect(encodeGroup(group)).toEqual(['g1', '3A', 's1,s2']);
    expect(decodeGroup(encodeGroup(group), 2)).toEqual(group);
  });

  it('reads an empty group as no members, not a blank member', () => {
    expect(decodeGroup(['g1', '3A', ''], 2).studentIds).toEqual([]);
    expect(decodeGroup(['g1', '3A'], 2).studentIds).toEqual([]);
  });

  it('tolerates spaces around ids', () => {
    expect(decodeGroup(['g1', '3A', 's1, s2 ,'], 2).studentIds).toEqual(['s1', 's2']);
  });
});

describe('attendance rows', () => {
  const record = {
    sessionId: 'sess1',
    studentId: 's1',
    status: 'sick' as const,
    pointState: 'held' as const,
    note: 'flu',
  };

  it('round-trips', () => {
    expect(decodeAttendance(encodeAttendance(record), 2)).toEqual(record);
  });

  it('writes a blank note cell and reads it back as no note', () => {
    const withoutNote = { ...record, note: undefined };
    expect(encodeAttendance(withoutNote)[4]).toBe('');
    expect(decodeAttendance(encodeAttendance(withoutNote), 2)).not.toHaveProperty('note');
  });

  it('rejects a status the teacher invented', () => {
    expect(() => decodeAttendance(['sess1', 's1', 'late', 'held'], 4)).toThrow(
      'status must be one of present, absent, sick, other, got "late"',
    );
  });

  it('rejects an unknown point state', () => {
    expect(() => decodeAttendance(['sess1', 's1', 'sick', 'maybe'], 4)).toThrow('pointState');
  });
});

describe('behavior rows', () => {
  it('round-trips', () => {
    const point = {
      id: 'b1',
      studentId: 's1',
      date: '2026-08-25',
      kind: 'negative' as const,
      note: 'shouting',
    };
    expect(decodeBehavior(encodeBehavior(point), 2)).toEqual(point);
  });
});

describe('decodeTab', () => {
  it('skips the header row', () => {
    const values = [STUDENTS_TAB.header, ['s1', 'Ana']];
    expect(decodeTab(values, decodeStudent)).toEqual([{ id: 's1', name: 'Ana' }]);
  });

  it('is empty for a tab holding only a header', () => {
    expect(decodeTab([STUDENTS_TAB.header], decodeStudent)).toEqual([]);
  });

  it('reports the sheet row number the teacher would see', () => {
    const values = [STUDENTS_TAB.header, ['s1', 'Ana'], ['s2']];
    expect(() => decodeTab(values, decodeStudent)).toThrow('Students row 3');
  });
});
