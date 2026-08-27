/**
 * The state behind the screens, driven without a DOM. The paths here — a save
 * that fails, a busy flag mid-write, a roll call surviving a trip to another
 * tab — are the ones no rendering test could reach.
 */
import { describe, expect, it } from 'vitest';
import { AppModel, type Clock } from './appModel';
import { FakeSheet } from '../infra/fakeSheet';
import { SUMMARY_TAB } from '../infra/rows';
import type { SheetGateway } from '../infra/sheetGateway';
import type { RollCallStore } from '../infra/rollCallStore';
import { markOf, noteOf, type SavedRollCall } from '../domain/rollCall';
import type { Session } from '../domain/session';
import type { StudentSummary } from '../domain/studentSummary';
import type { Snapshot } from '../domain/snapshot';
import { heldPoints } from '../domain/heldPoints';
import { summarize } from '../domain/studentSummary';

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

    expect(model.state.snapshot?.students).toEqual(STUDENTS);
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
    expect(model.state.snapshot).toBeNull();
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
    const chosen = model.state.pendingBehavior?.id;

    await model.saveBehavior('helped tidy up');

    expect(model.state.message).toEqual({ text: 'network lost', isError: true });
    // The point stays on screen with what she typed, so Save can be tapped
    // again — and it keeps its id, so it is the same point, not a second one.
    expect(model.state.pendingBehavior).toEqual({
      id: chosen,
      studentId: 's1',
      kind: 'positive',
      note: 'helped tidy up',
    });
  });

  it('awards one point, not two, when the first save half landed', async () => {
    /** A Sheet that loses the connection between the point and the Summary
        exactly once. */
    class LosesTheSummary extends FakeSheet {
      private dropping = true;
      override saveStudentSummaries(summaries: readonly StudentSummary[]): Promise<void> {
        if (!this.dropping) return super.saveStudentSummaries(summaries);
        this.dropping = false;
        return Promise.reject(new Error('network lost'));
      }
    }
    const sheet = new LosesTheSummary({ students: STUDENTS, groups: [GROUP] });
    const model = await started(sheet);
    model.chooseBehavior('s1', 'positive');

    await model.saveBehavior('helped tidy up');
    expect((await sheet.read()).ledger.behavior).toHaveLength(1);
    expect(model.state.message?.isError).toBe(true);

    // She taps Save again on the same point.
    await model.saveBehavior('helped tidy up');

    expect((await sheet.read()).ledger.behavior).toHaveLength(1);
    expect(model.state.pendingBehavior).toBeNull();
    expect(model.state.message).toEqual({ text: '+1 for Amy.', isError: false });
  });
});

describe('settling a held point', () => {
  const SESSION = { id: 'sess1', groupId: 'G1', takenAt: '2026-08-24T09:00:00+08:00' };
  const HELD = {
    sessionId: 'sess1',
    studentId: 's1',
    status: 'sick',
    pointState: 'held',
    note: 'flu',
  } as const;

  const withHeldPoint = () =>
    new FakeSheet({
      students: STUDENTS,
      groups: [GROUP],
      sessions: [SESSION],
      attendance: [
        HELD,
        { sessionId: 'sess1', studentId: 's2', status: 'present', pointState: 'awarded' },
      ],
    });

  const onlyHeld = (model: AppModel) => heldPoints(model.state.snapshot!)[0]!;

  it('awards the point when the documentation arrived', async () => {
    const sheet = withHeldPoint();
    const model = await started(sheet);

    await model.resolveHeldPoint(onlyHeld(model), true);

    const settled = (await sheet.read()).ledger.attendance;
    expect(settled.find((record) => record.studentId === 's1')?.pointState).toBe('awarded');
    expect(model.state.message).toEqual({ text: 'Amy: point awarded.', isError: false });
    // Settled means gone from the list, so the backlog only ever shrinks.
    expect(heldPoints(model.state.snapshot!)).toEqual([]);
  });

  it('denies the point when it never arrived', async () => {
    const sheet = withHeldPoint();
    const model = await started(sheet);

    await model.resolveHeldPoint(onlyHeld(model), false);

    const settled = (await sheet.read()).ledger.attendance;
    expect(settled.find((record) => record.studentId === 's1')?.pointState).toBe('denied');
    expect(model.state.message).toEqual({ text: 'Amy: point denied.', isError: false });
  });

  it('moves the Score with the point, in the same write', async () => {
    const sheet = withHeldPoint();
    const model = await started(sheet);
    const before = summarize(model.state.snapshot!).find((row) => row.studentId === 's1')?.score;

    await model.resolveHeldPoint(onlyHeld(model), true);

    expect(before).toBe(0);
    // The Summary tab the teacher opens, not just the screen, has the point.
    const rows = await sheet.rowsForTest('Summary');
    expect(rows[1]?.[SUMMARY_TAB.header.indexOf('Score')]).toBe('1');
  });

  it('leaves the point held and says why when the write fails', async () => {
    class ResolveFails extends FakeSheet {
      override setPointState(): Promise<void> {
        return Promise.reject(new Error('network lost'));
      }
    }
    const sheet = new ResolveFails({
      students: STUDENTS,
      groups: [GROUP],
      sessions: [SESSION],
      attendance: [HELD],
    });
    const model = await started(sheet);

    await model.resolveHeldPoint(onlyHeld(model), true);

    expect(model.state.message).toEqual({ text: 'network lost', isError: true });
    expect(model.state.busy).toBe(false);
    // Still waiting, so the same two buttons are there to tap again.
    expect(heldPoints(model.state.snapshot!)).toHaveLength(1);
  });
});

describe('a write that lands but cannot be read back', () => {
  /** A Sheet that reads once, at start-up, and not again — the token dies while
      the teacher is marking, after her write has already landed. */
  class ReadsOnce extends FakeSheet {
    private read_ = 0;
    override read(): Promise<Snapshot> {
      this.read_ += 1;
      return this.read_ > 1 ? Promise.reject(new Error('token expired')) : super.read();
    }
  }

  it('says the roll call saved and that the screen is now stale', async () => {
    const sheet = new ReadsOnce({ students: STUDENTS, groups: [GROUP] });
    const model = await started(sheet);
    model.startRollCall(GROUP);
    model.markStudent('s1', 'present');
    model.markStudent('s2', 'present');

    await model.save();

    expect(model.state.message).toEqual({
      text: 'Roll call saved. The Sheet could not be read back: token expired',
      isError: true,
    });
    // The write landed, so the roll call is let go and the Snapshot on screen
    // is the one from start-up, older than the Sheet.
    expect(model.state.rollCall).toBeNull();
    expect(model.state.snapshot?.sessions).toEqual([]);
    expect((await sheet.rowsForTest('Sessions')).length).toBe(2);
    expect(model.state.busy).toBe(false);
  });

  it('says the same of a behavior point', async () => {
    const model = await started(new ReadsOnce({ students: STUDENTS, groups: [GROUP] }));
    model.chooseBehavior('s1', 'positive');

    await model.saveBehavior('helped tidy up');

    expect(model.state.message).toEqual({
      text: '+1 for Amy. The Sheet could not be read back: token expired',
      isError: true,
    });
    // The point is written, so it is not offered for a retry.
    expect(model.state.pendingBehavior).toBeNull();
  });

  it('says the same of a note', async () => {
    const model = await started(new ReadsOnce({ students: STUDENTS, groups: [GROUP] }));

    await model.saveNote(STUDENTS[0]!, 'moved seats');

    expect(model.state.message).toEqual({
      text: 'Note saved. The Sheet could not be read back: token expired',
      isError: true,
    });
  });

  it('reports the read alone when nothing has been written yet', async () => {
    class ReadFails extends FakeSheet {
      override read(): Promise<never> {
        return Promise.reject(new Error('token expired'));
      }
    }
    const model = new AppModel(new ReadFails(), clock);
    await model.start();

    expect(model.state.message).toEqual({ text: 'token expired', isError: true });
  });
});

describe('a reload part way through a roll call', () => {
  /** A device that hangs on to the roll call between one page load and the
      next, standing in for the browser's own storage. */
  class Device implements RollCallStore {
    private held: SavedRollCall | undefined;
    keep(rollCall: SavedRollCall): void {
      this.held = rollCall;
    }
    kept(): SavedRollCall | undefined {
      return this.held;
    }
    forget(): void {
      this.held = undefined;
    }
  }

  /** A Sheet that loses the connection between the Attendance Records and the
      Session row exactly once — the half-write the save order is built for. */
  class LosesTheSessionRow extends FakeSheet {
    private dropping = true;
    override appendSession(session: Session): Promise<void> {
      if (!this.dropping) return super.appendSession(session);
      this.dropping = false;
      return Promise.reject(new Error('network lost'));
    }
  }

  it('puts the teacher back in the roll call she was marking', async () => {
    const sheet = new FakeSheet({ students: STUDENTS, groups: [GROUP] });
    const device = new Device();
    const model = new AppModel(sheet, clock, undefined, device);
    await model.start();
    model.startRollCall(GROUP);
    model.markStudent('s1', 'present');
    model.writeNote('s2', 'left early');

    // The page goes away and comes back: a new model over the same device.
    const reloaded = new AppModel(sheet, clock, undefined, device);
    await reloaded.start();

    expect(reloaded.state.view).toBe('rollCall');
    expect(markOf(reloaded.state.rollCall!, 's1')?.status).toBe('present');
    expect(noteOf(reloaded.state.rollCall!, 's2')).toBe('left early');
  });

  it('saves one Session, not a second one, when the marking is redone', async () => {
    const sheet = new FakeSheet({ students: STUDENTS, groups: [GROUP] });
    const device = new Device();
    const model = new AppModel(sheet, clock, undefined, device);
    await model.start();
    model.startRollCall(GROUP);
    model.markStudent('s1', 'present');
    model.markStudent('s2', 'absent');

    const reloaded = new AppModel(sheet, clock, undefined, device);
    await reloaded.start();
    await reloaded.save();

    expect(await sheet.listSessions()).toHaveLength(1);
    expect(await sheet.listAttendance()).toHaveLength(2);
  });

  it('writes the Attendance Records once when the first save half landed', async () => {
    const sheet = new LosesTheSessionRow({ students: STUDENTS, groups: [GROUP] });
    const device = new Device();
    const model = new AppModel(sheet, clock, undefined, device);
    await model.start();
    model.startRollCall(GROUP);
    model.markStudent('s1', 'present');
    model.markStudent('s2', 'present');

    await model.save();
    // The Records landed; the Session row did not. The roll call is still hers.
    expect(await sheet.listAttendance()).toHaveLength(2);
    expect(await sheet.listSessions()).toHaveLength(0);
    expect(model.state.message).toEqual({ text: 'network lost', isError: true });

    // She reloads and taps Save again.
    const reloaded = new AppModel(sheet, clock, undefined, device);
    await reloaded.start();
    await reloaded.save();

    expect(await sheet.listAttendance()).toHaveLength(2);
    expect(await sheet.listSessions()).toHaveLength(1);
    expect(reloaded.state.message).toEqual({ text: 'Roll call saved.', isError: false });
  });

  it('keeps nothing once the roll call is saved or thrown away', async () => {
    const device = new Device();
    const model = new AppModel(
      new FakeSheet({ students: STUDENTS, groups: [GROUP] }),
      clock,
      undefined,
      device,
    );
    await model.start();
    model.startRollCall(GROUP);
    model.markStudent('s1', 'present');
    model.markStudent('s2', 'present');
    await model.save();

    expect(device.kept()).toBeUndefined();

    model.startRollCall(GROUP);
    model.discardRollCall();
    expect(device.kept()).toBeUndefined();
  });

  it('drops a kept roll call whose Group has gone from the Sheet', async () => {
    const device = new Device();
    const model = new AppModel(
      new FakeSheet({ students: STUDENTS, groups: [GROUP] }),
      clock,
      undefined,
      device,
    );
    await model.start();
    model.startRollCall(GROUP);

    // The teacher cleared that column out of the Groups Grid meanwhile.
    const reloaded = new AppModel(new FakeSheet({ students: STUDENTS }), clock, undefined, device);
    await reloaded.start();

    expect(reloaded.state.rollCall).toBeNull();
    expect(reloaded.state.view).toBe('groups');
    expect(device.kept()).toBeUndefined();
  });

  it('leaves the roll call kept when the Sheet cannot be read', async () => {
    class ReadFails extends FakeSheet {
      override listStudents(): Promise<never> {
        return Promise.reject(new Error('no such tab: Students'));
      }
    }
    const device = new Device();
    const model = new AppModel(
      new FakeSheet({ students: STUDENTS, groups: [GROUP] }),
      clock,
      undefined,
      device,
    );
    await model.start();
    model.startRollCall(GROUP);
    model.markStudent('s1', 'present');

    const offline = new AppModel(new ReadFails(), clock, undefined, device);
    await offline.start();

    expect(offline.state.message).toEqual({ text: 'no such tab: Students', isError: true });
    expect(device.kept()).not.toBeUndefined();
  });
});
