/**
 * The state behind the screens, driven without a DOM. The paths here — a save
 * that fails, a busy flag mid-write, a roll call surviving a trip to another
 * tab — are the ones no rendering test could reach.
 */
import { describe, expect, it } from 'vitest';
import { AppModel, type Clock } from './appModel';
import { FakeSheet } from '../infra/fakeSheet';
import type { SheetGateway } from '../infra/sheetGateway';

const STUDENTS = [
  { id: 's1', name: 'Amy' },
  { id: 's2', name: 'Ben' },
];
const GROUP = { id: 'G1', name: '3A', studentIds: ['s1', 's2'] };

let ids = 0;
const clock: Clock = {
  now: () => new Date('2026-08-26T09:00:00Z'),
  newId: () => `id-${String(++ids)}`,
};

/** A model already showing the Sheet, plus the sheet behind it. */
async function started(
  sheet: SheetGateway = new FakeSheet({ students: STUDENTS, groups: [GROUP] }),
) {
  const model = new AppModel(sheet, clock);
  await model.start();
  return model;
}

/** A sheet that fails every write, standing in for a dead token. */
class WritesFail extends FakeSheet {
  override saveRollCall(): Promise<void> {
    return Promise.reject(new Error('network lost'));
  }
  override saveStudentSummaries(): Promise<void> {
    return Promise.reject(new Error('network lost'));
  }
  override appendBehavior(): Promise<void> {
    return Promise.reject(new Error('network lost'));
  }
}

describe('starting up', () => {
  it('reads the Sheet and clears the connecting message', async () => {
    const model = await started();

    expect(model.state.data?.students).toEqual(STUDENTS);
    expect(model.state.message).toBeNull();
    expect(model.state.busy).toBe(false);
  });

  it('shows what went wrong when the Sheet cannot be read', async () => {
    class ReadFails extends FakeSheet {
      override listStudents(): Promise<never> {
        return Promise.reject(new Error('no such tab: Students'));
      }
    }
    const model = new AppModel(new ReadFails(), clock);
    await model.start();

    expect(model.state.message).toEqual({ text: 'no such tab: Students', isError: true });
    expect(model.state.busy).toBe(false);
    expect(model.state.data).toBeNull();
  });

  it('reports every change to its listener', async () => {
    const seen: (string | null)[] = [];
    const model = new AppModel(new FakeSheet({ students: STUDENTS }), clock, (state) =>
      seen.push(state.message?.text ?? null),
    );
    await model.start();

    expect(seen[0]).toBe('Connecting to your Sheet…');
    expect(seen.at(-1)).toBeNull();
  });
});

describe('taking roll', () => {
  it('opens the note field for a status that has to be explained', async () => {
    const model = await started();
    model.startRollCall(GROUP);

    model.markStudent('s1', 'present');
    expect(model.state.noteFor).toBeNull();

    model.markStudent('s1', 'sick');
    expect(model.state.noteFor).toBe('s1');
  });

  it('keeps a roll call in progress when the teacher visits another tab', async () => {
    const model = await started();
    model.startRollCall(GROUP);
    model.markStudent('s1', 'present');

    model.show('scoreboard');
    expect(model.state.rollCall).not.toBeNull();

    // "Take roll" goes back to the roll being marked, not to the group list.
    model.show('groups');
    expect(model.state.view).toBe('rollCall');
  });

  it('throws the roll call away only when the teacher says so', async () => {
    const model = await started();
    model.startRollCall(GROUP);
    model.discardRollCall();

    expect(model.state.rollCall).toBeNull();
    expect(model.state.view).toBe('groups');
  });

  it('keeps the roll call on screen when the save fails', async () => {
    const model = await started(new WritesFail({ students: STUDENTS, groups: [GROUP] }));
    model.startRollCall(GROUP);
    model.markStudent('s1', 'present');

    await model.save();

    // Nothing is thrown away on a failure: the teacher can tap Save again.
    expect(model.state.rollCall).not.toBeNull();
    expect(model.state.message).toEqual({ text: 'network lost', isError: true });
    expect(model.state.busy).toBe(false);
  });

  it('is busy while the save is in flight', async () => {
    const model = await started();
    model.startRollCall(GROUP);
    model.markStudent('s1', 'present');

    const saving = model.save();
    expect(model.state.busy).toBe(true);

    await saving;
    expect(model.state.busy).toBe(false);
    expect(model.state.message).toEqual({ text: 'Roll call saved.', isError: false });
  });
});

describe('writing outside a roll call', () => {
  it('writes nothing when the note is blank', async () => {
    const sheet = new FakeSheet({ students: STUDENTS, groups: [GROUP] });
    const model = await started(sheet);
    model.openNote('s1');

    await model.saveNote(STUDENTS[0]!, '   ');

    expect(model.state.noteFor).toBeNull();
    expect(await sheet.listNotesLogs()).toEqual(new Map());
  });

  it('says what went wrong when a behavior point cannot be written', async () => {
    const model = await started(new WritesFail({ students: STUDENTS, groups: [GROUP] }));
    model.chooseBehavior('s1', 'positive');

    await model.saveBehavior(STUDENTS[0]!, 'positive', 'helped tidy up');

    expect(model.state.message).toEqual({ text: 'network lost', isError: true });
    expect(model.state.pendingBehavior).toBeNull();
  });
});
