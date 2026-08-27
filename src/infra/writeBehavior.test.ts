import { describe, it, expect } from 'vitest';
import { writeBehavior } from './writeBehavior';
import { FakeSheet } from './fakeSheet';
import { awardBehavior } from '../domain/behavior';
import type { CalendarDate } from '../domain/behavior';

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
    await writeBehavior(sheet, point, []);

    expect((await sheet.read()).ledger.behavior).toEqual([point]);
  });

  it('writes the point before the summary', async () => {
    const sheet = new SummaryWriteFails({ students: [{ id: 's1', name: 'Ana' }] });
    await expect(writeBehavior(sheet, point, [])).rejects.toThrow('network lost');

    // The point the teacher awarded survives; the Summary is only stale, and
    // every figure in it is worked out from the Points Ledger anyway.
    expect((await sheet.read()).ledger.behavior).toEqual([point]);
  });

  it('awards the point once however often it is written', async () => {
    const sheet = new FakeSheet({ students: [{ id: 's1', name: 'Ana' }] });
    await writeBehavior(sheet, point, []);
    await writeBehavior(sheet, point, []);

    expect((await sheet.read()).ledger.behavior).toEqual([point]);
  });

  it('finishes a half-written save without a second point', async () => {
    const sheet = new SummaryWriteFails({ students: [{ id: 's1', name: 'Ana' }] });
    await expect(writeBehavior(sheet, point, [])).rejects.toThrow('network lost');

    // The retry finds the point already there and only rewrites the Summary.
    const recovered = new FakeSheet({ students: [{ id: 's1', name: 'Ana' }] });
    await writeBehavior(recovered, point, []);
    await writeBehavior(recovered, point, []);

    expect((await recovered.read()).ledger.behavior).toHaveLength(1);
  });

  it('tells two points of the same kind apart by their id', async () => {
    const sheet = new FakeSheet({ students: [{ id: 's1', name: 'Ana' }] });
    const second = awardBehavior('b2', 's1', TODAY, 'positive', 'helped tidy up');

    await writeBehavior(sheet, point, []);
    await writeBehavior(sheet, second, []);

    expect((await sheet.read()).ledger.behavior).toEqual([point, second]);
  });
});
