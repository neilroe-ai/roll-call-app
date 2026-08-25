import { describe, it, expect } from 'vitest';
import { GoogleSheet, SHEET_TITLE, type IdStore } from './googleSheet';
import { SheetsApi } from './sheetsApi';
import { FetchStub, StubTokens } from './testFetch';
import { ALL_TABS } from './rows';
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
const notFound = { status: 404, body: { error: 'File not found' } };

const build = (stub: FetchStub, store: IdStore) =>
  new GoogleSheet(new SheetsApi(new StubTokens(), stub.fetch), store);

describe('GoogleSheet first run', () => {
  it('creates the Sheet with all five tabs and writes their headers', async () => {
    const stub = new FetchStub([...createReplies, ok]);
    const store = new MemoryIdStore();
    await build(stub, store).ensureTabs();

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
