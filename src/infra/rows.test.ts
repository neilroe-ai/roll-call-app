import { describe, it, expect } from 'vitest';
import {
  RowError,
  decodeAttendance,
  decodeBehavior,
  decodeGroup,
  decodeSession,
  decodeStudent,
  decodeTab,
  encodeAttendance,
  encodeBehavior,
  encodeGroup,
  STUDENTS_TAB,
  encodeSummary,
  decodeNotes,
  decodeStudentNotes,
  summaryBlock,
  summaryColumnsAreOurs,
  mergeHeader,
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

describe('date and time cells', () => {
  it('rejects a takenAt the teacher typed by hand', () => {
    expect(() => decodeSession(['sess1', 'g1', '26/08/2026'], 4)).toThrow(
      'takenAt must look like 2026-08-26T09:05, got "26/08/2026"',
    );
  });

  it('accepts an ISO timestamp with an offset', () => {
    expect(decodeSession(['sess1', 'g1', '2026-08-26T09:05:00+08:00'], 4).takenAt).toBe(
      '2026-08-26T09:05:00+08:00',
    );
  });

  it('rejects a behavior date that is not YYYY-MM-DD', () => {
    expect(() => decodeBehavior(['b1', 's1', '26 Aug', 'positive'], 4)).toThrow('must look like');
  });
});

describe('the students summary columns', () => {
  const summary = {
    studentId: 's1',
    name: 'Ana',
    score: 4,
    counts: { present: 3, absent: 1, sick: 0, other: 2 },
    notes: ['2026-08-25: forgot her book', '2026-08-26: flu'],
  };

  it('writes the notes as a list in one cell, oldest at the top', () => {
    expect(encodeSummary(summary)[5]).toBe('2026-08-25: forgot her book\n2026-08-26: flu');
  });

  it('writes score then the statuses in the order the header names them', () => {
    expect(encodeSummary(summary).slice(0, 5)).toEqual(['4', '3', '1', '0', '2']);
  });

  it('reads a notes cell back into the list it came from', () => {
    expect(decodeNotes(encodeSummary(summary)[5])).toEqual(summary.notes);
  });

  it('reads a blank or missing notes cell as no notes', () => {
    expect(decodeNotes('')).toEqual([]);
    expect(decodeNotes(undefined)).toEqual([]);
  });

  it('keys each student notes log by id, skipping rows with no id', () => {
    const values = [
      STUDENTS_TAB.header,
      ['s1', 'Ana', '4', '3', '1', '0', '2', '2026-08-26: flu'],
      ['', ''],
    ];
    expect(decodeStudentNotes(values)).toEqual(new Map([['s1', ['2026-08-26: flu']]]));
  });

  it('builds the block in the order the sheet holds its students', () => {
    const values = [STUDENTS_TAB.header, ['s2', 'Ben'], ['s1', 'Ana']];
    const ben = { ...summary, studentId: 's2', name: 'Ben', score: 1, notes: [] };
    expect(summaryBlock(values, [summary, ben]).map((row) => row[0])).toEqual(['1', '4']);
  });

  it('leaves a row it has no summary for exactly as it found it', () => {
    const values = [STUDENTS_TAB.header, ['s9', 'Unknown', '7', '', '', '', '', 'kept']];
    expect(summaryBlock(values, [summary])).toEqual([['7', '', '', '', '', 'kept']]);
  });
});

describe('claiming the summary columns', () => {
  it('claims them when they are blank', () => {
    expect(summaryColumnsAreOurs([['Student ID', 'Name']])).toBe(true);
  });

  it('claims them when they already say what the app would write', () => {
    expect(summaryColumnsAreOurs([STUDENTS_TAB.header])).toBe(true);
  });

  it('refuses them when the teacher has their own headings there', () => {
    expect(summaryColumnsAreOurs([['Student ID', 'Name', 'Parent phone']])).toBe(false);
  });

  it('refuses them when only one of the columns is taken', () => {
    const header = [...STUDENTS_TAB.header];
    header[4] = 'Class';
    expect(summaryColumnsAreOurs([header])).toBe(false);
  });

  it('treats an empty tab as blank rather than taken', () => {
    expect(summaryColumnsAreOurs([])).toBe(true);
  });
});

describe('mergeHeader', () => {
  it('fills in the headings the sheet has not got', () => {
    expect(mergeHeader(['Student ID', 'Name'], STUDENTS_TAB)).toEqual(STUDENTS_TAB.header);
  });

  it('keeps a heading the teacher typed, even where the app wants that column', () => {
    expect(mergeHeader(['ID', 'Full name'], STUDENTS_TAB).slice(0, 2)).toEqual(['ID', 'Full name']);
  });
});
