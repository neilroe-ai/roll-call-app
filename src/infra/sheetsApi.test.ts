import { describe, it, expect } from 'vitest';
import { SheetsApi, SheetsApiError } from './sheetsApi';
import { FetchStub, StubTokens } from './testFetch';

const api = (stub: FetchStub, tokens = new StubTokens()) => ({
  api: new SheetsApi(tokens, stub.fetch),
  tokens,
});

describe('SheetsApi', () => {
  it('sends the access token as a bearer header', async () => {
    const stub = new FetchStub([{ body: { values: [] } }]);
    const tokens = new StubTokens();
    await new SheetsApi(tokens, stub.fetch).getValues('sheet1', 'Students!A:Z');
    expect(stub.calls[0]?.url).toContain('/sheet1/values/');
  });

  it('reads an empty tab as no rows, not undefined', async () => {
    const stub = new FetchStub([{ body: {} }]);
    expect(await api(stub).api.getValues('sheet1', 'Students!A:Z')).toEqual([]);
  });

  it('retries once with a fresh token after a 401', async () => {
    const stub = new FetchStub([{ status: 401 }, { body: { values: [['s1', 'Ana']] } }]);
    const { api: sheets, tokens } = api(stub);

    expect(await sheets.getValues('sheet1', 'Students!A:Z')).toEqual([['s1', 'Ana']]);
    expect(tokens.forgotten).toBe(1);
    expect(stub.calls).toHaveLength(2);
  });

  it('gives up after a second 401 rather than looping', async () => {
    const stub = new FetchStub([{ status: 401 }, { status: 401 }]);
    await expect(api(stub).api.getValues('sheet1', 'Students!A:Z')).rejects.toThrow(SheetsApiError);
    expect(stub.calls).toHaveLength(2);
  });

  it('reports the status on a real failure', async () => {
    const stub = new FetchStub([{ status: 404, body: { error: 'not found' } }]);
    await expect(api(stub).api.getValues('gone', 'Students!A:Z')).rejects.toThrow('Sheets API 404');
  });

  it('creates a spreadsheet with the tabs it was given', async () => {
    const stub = new FetchStub([{ body: { spreadsheetId: 'new1' } }]);
    const id = await api(stub).api.createSpreadsheet('Roll Call', ['Students', 'Groups']);

    expect(id).toBe('new1');
    expect(stub.calls[0]?.method).toBe('POST');
    expect(stub.calls[0]?.body).toEqual({
      properties: { title: 'Roll Call' },
      sheets: [{ properties: { title: 'Students' } }, { properties: { title: 'Groups' } }],
    });
  });

  it('fails loudly if creation returns no id', async () => {
    const stub = new FetchStub([{ body: {} }]);
    await expect(api(stub).api.createSpreadsheet('Roll Call', [])).rejects.toThrow('no id');
  });

  it('appends as RAW so a note starting with = stays text', async () => {
    const stub = new FetchStub([{ body: {} }]);
    await api(stub).api.appendValues('sheet1', 'Attendance!A:Z', [['=1+1']]);
    expect(stub.calls[0]?.url).toContain('valueInputOption=RAW');
    expect(stub.calls[0]?.url).toContain('insertDataOption=INSERT_ROWS');
  });

  it('does not call the API to append nothing', async () => {
    const stub = new FetchStub();
    await api(stub).api.appendValues('sheet1', 'Attendance!A:Z', []);
    expect(stub.calls).toEqual([]);
  });
});
