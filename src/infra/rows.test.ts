import { describe, it, expect } from 'vitest';
import {
  RowError,
  decodeAttendance,
  decodeBehavior,
  decodeAdjustment,
  decodeAdjustments,
  decodeGroups,
  decodeSession,
  decodeStudent,
  decodeTab,
  encodeAttendance,
  encodeBehavior,
  GROUPS_TAB,
  STUDENTS_TAB,
  SUMMARY_TAB,
  encodeSummary,
  decodeNotes,
  decodeSummaryNotes,
  groupIdForColumn,
  groupRoster,
  isTicked,
  summaryBlock,
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

describe('the groups grid', () => {
  const grid = [
    ['Student ID', 'Name', 'Class 01', 'Class 02', ''],
    ['s1', 'Ana', 'y', '', ''],
    ['s2', 'Ben', 'y', 'y', ''],
    ['s3', 'Cara', '', 'y', ''],
  ];

  it('reads a column as a group and its ticks as the membership', () => {
    expect(decodeGroups(grid)).toEqual([
      { id: 'G1', name: 'Class 01', studentIds: ['s1', 's2'] },
      { id: 'G2', name: 'Class 02', studentIds: ['s2', 's3'] },
    ]);
  });

  it('identifies a group by column position, not by its heading', () => {
    const renamed = grid.map((row) => [...row]);
    renamed[0]![2] = 'Monday morning';
    // The teacher renamed the class; its sessions must still point at it.
    expect(decodeGroups(renamed)[0]?.id).toBe('G1');
    expect(decodeGroups(renamed)[0]?.name).toBe('Monday morning');
  });

  it('ignores a column with no heading, so blank space is not a group', () => {
    expect(decodeGroups(grid)).toHaveLength(2);
  });

  it('keeps a named group the teacher has not filled in yet', () => {
    expect(
      decodeGroups([
        ['Student ID', 'Name', 'Class 03'],
        ['s1', 'Ana'],
      ]),
    ).toEqual([{ id: 'G1', name: 'Class 03', studentIds: [] }]);
  });

  it('reads an empty grid as no groups', () => {
    expect(decodeGroups([])).toEqual([]);
  });

  it('numbers group ids from the first group column', () => {
    expect(groupIdForColumn(2)).toBe('G1');
    expect(groupIdForColumn(5)).toBe('G4');
  });
});

describe('what counts as a tick', () => {
  it('accepts whatever the teacher put there', () => {
    for (const cell of ['y', 'Y', ' x ', '1', 'yes', '✓', true, 1]) {
      expect(isTicked(cell)).toBe(true);
    }
  });

  it('reads blank and an explicit no as not a member', () => {
    for (const cell of ['', '   ', 'n', 'NO', 'false', '0', '-', false, 0, undefined]) {
      expect(isTicked(cell)).toBe(false);
    }
  });
});

describe('the groups roster', () => {
  const students = [
    { id: 's1', name: 'Ana' },
    { id: 's2', name: 'Ben' },
  ];

  it('adds a row for a student who has none yet', () => {
    const grid = [GROUPS_TAB.header, ['s1', 'Ana', 'y']];
    expect(groupRoster(grid, students)).toEqual([
      ['s1', 'Ana'],
      ['s2', 'Ben'],
    ]);
  });

  it('keeps every row where it was, so the ticks beside it still apply', () => {
    const grid = [GROUPS_TAB.header, ['s2', 'Ben', 'y'], ['s1', 'Ana']];
    expect(groupRoster(grid, students).map((row) => row[0])).toEqual(['s2', 's1']);
  });

  it('refreshes a name the teacher changed on the register', () => {
    const grid = [GROUPS_TAB.header, ['s1', 'Anna']];
    expect(groupRoster(grid, students)[0]).toEqual(['s1', 'Ana']);
  });

  it('leaves a row whose student has gone from the register alone', () => {
    const grid = [GROUPS_TAB.header, ['s9', 'Old', 'y']];
    // Only A and B are ever written, so the tick in C survives regardless.
    expect(groupRoster(grid, students)[0]).toEqual(['s9', 'Old']);
  });

  it('writes only the two columns it owns', () => {
    const grid = [GROUPS_TAB.header, ['s1', 'Ana', 'y', 'y']];
    expect(groupRoster(grid, students).every((row) => row.length === 2)).toBe(true);
  });
});

describe('adjustment cells', () => {
  it('reads the figures the teacher carried in from paper', () => {
    expect(decodeAdjustment(['s1', 'Ana', '12', '18', '2', '', ''], 2)).toEqual({
      points: 12,
      counts: { present: 18, absent: 2, sick: 0, other: 0 },
    });
  });

  it('reads a row with nothing typed as no adjustment at all', () => {
    expect(decodeAdjustment(['s1', 'Ana'], 2)).toEqual({
      points: 0,
      counts: { present: 0, absent: 0, sick: 0, other: 0 },
    });
  });

  it('accepts a number, because Sheets gives back 12 not "12"', () => {
    expect(decodeAdjustment(['s1', 'Ana', 12], 2).points).toBe(12);
  });

  it('accepts a negative, so a figure can be corrected downwards', () => {
    expect(decodeAdjustment(['s1', 'Ana', '-3'], 2).points).toBe(-3);
  });

  it('names the cell when the teacher typed something unreadable', () => {
    expect(() => decodeAdjustment(['s1', 'Ana', 'twelve'], 4)).toThrow(
      'Students row 4: adjust points must be a whole number, got "twelve"',
    );
  });

  it('keys every student who has a row', () => {
    const values = [STUDENTS_TAB.header, ['s1', 'Ana', '5'], ['s2', 'Ben'], ['', '']];
    const adjustments = decodeAdjustments(values);
    expect(adjustments.get('s1')?.points).toBe(5);
    expect(adjustments.get('s2')?.points).toBe(0);
    expect(adjustments.size).toBe(2);
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

describe('the summary tab', () => {
  const summary = {
    studentId: 's1',
    name: 'Ana',
    groupNames: ['Class 01', 'Class 02'],
    score: 4,
    sessions: 6,
    counts: { present: 3, absent: 1, sick: 0, other: 2 },
    notes: ['2026-08-25: forgot her book', '2026-08-26: flu'],
  };

  it('writes a row in the order the header names the columns', () => {
    expect(encodeSummary(summary)).toEqual([
      's1',
      'Ana',
      'Class 01, Class 02',
      '4',
      '6',
      '3',
      '50%',
      '1',
      '17%',
      '0',
      '0%',
      '2',
      '33%',
      '2026-08-25: forgot her book\n2026-08-26: flu',
    ]);
  });

  it('writes a row for every column the header has', () => {
    expect(encodeSummary(summary)).toHaveLength(SUMMARY_TAB.header.length);
  });

  it('writes the notes as a list in one cell, oldest at the top', () => {
    expect(decodeNotes(encodeSummary(summary)[13])).toEqual(summary.notes);
  });

  it('reads a blank or missing notes cell as no notes', () => {
    expect(decodeNotes('')).toEqual([]);
    expect(decodeNotes(undefined)).toEqual([]);
  });

  it('shows 0% rather than dividing by no sessions', () => {
    const fresh = { ...summary, sessions: 0, counts: { ...summary.counts, present: 0 } };
    expect(encodeSummary(fresh)[6]).toBe('0%');
  });

  it('keys each student notes log by id, skipping rows with no id', () => {
    const values = [SUMMARY_TAB.header, encodeSummary(summary), ['', '']];
    expect(decodeSummaryNotes(values)).toEqual(new Map([['s1', summary.notes]]));
  });

  it('builds the block in the order it was given, because the app owns the tab', () => {
    const ben = { ...summary, studentId: 's2', name: 'Ben' };
    expect(summaryBlock([summary, ben]).map((row) => row[0])).toEqual(['s1', 's2']);
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
