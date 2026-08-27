import { describe, it, expect } from 'vitest';
import { writeBehavior } from './writeBehavior';
import { FakeSheet } from './fakeSheet';
import { awardBehavior } from '../domain/behavior';
import type { CalendarDate } from '../domain/behavior';
import { SUMMARY_TAB } from './rows';

const SCORE = SUMMARY_TAB.header.indexOf('Score');

const TODAY = '2026-08-26' as CalendarDate;
const point = awardBehavior('b1', 's1', TODAY, 'positive', 'helped tidy up');

/** A sheet that has the point but died before the Summary. */
class SummaryWriteFails extends FakeSheet {
  override saveStudentSummaries(): Promise<void> {
    return Promise.reject(new Error('network lost'));
  }
}

describe('writeBehavior', () => {
  it('writes the point and the summary', async () => {
    const sheet = new FakeSheet({ students: [{ id: 's1', name: 'Ana' }] });
    await writeBehavior(sheet, point, await sheet.read());

    expect((await sheet.read()).ledger.behavior).toEqual([point]);
  });

  it('works the Summary out from the point it is writing', async () => {
    const sheet = new FakeSheet({ students: [{ id: 's1', name: 'Ana' }] });
    await writeBehavior(sheet, point, await sheet.read());

    // The point counts the moment it lands, so the Score moves with it, and
    // the reason the teacher gave goes into the log under the point's date.
    const rows = await sheet.rowsForTest('Summary');
    expect(rows[1]?.[SCORE]).toBe('1');
    expect((await sheet.read()).notes.get('s1')).toEqual(['2026-08-26: +1 helped tidy up']);
  });

  it('writes the point before the summary', async () => {
    const sheet = new SummaryWriteFails({ students: [{ id: 's1', name: 'Ana' }] });
    await expect(writeBehavior(sheet, point, await sheet.read())).rejects.toThrow('network lost');

    // The point the teacher awarded survives; the Summary is only stale, and
    // every figure in it is worked out from the Points Ledger anyway.
    expect((await sheet.read()).ledger.behavior).toEqual([point]);
  });

  it('awards the point once however often it is written', async () => {
    const sheet = new FakeSheet({ students: [{ id: 's1', name: 'Ana' }] });
    await writeBehavior(sheet, point, await sheet.read());
    await writeBehavior(sheet, point, await sheet.read());

    expect((await sheet.read()).ledger.behavior).toEqual([point]);
  });

  it('finishes a half-written save without a second point', async () => {
    const sheet = new SummaryWriteFails({ students: [{ id: 's1', name: 'Ana' }] });
    await expect(writeBehavior(sheet, point, await sheet.read())).rejects.toThrow('network lost');

    // The retry finds the point already there and only rewrites the Summary.
    const recovered = new FakeSheet({ students: [{ id: 's1', name: 'Ana' }] });
    await writeBehavior(recovered, point, await recovered.read());
    await writeBehavior(recovered, point, await recovered.read());

    expect((await recovered.read()).ledger.behavior).toHaveLength(1);
  });

  it('tells two points of the same kind apart by their id', async () => {
    const sheet = new FakeSheet({ students: [{ id: 's1', name: 'Ana' }] });
    const second = awardBehavior('b2', 's1', TODAY, 'positive', 'helped tidy up');

    await writeBehavior(sheet, point, await sheet.read());
    await writeBehavior(sheet, second, await sheet.read());

    expect((await sheet.read()).ledger.behavior).toEqual([point, second]);
  });
});
