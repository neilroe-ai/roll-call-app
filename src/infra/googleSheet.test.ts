import { describe, it, expect } from 'vitest';
import { GoogleSheet, SHEET_TITLE, type IdStore } from './googleSheet';
import { SheetsApi } from './sheetsApi';
import { FetchStub, SheetFetch, StubTokens } from './testFetch';
import {
  ALL_TABS,
  ATTENDANCE_TAB,
  BEHAVIOR_TAB,
  GROUPS_TAB,
  SESSIONS_TAB,
  STUDENTS_TAB,
  SUMMARY_TAB,
  type SheetRow,
} from './rows';
import { beginRollCall, mark } from '../domain/rollCall';
import { awardBehavior } from '../domain/behavior';
import { recordAttendance, type Session } from '../domain/session';

const session: Session = { id: 'sess1', groupId: 'g1', takenAt: '2026-08-25T09:05:00+08:00' };

class MemoryIdStore implements IdStore {
  constructor(private id: string | null = null) {}
  get(): string | null {
    return this.id;
  }
  set(id: string): void {
    this.id = id;
  }
}

/** Replies for a first-run create: the new id, then one write per header row. */
const createReplies = [{ body: { spreadsheetId: 'new1' } }, ...ALL_TABS.map(() => ({ body: {} }))];

const ok = { body: {} };

/** Attendance counts for a student marked present once. */
const OUR_COUNTS = { present: 1, absent: 0, sick: 0, other: 0 };
const notFound = { status: 404, body: { error: 'File not found' } };

const build = (stub: FetchStub, store: IdStore) =>
  new GoogleSheet(new SheetsApi(new StubTokens(), stub.fetch), store);

describe('GoogleSheet first run', () => {
  it('creates the Sheet with all five tabs and writes their headers', async () => {
    const stub = new FetchStub([...createReplies, { body: { values: [] } }]);
    const store = new MemoryIdStore();
    // Any read triggers the create; nothing else in the app asks for one.
    await build(stub, store).listStudents();

    const created = stub.calls[0]?.body as { properties: { title: string }; sheets: unknown[] };
    expect(created.properties.title).toBe(SHEET_TITLE);
    expect(created.sheets).toHaveLength(ALL_TABS.length);
    expect(stub.calls.slice(1, 1 + ALL_TABS.length).map((call) => call.method)).toEqual(
      ALL_TABS.map(() => 'PUT'),
    );
    expect(store.get()).toBe('new1');
  });

  it('creates the Sheet only once when several reads race', async () => {
    const stub = new FetchStub([...createReplies, { body: {} }, { body: {} }]);
    const sheet = build(stub, new MemoryIdStore());

    await Promise.all([sheet.listStudents(), sheet.listGroups()]);

    const creates = stub.calls.filter((call) => call.method === 'POST');
    expect(creates).toHaveLength(1);
  });

  it('reuses a remembered id instead of creating a second Sheet', async () => {
    const stub = new FetchStub([{ body: { values: [] } }]);
    await build(stub, new MemoryIdStore('kept1')).listStudents();

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.url).toContain('/kept1/values/');
  });

  it('checks a remembered id against Drive once, not on every read', async () => {
    const stub = new FetchStub([{ body: { values: [] } }, { body: { values: [] } }]);
    const sheet = build(stub, new MemoryIdStore('kept1'));

    await sheet.listStudents();
    await sheet.listGroups();

    expect(stub.driveCalls).toHaveLength(1);
  });
});

/** The trap that cost a term of setup: `localStorage` is per browser, so Safari
    and Chrome on one phone each arrived with nothing remembered and each made a
    Sheet. Drive is the shared answer both of them can reach. */
describe('GoogleSheet when another browser already made the Sheet', () => {
  it('adopts the Sheet Drive already holds instead of creating another', async () => {
    const stub = new FetchStub([{ body: { values: [] } }], { existing: 'old1' });
    const store = new MemoryIdStore();

    await build(stub, store).listStudents();

    expect(stub.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    expect(store.get()).toBe('old1');
    expect(stub.calls[0]?.url).toContain('/old1/values/');
  });

  it('lands two browsers on one Sheet, each remembering nothing', async () => {
    const first = new FetchStub([{ body: { values: [] } }], { existing: 'old1' });
    const second = new FetchStub([{ body: { values: [] } }], { existing: 'old1' });
    const safari = new MemoryIdStore();
    const chrome = new MemoryIdStore();

    await build(first, safari).listStudents();
    await build(second, chrome).listStudents();

    expect(safari.get()).toBe('old1');
    expect(chrome.get()).toBe(safari.get());
  });

  it('creates one only when Drive holds none', async () => {
    const stub = new FetchStub([...createReplies, { body: { values: [] } }], { existing: null });
    const store = new MemoryIdStore();

    await build(stub, store).listStudents();

    expect(store.get()).toBe('new1');
  });
});

describe('GoogleSheet when the remembered Sheet is in the bin', () => {
  it('leaves the binned Sheet alone and uses the one Drive still lists', async () => {
    // A binned Sheet answers every read and write, so an unchecked id would
    // file a term of roll calls into a spreadsheet she cannot see.
    const stub = new FetchStub([{ body: { values: [] } }], { usable: false, existing: 'old1' });
    const store = new MemoryIdStore('binned1');

    await build(stub, store).listStudents();

    expect(stub.calls[0]?.url).toContain('/old1/values/');
    expect(store.get()).toBe('old1');
  });

  it('makes a Sheet when the remembered one is gone and Drive holds none', async () => {
    const stub = new FetchStub([...createReplies, { body: { values: [] } }], { missing: true });
    const store = new MemoryIdStore('gone1');

    await build(stub, store).listStudents();

    expect(store.get()).toBe('new1');
  });
});

describe('GoogleSheet when the remembered Sheet is gone', () => {
  it('makes a fresh Sheet after a 404 and remembers the new id', async () => {
    const stub = new FetchStub([notFound, ...createReplies, { body: { values: [] } }]);
    const store = new MemoryIdStore('deleted1');

    expect(await build(stub, store).listStudents()).toEqual([]);
    expect(store.get()).toBe('new1');
  });

  it('does not loop when the fresh Sheet 404s too', async () => {
    const stub = new FetchStub([notFound, ...createReplies, notFound]);
    await expect(build(stub, new MemoryIdStore('deleted1')).listStudents()).rejects.toThrow(
      'Sheets API 404',
    );
  });
});

describe('GoogleSheet reads and writes', () => {
  it('decodes rows into domain records', async () => {
    const stub = new FetchStub([
      {
        body: {
          values: [
            ['id', 'name'],
            ['s1', 'Ana'],
          ],
        },
      },
    ]);
    expect(await build(stub, new MemoryIdStore('kept1')).listStudents()).toEqual([
      { id: 's1', name: 'Ana' },
    ]);
  });

  it('appends a whole session of attendance in one call', async () => {
    const stub = new FetchStub([{ body: {} }]);
    await build(stub, new MemoryIdStore('kept1')).appendAttendance([
      recordAttendance(session, 's1', 'present'),
      recordAttendance(session, 's2', 'sick', 'flu'),
    ]);

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.body).toEqual({
      values: [
        ['sess1', 's1', 'present', 'awarded', ''],
        ['sess1', 's2', 'sick', 'held', 'flu'],
      ],
    });
  });

  it('resolves a held point by writing one cell in the right row', async () => {
    const stub = new FetchStub([
      {
        body: {
          values: [
            ['sessionId', 'studentId', 'status', 'pointState', 'note'],
            ['sess1', 's1', 'present', 'awarded', ''],
            ['sess1', 's2', 'sick', 'held', 'flu'],
          ],
        },
      },
      { body: {} },
    ]);
    await build(stub, new MemoryIdStore('kept1')).setPointState('sess1', 's2', 'awarded');

    expect(stub.calls[1]?.url).toContain(encodeURIComponent('Attendance!D3'));
    expect(stub.calls[1]?.body).toEqual({ values: [['awarded']] });
  });

  it('refuses to resolve a record the Sheet does not hold', async () => {
    const stub = new FetchStub([{ body: { values: [['sessionId']] } }]);
    await expect(
      build(stub, new MemoryIdStore('kept1')).setPointState('sess1', 's9', 'awarded'),
    ).rejects.toThrow('no attendance record for s9 in sess1');
  });
});

describe('the summary tab', () => {
  const summary = [
    {
      studentId: 's1',
      name: 'Ana',
      groupNames: ['Class 01'],
      score: 2,
      sessions: 1,
      counts: OUR_COUNTS,
      credited: 1,
      notes: ['2026-08-26: flu'],
    },
  ];

  it('writes the whole row, because the app owns every column of the tab', async () => {
    const stub = new FetchStub([{ body: { values: [SUMMARY_TAB.header] } }, ok]);
    await build(stub, new MemoryIdStore('sheet1')).saveStudentSummaries(summary);

    const write = stub.calls[1];
    expect(write?.method).toBe('PUT');
    expect(write?.url).toContain(encodeURIComponent('Summary!A2:P2'));
    expect(write?.body).toMatchObject({
      values: [
        [
          's1',
          'Ana',
          'Class 01',
          '2',
          '1',
          '1',
          '100%',
          '0',
          '0%',
          '0',
          '0%',
          '0',
          '0%',
          '1',
          '100%',
          '2026-08-26: flu',
        ],
      ],
    });
  });

  it('blanks a row left behind by a student who has gone from the Students tab', async () => {
    const existing = {
      body: { values: [SUMMARY_TAB.header, ['s1', 'Ana'], ['s9', 'Gone', '', '3']] },
    };
    const stub = new FetchStub([existing, ok]);
    await build(stub, new MemoryIdStore('sheet1')).saveStudentSummaries(summary);

    const values = (stub.calls[1]?.body as { values: string[][] }).values;
    expect(values).toHaveLength(2);
    expect(values[1]?.every((cell) => cell === '')).toBe(true);
  });

  it('clears every row when there are no students left to summarise', async () => {
    const existing = {
      body: { values: [SUMMARY_TAB.header, ['s1', 'Ana', '', '2'], ['s2', 'Ben', '', '1']] },
    };
    const stub = new FetchStub([existing, ok]);
    await build(stub, new MemoryIdStore('sheet1')).saveStudentSummaries([]);

    // The app owns the whole tab: an empty list must leave nothing behind.
    const values = (stub.calls[1]?.body as { values: string[][] }).values;
    expect(values).toHaveLength(2);
    expect(values.every((row) => row.every((cell) => cell === ''))).toBe(true);
  });

  it('writes nothing when there is nothing to write and nothing to clear', async () => {
    const stub = new FetchStub([{ body: { values: [SUMMARY_TAB.header] } }]);
    await build(stub, new MemoryIdStore('sheet1')).saveStudentSummaries([]);

    expect(stub.calls).toHaveLength(1);
  });

  it('never touches the Students tab, which is the teacher’s', async () => {
    const stub = new FetchStub([{ body: { values: [SUMMARY_TAB.header] } }, ok]);
    await build(stub, new MemoryIdStore('sheet1')).saveStudentSummaries(summary);

    expect(stub.calls.every((call) => !decodeURIComponent(call.url).includes('Students!'))).toBe(
      true,
    );
  });
});

describe('the groups grid columns', () => {
  it('writes only the two columns the app owns', async () => {
    const grid = { body: { values: [GROUPS_TAB.header, ['s1', 'Ana', 'y']] } };
    const stub = new FetchStub([grid, ok]);
    await build(stub, new MemoryIdStore('sheet1')).syncGroupsGrid([
      { id: 's1', name: 'Ana' },
      { id: 's2', name: 'Ben' },
    ]);

    const write = stub.calls[1];
    expect(write?.url).toContain(encodeURIComponent('Groups!A2:B3'));
    expect(write?.body).toMatchObject({
      values: [
        ['s1', 'Ana'],
        ['s2', 'Ben'],
      ],
    });
  });
});

/**
 * The four methods of the port, over the transport, as the app calls them.
 *
 * The parts above are exercised one call at a time. These are the whole
 * actions: the order two tabs are written in, the read-back that makes a retry
 * safe, and the ranges the API is actually handed.
 */
describe('the whole of the port', () => {
  const STUDENTS = [
    { id: 's1', name: 'Ana' },
    { id: 's2', name: 'Ben' },
  ];
  const SESSION: Session = { id: 'sess1', groupId: 'G1', takenAt: '2026-08-25T09:05:00+08:00' };

  /** A Sheet the teacher has filled in: two Students, one Group, nothing taken
      yet. Anything already recorded is seeded on top. */
  const sheetHolding = (extra: Record<string, SheetRow[]> = {}) =>
    new SheetFetch({
      [STUDENTS_TAB.title]: [
        STUDENTS_TAB.header,
        [...STUDENTS_TAB.encode(STUDENTS[0]!), '3', '0', '0', '0', '0'],
        STUDENTS_TAB.encode(STUDENTS[1]!),
      ],
      [GROUPS_TAB.title]: [
        [...GROUPS_TAB.header, '3A'],
        ['s1', 'Ana', 'y'],
        ['s2', 'Ben', 'y'],
      ],
      [SUMMARY_TAB.title]: [SUMMARY_TAB.header],
      [SESSIONS_TAB.title]: [SESSIONS_TAB.header],
      [ATTENDANCE_TAB.title]: [ATTENDANCE_TAB.header],
      [BEHAVIOR_TAB.title]: [BEHAVIOR_TAB.header],
      ...extra,
    });

  const open = (fetch: SheetFetch) =>
    new GoogleSheet(new SheetsApi(new StubTokens(), fetch.fetch), new MemoryIdStore('kept1'));

  it('reads every tab into one snapshot', async () => {
    const fetch = sheetHolding({
      [SESSIONS_TAB.title]: [SESSIONS_TAB.header, SESSIONS_TAB.encode(SESSION)],
      [ATTENDANCE_TAB.title]: [
        ATTENDANCE_TAB.header,
        ATTENDANCE_TAB.encode(recordAttendance(SESSION, 's1', 'sick', 'flu')),
      ],
    });

    const snapshot = await open(fetch).read();

    expect(snapshot.students).toEqual(STUDENTS);
    expect(snapshot.groups).toEqual([{ id: 'G1', name: '3A', studentIds: ['s1', 's2'] }]);
    expect(snapshot.sessions).toEqual([SESSION]);
    expect(snapshot.ledger.attendance[0]).toMatchObject({ studentId: 's1', pointState: 'held' });
    expect(snapshot.adjustments.get('s1')?.points).toBe(3);
    expect(snapshot.notes.size).toBe(0);
  });

  it('gives a new student a row in the grid before offering the groups', async () => {
    const fetch = sheetHolding({
      [GROUPS_TAB.title]: [
        [...GROUPS_TAB.header, '3A'],
        ['s1', 'Ana', 'y'],
      ],
    });

    await open(fetch).read();

    // Ben was only on the Students tab; without a row here he could never be
    // ticked into a Group.
    expect(fetch.rows(GROUPS_TAB.title)[2]).toEqual(['s2', 'Ben']);
    // The teacher's tick in C is outside the range the app writes.
    expect(fetch.rows(GROUPS_TAB.title)[1]).toEqual(['s1', 'Ana', 'y']);
  });

  it('saves a roll call attendance first, session next, summary last', async () => {
    const fetch = sheetHolding();
    const sheet = open(fetch);
    const snapshot = await sheet.read();
    const rollCall = mark(beginRollCall(SESSION, snapshot.groups[0]!, STUDENTS), 's1', 'present');

    const sofar = fetch.calls.length;
    await sheet.saveRollCall(rollCall, snapshot);

    // Records before the Session row: a Session claiming a roll was taken
    // while its points are lost is the failure that costs the teacher work.
    expect(fetch.written(sofar)).toEqual([
      ATTENDANCE_TAB.title,
      SESSIONS_TAB.title,
      SUMMARY_TAB.title,
    ]);
    // Only Ana was marked, so only Ana has a Record.
    expect(ATTENDANCE_TAB.decode(fetch.rows(ATTENDANCE_TAB.title))).toHaveLength(1);
    expect(SESSIONS_TAB.decode(fetch.rows(SESSIONS_TAB.title))).toEqual([SESSION]);
    // Ana was present, on top of the 3 points the teacher carried in.
    expect(fetch.rows(SUMMARY_TAB.title)[1]?.[SUMMARY_TAB.header.indexOf('Score')]).toBe('4');
  });

  it('writes nothing twice when a roll call is saved again', async () => {
    const fetch = sheetHolding();
    const sheet = open(fetch);
    const snapshot = await sheet.read();
    const rollCall = mark(beginRollCall(SESSION, snapshot.groups[0]!, STUDENTS), 's1', 'present');
    await sheet.saveRollCall(rollCall, snapshot);

    // The teacher lost signal, reloaded, and tapped Save again.
    await sheet.saveRollCall(rollCall, await sheet.read());

    expect(ATTENDANCE_TAB.decode(fetch.rows(ATTENDANCE_TAB.title))).toHaveLength(1);
    expect(SESSIONS_TAB.decode(fetch.rows(SESSIONS_TAB.title))).toHaveLength(1);
  });

  it('saves a behavior point and the score it moves, in that order', async () => {
    const fetch = sheetHolding();
    const sheet = open(fetch);
    const snapshot = await sheet.read();
    const point = awardBehavior('b1', 's2', '2026-08-25', 'positive', 'helped');

    const sofar = fetch.calls.length;
    await sheet.saveBehavior(point, snapshot);

    expect(fetch.written(sofar)).toEqual([BEHAVIOR_TAB.title, SUMMARY_TAB.title]);
    expect(BEHAVIOR_TAB.decode(fetch.rows(BEHAVIOR_TAB.title))).toEqual([point]);
    expect(SUMMARY_TAB.notes(fetch.rows(SUMMARY_TAB.title)).get('s2')).toEqual([
      '2026-08-25: +1 helped',
    ]);
  });

  it('awards one point when the same behavior point is saved twice', async () => {
    const fetch = sheetHolding();
    const sheet = open(fetch);
    const point = awardBehavior('b1', 's2', '2026-08-25', 'positive');
    await sheet.saveBehavior(point, await sheet.read());

    await sheet.saveBehavior(point, await sheet.read());

    expect(BEHAVIOR_TAB.decode(fetch.rows(BEHAVIOR_TAB.title))).toHaveLength(1);
  });

  it('resolves a held point by moving the state and the score together', async () => {
    const fetch = sheetHolding({
      [SESSIONS_TAB.title]: [SESSIONS_TAB.header, SESSIONS_TAB.encode(SESSION)],
      [ATTENDANCE_TAB.title]: [
        ATTENDANCE_TAB.header,
        ATTENDANCE_TAB.encode(recordAttendance(SESSION, 's1', 'present')),
        ATTENDANCE_TAB.encode(recordAttendance(SESSION, 's2', 'sick', 'flu')),
      ],
    });
    const sheet = open(fetch);

    const snapshot = await sheet.read();
    const sofar = fetch.calls.length;
    await sheet.resolveHeldPoint('sess1', 's2', 'awarded', snapshot);

    expect(fetch.written(sofar)).toEqual([ATTENDANCE_TAB.title, SUMMARY_TAB.title]);
    expect(ATTENDANCE_TAB.decode(fetch.rows(ATTENDANCE_TAB.title))[1]).toMatchObject({
      studentId: 's2',
      pointState: 'awarded',
      note: 'flu',
    });
    const summary = fetch.rows(SUMMARY_TAB.title)[2];
    expect(summary?.[0]).toBe('s2');
    expect(summary?.[SUMMARY_TAB.header.indexOf('Score')]).toBe('1');
  });

  it('writes a note to the summary and nothing else', async () => {
    const fetch = sheetHolding();
    const sheet = open(fetch);

    const snapshot = await sheet.read();
    const sofar = fetch.calls.length;
    await sheet.saveNote('s1', 'Mother called', '2026-08-25', snapshot);

    expect(fetch.written(sofar)).toEqual([SUMMARY_TAB.title]);
    expect(SUMMARY_TAB.notes(fetch.rows(SUMMARY_TAB.title)).get('s1')).toEqual([
      '2026-08-25: Mother called',
    ]);
  });
});

describe('GoogleSheet link to the Sheet in use', () => {
  it('has none until the id is settled', () => {
    expect(build(new FetchStub(), new MemoryIdStore()).sheetLink()).toBeNull();
  });

  it('points at the Sheet the reads went to', async () => {
    const stub = new FetchStub([{ body: { values: [] } }], { existing: 'old1' });
    const sheet = build(stub, new MemoryIdStore());
    await sheet.listStudents();

    expect(sheet.sheetLink()).toBe('https://docs.google.com/spreadsheets/d/old1/edit');
  });
});
