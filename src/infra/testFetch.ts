/** A scripted `fetch` for tests: records every call, replies from a queue.
    Lets the Sheets transport be exercised with no network and no Google. */
import type { TokenProvider } from './googleAuth';
import type { SheetRow } from './rows';
import type { ColumnGroup, FetchLike } from './sheetsApi';

export interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

export interface StubReply {
  status?: number;
  body?: unknown;
}

/**
 * How the stubs answer Drive, which the gateway asks before it trusts an id.
 *
 * Defaults describe the ordinary case: the remembered Sheet is still there, and
 * Drive holds no other one. Drive calls are answered here rather than from the
 * reply queue, so a test scripts only the Sheets traffic it is about.
 */
export interface DriveState {
  /** The Sheet Drive says the app already made, if any. */
  existing?: string | null;
  /** Whether a remembered id still points at a Sheet outside the bin. */
  usable?: boolean;
  /** The remembered Sheet is gone from Drive altogether, not just binned. */
  missing?: boolean;
}

/** Whether a url is Drive rather than Sheets, and if so what it asks. */
function driveReply(url: string, drive: DriveState): StubReply | undefined {
  if (!url.startsWith('https://www.googleapis.com/drive/v3/files')) return undefined;
  if (url.includes('?q=')) {
    const existing = drive.existing ?? null;
    return { body: { files: existing === null ? [] : [{ id: existing }] } };
  }
  if (drive.missing === true) return { status: 404, body: { error: 'File not found' } };
  return { body: { trashed: drive.usable === false } };
}

export class FetchStub {
  readonly calls: RecordedCall[] = [];
  /** Drive traffic, kept apart so `calls` stays the Sheets story under test. */
  readonly driveCalls: RecordedCall[] = [];
  private readonly replies: StubReply[];

  constructor(
    replies: StubReply[] = [],
    private readonly drive: DriveState = {},
  ) {
    this.replies = [...replies];
  }

  readonly fetch: FetchLike = (url, init) => {
    const rawBody = init.body;
    const fromDrive = driveReply(url, this.drive);
    if (fromDrive !== undefined) {
      this.driveCalls.push({ url, method: init.method ?? 'GET', body: undefined });
      return Promise.resolve(
        new Response(JSON.stringify(fromDrive.body), {
          status: fromDrive.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    this.calls.push({
      url,
      method: init.method ?? 'GET',
      body: typeof rawBody === 'string' ? JSON.parse(rawBody) : undefined,
    });
    const reply = this.replies.shift() ?? {};
    const status = reply.status ?? 200;
    return Promise.resolve(
      new Response(JSON.stringify(reply.body ?? {}), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
}

/** A TokenProvider that hands out predictable tokens and counts re-asks. */
export class StubTokens implements TokenProvider {
  forgotten = 0;
  private issued = 0;

  getToken(): Promise<string> {
    this.issued += 1;
    return Promise.resolve(`token-${this.issued}`);
  }

  forget(): void {
    this.forgotten += 1;
  }
}

/**
 * A Sheets API that answers out of tabs held in memory: reads come back from
 * the rows it holds, writes are applied to them and recorded.
 *
 * `FetchStub` scripts one reply per call, which is enough for a single part but
 * not for a whole action — `read()` alone makes seven calls, and a save reads
 * back what it already wrote. This holds a Sheet instead, so the gateway's
 * ordering, ranges and retries can be exercised as the app performs them.
 */
export class SheetFetch {
  readonly calls: RecordedCall[] = [];
  /** The tab each call in `calls` was about, index for index. */
  private readonly touched: string[] = [];
  private readonly tabs = new Map<string, SheetRow[]>();
  /** Each tab's numeric id, as the Sheets API numbers them. */
  private readonly ids = new Map<string, number>();
  private readonly groups = new Map<string, ColumnGroup[]>();

  constructor(
    seed: Record<string, SheetRow[]> = {},
    private readonly drive: DriveState = {},
  ) {
    for (const [title, rows] of Object.entries(seed)) {
      this.tabs.set(
        title,
        rows.map((row) => [...row]),
      );
      this.ids.set(title, this.ids.size);
    }
  }

  /** A tab as it now stands, header row included. */
  rows(title: string): SheetRow[] {
    return this.tabs.get(title) ?? [];
  }

  /** Whether the Sheet has a tab by this title at all. */
  hasTab(title: string): boolean {
    return this.ids.has(title);
  }

  /** Take a tab away, standing in for a Sheet made before the app had it. */
  dropTab(title: string): void {
    this.tabs.delete(title);
    this.ids.delete(title);
  }

  /** A tab's column groups, left to right. */
  columnGroups(title: string): ColumnGroup[] {
    return this.groups.get(title) ?? [];
  }

  /** Hide or show one of a tab's column groups, as the teacher would with its
      +/- toggle. */
  setCollapsed(title: string, start: number, collapsed: boolean): void {
    const group = this.columnGroups(title).find((candidate) => candidate.start === start);
    if (group === undefined) throw new Error(`no column group at ${String(start)} on ${title}`);
    group.collapsed = collapsed;
  }

  /** The tab each write touched, in order — the sequence one action leaves
      behind. `from` skips the calls already made, so a set-up read does not
      show up in the action under test. */
  written(from = 0): string[] {
    return this.calls
      .map((call, index) => ({ call, tab: this.touched[index] ?? '' }))
      .slice(from)
      .filter(({ call }) => call.method !== 'GET' && !call.url.includes(':batchUpdate'))
      .map(({ tab }) => tab);
  }

  readonly fetch: FetchLike = (url, init) => {
    const fromDrive = driveReply(url, this.drive);
    if (fromDrive !== undefined) return reply(fromDrive.status ?? 200, fromDrive.body);
    const method = init.method ?? 'GET';
    const rawBody = init.body;
    const body: unknown = typeof rawBody === 'string' ? JSON.parse(rawBody) : undefined;
    this.calls.push({ url, method, body });

    if (url.includes(':batchUpdate')) {
      this.touched.push('');
      return reply(200, this.batchUpdate((body as { requests: BatchRequest[] }).requests));
    }
    if (!url.includes('/values/')) {
      this.touched.push('');
      return reply(200, this.layout());
    }

    const range = rangeOf(url);
    this.touched.push(range.title);
    if (!this.ids.has(range.title)) {
      return reply(400, { error: `Unable to parse range: ${range.title}` });
    }
    const rows = (body as { values?: string[][] } | undefined)?.values ?? [];
    if (method === 'POST') this.append(range.title, rows);
    if (method === 'PUT') this.update(range, rows);

    const values = method === 'GET' ? this.rows(range.title) : undefined;
    return reply(200, values === undefined ? {} : { values });
  };

  private titleOf(sheetId: number): string {
    for (const [title, id] of this.ids) if (id === sheetId) return title;
    throw new Error(`no tab with id ${String(sheetId)}`);
  }

  private layout(): unknown {
    return {
      sheets: [...this.ids].map(([title, sheetId]) => ({
        properties: { sheetId, title },
        columnGroups: this.columnGroups(title).map((group) => ({
          range: { sheetId, dimension: 'COLUMNS', startIndex: group.start, endIndex: group.end },
          depth: 1,
          collapsed: group.collapsed,
        })),
      })),
    };
  }

  /** The requests the app sends, applied the way Sheets applies them. A delete
      or an update naming a group that is not there fails, as it does for real. */
  private batchUpdate(requests: readonly BatchRequest[]): unknown {
    const replies = requests.map((request) => {
      if (request.addSheet) {
        const title = request.addSheet.properties.title;
        const sheetId = 100 + this.ids.size;
        this.ids.set(title, sheetId);
        this.tabs.set(title, []);
        return { addSheet: { properties: { sheetId, title } } };
      }
      const range =
        request.addDimensionGroup?.range ??
        request.deleteDimensionGroup?.range ??
        request.updateDimensionGroup?.dimensionGroup.range;
      if (range === undefined) throw new Error('unexpected batchUpdate request');
      const title = this.titleOf(range.sheetId);
      const groups = this.columnGroups(title);
      const at = groups.findIndex(
        (group) => group.start === range.startIndex && group.end === range.endIndex,
      );
      if (request.addDimensionGroup) {
        groups.push({ start: range.startIndex, end: range.endIndex, collapsed: false });
        groups.sort((left, right) => left.start - right.start);
      } else {
        if (at === -1) throw new Error(`no column group ${JSON.stringify(range)}`);
        if (request.deleteDimensionGroup) groups.splice(at, 1);
        else groups[at]!.collapsed = request.updateDimensionGroup!.dimensionGroup.collapsed;
      }
      this.groups.set(title, groups);
      return {};
    });
    return { replies };
  }

  private append(title: string, rows: readonly SheetRow[]): void {
    const existing = this.tabs.get(title) ?? [];
    this.tabs.set(title, [...existing, ...rows]);
  }

  /** Overwrite an exact range, leaving the cells outside it alone — a write to
      A2:B is not allowed to blank the teacher's tick in C. */
  private update({ title, row, column }: Range, rows: readonly SheetRow[]): void {
    const tab = [...(this.tabs.get(title) ?? [])];
    rows.forEach((cells, offset) => {
      const at = row - 1 + offset;
      const existing = [...(tab[at] ?? [])];
      cells.forEach((cell, index) => (existing[column + index] = cell));
      tab[at] = existing;
    });
    this.tabs.set(title, tab);
  }
}

interface GroupRange {
  sheetId: number;
  startIndex: number;
  endIndex: number;
}

interface BatchRequest {
  addSheet?: { properties: { title: string } };
  addDimensionGroup?: { range: GroupRange };
  deleteDimensionGroup?: { range: GroupRange };
  updateDimensionGroup?: { dimensionGroup: { range: GroupRange; collapsed: boolean } };
}

function reply(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

interface Range {
  title: string;
  /** 1-based, as the Sheet counts rows. */
  row: number;
  /** 0-based, as a row array is indexed. */
  column: number;
}

/** The range a request names, out of its url. */
function rangeOf(url: string): Range {
  const raw = decodeURIComponent(url.split('/values/')[1] ?? '').split(/[?:]/)[0] ?? '';
  const [title = '', cells = ''] = raw.split('!');
  const start = /^([A-Z]+)(\d+)?/.exec(cells.split(':')[0] ?? '');
  return {
    title,
    row: Number(start?.[2] ?? 1),
    column: columnIndex(start?.[1] ?? 'A'),
  };
}

/** A1 letters back to a zero-based column number: A is 0, Z is 25, AA is 26. */
function columnIndex(letters: string): number {
  return [...letters].reduce((total, letter) => total * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
}
