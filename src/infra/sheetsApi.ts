/**
 * Thin transport over the Google Sheets REST API.
 *
 * Knows about HTTP, tokens and ranges; knows nothing about attendance. `fetch`
 * is injected so this is testable without a network or a Google account.
 */
import type { TokenProvider } from './googleAuth';
import type { SheetRow } from './rows';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class SheetsApiError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Sheets API ${status}: ${detail}`);
    this.name = 'SheetsApiError';
  }
}

interface ValueRange {
  values?: SheetRow[];
}

interface CreatedSpreadsheet {
  spreadsheetId?: string;
}

interface DriveFileList {
  files?: { id?: string }[];
}

interface DriveFile {
  trashed?: boolean;
}

export class SheetsApi {
  constructor(
    private readonly tokens: TokenProvider,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  /** One authorised request. A 401 means the token died early, so it is dropped
      and the request retried once with a fresh one — an expired token must not
      surface as a failed roll call. */
  private async send<T>(url: string, init: RequestInit, retrying = false): Promise<T> {
    const token = await this.tokens.getToken();
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401 && !retrying) {
      this.tokens.forget();
      return this.send<T>(url, init, true);
    }
    if (!response.ok) {
      throw new SheetsApiError(response.status, await response.text());
    }
    return (await response.json()) as T;
  }

  /** Create a spreadsheet with the given tabs. The app owns the file it makes,
      which is what keeps the narrow `drive.file` scope workable (ADR 0004). */
  async createSpreadsheet(title: string, tabTitles: readonly string[]): Promise<string> {
    const created = await this.send<CreatedSpreadsheet>(BASE, {
      method: 'POST',
      body: JSON.stringify({
        properties: { title },
        sheets: tabTitles.map((tabTitle) => ({ properties: { title: tabTitle } })),
      }),
    });
    if (!created.spreadsheetId) throw new Error('Sheets API created a file with no id');
    return created.spreadsheetId;
  }

  /**
   * The id of a spreadsheet with this title that the app has already made for
   * the signed-in teacher, or null.
   *
   * `drive.file` narrows the listing to the app's own files, so this can never
   * see anything else in her Drive. Oldest first, so every browser she signs in
   * from settles on the same one.
   */
  async findSpreadsheet(title: string): Promise<string | null> {
    const query =
      `name = '${title.replace(/'/g, "\\'")}' and ` +
      `mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const url =
      `${DRIVE_FILES}?q=${encodeURIComponent(query)}` +
      `&orderBy=createdTime&pageSize=1&fields=${encodeURIComponent('files(id)')}&spaces=drive`;
    const body = await this.send<DriveFileList>(url, { method: 'GET' });
    return body.files?.[0]?.id ?? null;
  }

  /** Whether a remembered id still points at a Sheet worth writing to. A file
      in the bin still answers every read and write, so without this the app
      keeps filing roll calls into a spreadsheet she cannot see. */
  async isUsable(spreadsheetId: string): Promise<boolean> {
    const url = `${DRIVE_FILES}/${spreadsheetId}?fields=${encodeURIComponent('trashed')}`;
    try {
      const file = await this.send<DriveFile>(url, { method: 'GET' });
      return file.trashed !== true;
    } catch (error) {
      if (error instanceof SheetsApiError && error.status === 404) return false;
      throw error;
    }
  }

  /** Every row of a tab. An empty tab comes back with no `values` key at all. */
  async getValues(spreadsheetId: string, range: string): Promise<SheetRow[]> {
    const url = `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const body = await this.send<ValueRange>(url, { method: 'GET' });
    return body.values ?? [];
  }

  /** Add rows to the end of a tab. RAW so a note like "=1" stays text, and a
      date the teacher never typed is never invented. */
  async appendValues(
    spreadsheetId: string,
    range: string,
    rows: readonly string[][],
  ): Promise<void> {
    if (rows.length === 0) return;
    const url =
      `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append` +
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    await this.send(url, { method: 'POST', body: JSON.stringify({ values: rows }) });
  }

  /** Overwrite an exact range. */
  async updateValues(
    spreadsheetId: string,
    range: string,
    rows: readonly string[][],
  ): Promise<void> {
    const url = `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
    await this.send(url, { method: 'PUT', body: JSON.stringify({ values: rows }) });
  }
}
