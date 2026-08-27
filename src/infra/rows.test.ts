/**
 * The mapping between the Sheet's rows and the app's records, tab by tab.
 *
 * Every case goes in through the tab it belongs to, because that is the only
 * way the adapters reach it: a decoder tested on its own could still be paired
 * with the wrong tab.
 */
import { describe, it, expect } from 'vitest';
import {
  ATTENDANCE_TAB,
  BEHAVIOR_TAB,
  GROUPS_TAB,
  RowError,
  SESSIONS_TAB,
  STUDENTS_TAB,
  SUMMARY_TAB,
  columnLetter,
  type SheetRow,
  type TabSchema,
} from './rows';

/** A tab holding these rows under its header, as the API hands it back. */
const holding = (tab: TabSchema, ...rows: SheetRow[]): SheetRow[] => [tab.header, ...rows];

const students = (...rows: SheetRow[]) => STUDENTS_TAB.decode(holding(STUDENTS_TAB, ...rows));
const adjustments = (...rows: SheetRow[]) =>
  STUDENTS_TAB.adjustments(holding(STUDENTS_TAB, ...rows));
const attendance = (...rows: SheetRow[]) => ATTENDANCE_TAB.decode(holding(ATTENDANCE_TAB, ...rows));
const behavior = (...rows: SheetRow[]) => BEHAVIOR_TAB.decode(holding(BEHAVIOR_TAB, ...rows));
const sessions = (...rows: SheetRow[]) => SESSIONS_TAB.decode(holding(SESSIONS_TAB, ...rows));

describe('student rows', () => {
  it('round-trips', () => {
    expect(students(['s1', 'Ana'])).toEqual([{ id: 's1', name: 'Ana' }]);
  });

  it('trims whitespace the teacher typed', () => {
    expect(students(['  s1 ', ' Ana '])).toEqual([{ id: 's1', name: 'Ana' }]);
  });

  it('accepts a numeric id, because Sheets turns 101 into a number', () => {
    expect(students([101, 'Ana'])[0]?.id).toBe('101');
  });

  it('names the tab and the sheet row when a cell is missing', () => {
    expect(() => students(['s1'])).toThrow(RowError);
    expect(() => students(['s1'])).toThrow('Students row 2: name is required');
  });

  it('skips the header row', () => {
    expect(students()).toEqual([]);
  });

  it('reports the sheet row number the teacher would see', () => {
    expect(() => students(['s1', 'Ana'], ['s2'])).toThrow('Students row 3');
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
    expect(GROUPS_TAB.decode(grid)).toEqual([
      { id: 'G1', name: 'Class 01', studentIds: ['s1', 's2'] },
      { id: 'G2', name: 'Class 02', studentIds: ['s2', 's3'] },
    ]);
  });

  it('identifies a group by column position, not by its heading', () => {
    const renamed = grid.map((row) => [...row]);
    renamed[0]![2] = 'Monday morning';
    // The teacher renamed the class; its sessions must still point at it.
    expect(GROUPS_TAB.decode(renamed)[0]?.id).toBe('G1');
    expect(GROUPS_TAB.decode(renamed)[0]?.name).toBe('Monday morning');
  });

  it('ignores a column with no heading, so blank space is not a group', () => {
    expect(GROUPS_TAB.decode(grid)).toHaveLength(2);
  });

  it('keeps a named group the teacher has not filled in yet', () => {
    expect(
      GROUPS_TAB.decode([
        ['Student ID', 'Name', 'Class 03'],
        ['s1', 'Ana'],
      ]),
    ).toEqual([{ id: 'G1', name: 'Class 03', studentIds: [] }]);
  });

  it('reads an empty grid as no groups', () => {
    expect(GROUPS_TAB.decode([])).toEqual([]);
  });

  it('numbers group ids from the first group column', () => {
    expect(GROUPS_TAB.idForColumn(2)).toBe('G1');
    expect(GROUPS_TAB.idForColumn(5)).toBe('G4');
  });
});

describe('what counts as a tick', () => {
  /** Whether one membership cell puts Ana in the group. */
  const ticked = (cell: unknown): boolean =>
    GROUPS_TAB.decode([
      [...GROUPS_TAB.header, 'Class 01'],
      ['s1', 'Ana', cell],
    ])[0]!.studentIds.includes('s1');

  it('accepts whatever the teacher put there', () => {
    for (const cell of ['y', 'Y', ' x ', '1', 'yes', '✓', true, 1]) {
      expect(ticked(cell)).toBe(true);
    }
  });

  it('reads blank and an explicit no as not a member', () => {
    for (const cell of ['', '   ', 'n', 'NO', 'false', '0', '-', false, 0, undefined]) {
      expect(ticked(cell)).toBe(false);
    }
  });
});

describe('the groups grid columns', () => {
  const roll = [
    { id: 's1', name: 'Ana' },
    { id: 's2', name: 'Ben' },
  ];

  it('adds a row for a student who has none yet', () => {
    expect(GROUPS_TAB.columnsFor(holding(GROUPS_TAB, ['s1', 'Ana', 'y']), roll)).toEqual([
      ['s1', 'Ana'],
      ['s2', 'Ben'],
    ]);
  });

  it('keeps every row where it was, so the ticks beside it still apply', () => {
    const grid = holding(GROUPS_TAB, ['s2', 'Ben', 'y'], ['s1', 'Ana']);
    expect(GROUPS_TAB.columnsFor(grid, roll).map((row) => row[0])).toEqual(['s2', 's1']);
  });

  it('refreshes a name the teacher changed on the Students tab', () => {
    expect(GROUPS_TAB.columnsFor(holding(GROUPS_TAB, ['s1', 'Anna']), roll)[0]).toEqual([
      's1',
      'Ana',
    ]);
  });

  it('leaves a row whose student has gone from the Students tab alone', () => {
    // Only A and B are ever written, so the tick in C survives regardless.
    expect(GROUPS_TAB.columnsFor(holding(GROUPS_TAB, ['s9', 'Old', 'y']), roll)[0]).toEqual([
      's9',
      'Old',
    ]);
  });

  it('writes only the two columns it owns', () => {
    const grid = holding(GROUPS_TAB, ['s1', 'Ana', 'y', 'y']);
    expect(GROUPS_TAB.columnsFor(grid, roll).every((row) => row.length === 2)).toBe(true);
  });
});

describe('adjustment cells', () => {
  const forAna = (...cells: unknown[]) => adjustments(['s1', 'Ana', ...cells]).get('s1');

  it('reads the figures the teacher carried in from paper', () => {
    expect(forAna('12', '18', '2', '', '')).toEqual({
      points: 12,
      counts: { present: 18, absent: 2, sick: 0, other: 0 },
    });
  });

  it('reads a row with nothing typed as no adjustment at all', () => {
    expect(forAna()).toEqual({
      points: 0,
      counts: { present: 0, absent: 0, sick: 0, other: 0 },
    });
  });

  it('accepts a number, because Sheets gives back 12 not "12"', () => {
    expect(forAna(12)?.points).toBe(12);
  });

  it('accepts a negative, so a figure can be corrected downwards', () => {
    expect(forAna('-3')?.points).toBe(-3);
  });

  it('names the cell when the teacher typed something unreadable', () => {
    expect(() => forAna('twelve')).toThrow(
      'Students row 2: adjust points must be a whole number, got "twelve"',
    );
  });

  it('keys every student who has a row', () => {
    const figures = adjustments(['s1', 'Ana', '5'], ['s2', 'Ben'], ['', '']);
    expect(figures.get('s1')?.points).toBe(5);
    expect(figures.get('s2')?.points).toBe(0);
    expect(figures.size).toBe(2);
  });
});

describe('student rows the app writes for a test', () => {
  const student = { id: 's1', name: 'Ana' };

  it('writes only the two columns the teacher fills for most students', () => {
    expect(STUDENTS_TAB.encode(student)).toEqual(['s1', 'Ana']);
  });

  it('writes an Adjustment in the column order the Students tab reads back', () => {
    const adjustment = { points: 4, counts: { present: 3, absent: 2, sick: 1, other: 0 } };

    const row = STUDENTS_TAB.encode(student, adjustment);

    expect(row).toEqual(['s1', 'Ana', '4', '3', '2', '1', '0']);
    expect(adjustments(row).get('s1')).toEqual(adjustment);
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
    expect(attendance(ATTENDANCE_TAB.encode(record))).toEqual([record]);
  });

  it('writes a blank note cell and reads it back as no note', () => {
    const withoutNote = { ...record, note: undefined };
    expect(ATTENDANCE_TAB.encode(withoutNote)[4]).toBe('');
    expect(attendance(ATTENDANCE_TAB.encode(withoutNote))[0]).not.toHaveProperty('note');
  });

  it('rejects a status the teacher invented', () => {
    expect(() => attendance(['sess1', 's1', 'late', 'held'])).toThrow(
      'status must be one of present, absent, sick, other, got "late"',
    );
  });

  it('rejects an unknown point state', () => {
    expect(() => attendance(['sess1', 's1', 'sick', 'maybe'])).toThrow('pointState');
  });

  it('says where the Point sits, so no caller counts cells', () => {
    expect(ATTENDANCE_TAB.encode(record)[ATTENDANCE_TAB.pointIndex]).toBe('held');
    expect(ATTENDANCE_TAB.pointColumn).toBe('D');
  });

  it('finds a record by its session and student, past the header', () => {
    const values = holding(
      ATTENDANCE_TAB,
      ATTENDANCE_TAB.encode(record),
      ATTENDANCE_TAB.encode({ ...record, studentId: 's2' }),
    );
    expect(ATTENDANCE_TAB.rowOf(values, 'sess1', 's2')).toBe(2);
    expect(ATTENDANCE_TAB.rowOf(values, 'sess1', 's9')).toBe(-1);
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
    expect(behavior(BEHAVIOR_TAB.encode(point))).toEqual([point]);
  });
});

describe('date and time cells', () => {
  it('rejects a takenAt the teacher typed by hand', () => {
    expect(() => sessions(['sess1', 'g1', '26/08/2026'])).toThrow(
      'takenAt must look like 2026-08-26T09:05, got "26/08/2026"',
    );
  });

  it('accepts an ISO timestamp with an offset', () => {
    expect(sessions(['sess1', 'g1', '2026-08-26T09:05:00+08:00'])[0]?.takenAt).toBe(
      '2026-08-26T09:05:00+08:00',
    );
  });

  it('round-trips a session', () => {
    const session = { id: 'sess1', groupId: 'G1', takenAt: '2026-08-26T09:05:00+08:00' as const };
    expect(sessions(SESSIONS_TAB.encode(session))).toEqual([session]);
  });

  it('rejects a behavior date that is not YYYY-MM-DD', () => {
    expect(() => behavior(['b1', 's1', '26 Aug', 'positive'])).toThrow('must look like');
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
  const row = (one = summary) => SUMMARY_TAB.block([one])[0]!;

  it('writes a row in the order the header names the columns', () => {
    expect(row()).toEqual([
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
    expect(row()).toHaveLength(SUMMARY_TAB.header.length);
  });

  it('writes the notes as a list in one cell, oldest at the top', () => {
    expect(SUMMARY_TAB.notes(holding(SUMMARY_TAB, row())).get('s1')).toEqual(summary.notes);
  });

  it('reads a blank or missing notes cell as no notes', () => {
    const values = holding(
      SUMMARY_TAB,
      ['s1', 'Ana', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['s2', 'Ben'],
    );
    expect(SUMMARY_TAB.notes(values).get('s1')).toEqual([]);
    expect(SUMMARY_TAB.notes(values).get('s2')).toEqual([]);
  });

  it('shows 0% rather than dividing by no sessions', () => {
    const fresh = { ...summary, sessions: 0, counts: { ...summary.counts, present: 0 } };
    expect(row(fresh)[6]).toBe('0%');
  });

  it('keys each student notes log by id, skipping rows with no id', () => {
    const values = holding(SUMMARY_TAB, row(), ['', '']);
    expect(SUMMARY_TAB.notes(values)).toEqual(new Map([['s1', summary.notes]]));
  });

  it('builds the block in the order it was given, because the app owns the tab', () => {
    const ben = { ...summary, studentId: 's2', name: 'Ben' };
    expect(SUMMARY_TAB.block([summary, ben]).map((cells) => cells[0])).toEqual(['s1', 's2']);
  });

  it('names the rightmost column, for the range a rewrite covers', () => {
    expect(SUMMARY_TAB.lastColumn).toBe('N');
  });
});

describe('columnLetter', () => {
  it('names the single-letter columns', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(3)).toBe('D');
    expect(columnLetter(25)).toBe('Z');
  });

  it('carries past Z instead of running into the punctuation', () => {
    // Counting up from 'A' gives '[' here, and the Sheets API rejects the
    // range rather than misreading it.
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(27)).toBe('AB');
    expect(columnLetter(51)).toBe('AZ');
    expect(columnLetter(52)).toBe('BA');
  });

  it('carries a second time', () => {
    expect(columnLetter(701)).toBe('ZZ');
    expect(columnLetter(702)).toBe('AAA');
  });

  it('refuses an index that is not a whole number from zero', () => {
    expect(() => columnLetter(-1)).toThrow(/whole number/);
    expect(() => columnLetter(1.5)).toThrow(/whole number/);
  });
});
