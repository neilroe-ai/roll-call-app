/**
 * Writing a Note about a Student with no roll call in progress.
 *
 * One tab and one write, which makes this the simplest of the four actions —
 * but it is an action, not a request to rewrite a tab, so it belongs on the
 * port beside the others (ADR 0011). A Note changes no Score: nothing is
 * appended to the Points Ledger, and the Summary tab is rewritten only because
 * that is where a Student's Notes Log lives.
 *
 * Nothing here needs a read-back guard. The Summary tab is rewritten whole from
 * the Notes the Sheet already holds plus this one line, so writing it twice
 * leaves the same Sheet as writing it once.
 */
import type { CalendarDate } from '../domain/behavior';
import type { Snapshot } from '../domain/snapshot';
import { afterNote } from '../domain/summariesAfter';
import type { StudentSummary } from '../domain/studentSummary';

/** What writing a Note needs of the Sheet. Not part of the port — this is the
    adapters' own part, shared so the one rule is written once. */
export interface NoteWrites {
  saveStudentSummaries(summaries: readonly StudentSummary[]): Promise<void>;
}

export async function writeNote(
  sheet: NoteWrites,
  studentId: string,
  text: string,
  on: CalendarDate,
  snapshot: Snapshot,
): Promise<void> {
  await sheet.saveStudentSummaries(afterNote(snapshot, studentId, text, on));
}
