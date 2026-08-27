/** A scripted `fetch` for tests: records every call, replies from a queue.
    Lets the Sheets transport be exercised with no network and no Google. */
import type { TokenProvider } from './googleAuth';
import type { SheetRow } from './rows';
import type { FetchLike } from './sheetsApi';

export interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

export interface StubReply {
  status?: number;
  body?: unknown;
}

export class FetchStub {
  readonly calls: RecordedCall[] = [];
  private readonly replies: StubReply[];

  constructor(replies: StubReply[] = []) {
    this.replies = [...replies];
  }

  readonly fetch: FetchLike = (url, init) => {
    const rawBody = init.body;
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
  private readonly tabs = new Map<string, SheetRow[]>();

  constructor(seed: Record<string, SheetRow[]> = {}) {
    for (const [title, rows] of Object.entries(seed))
      this.tabs.set(
        title,
        rows.map((row) => [...row]),
      );
  }

  /** A tab as it now stands, header row included. */
  rows(title: string): SheetRow[] {
    return this.tabs.get(title) ?? [];
  }

  /** The tab each write touched, in order — the sequence one action leaves
      behind. `from` skips the calls already made, so a set-up read does not
      show up in the action under test. */
  written(from = 0): string[] {
    return this.calls
      .slice(from)
      .filter((call) => call.method !== 'GET')
      .map((call) => tabOf(call.url));
  }

  readonly fetch: FetchLike = (url, init) => {
    const method = init.method ?? 'GET';
    const rawBody = init.body;
    const body: unknown = typeof rawBody === 'string' ? JSON.parse(rawBody) : undefined;
    this.calls.push({ url, method, body });

    const range = rangeOf(url);
    const rows = (body as { values?: string[][] } | undefined)?.values ?? [];
    if (method === 'POST') this.append(range.title, rows);
    if (method === 'PUT') this.update(range, rows);

    const values = method === 'GET' ? this.rows(range.title) : undefined;
    return Promise.resolve(
      new Response(JSON.stringify(values === undefined ? {} : { values }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };

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

function tabOf(url: string): string {
  return rangeOf(url).title;
}

/** A1 letters back to a zero-based column number: A is 0, Z is 25, AA is 26. */
function columnIndex(letters: string): number {
  return [...letters].reduce((total, letter) => total * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
}
