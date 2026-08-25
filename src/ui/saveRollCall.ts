/**
 * Committing a roll call to the Sheet.
 *
 * The Sheets API cannot write two tabs atomically, so the order is chosen to
 * fail safely instead. Attendance Records go first — one API call, so they all
 * land or none do — and the Session row last. A failure between the two leaves
 * Records whose Session row is missing: they still score correctly, and the
 * teacher can retry. Writing the Session first would risk the opposite, a
 * Session that claims a roll was taken while its points are lost.
 */
import { recordsToSave, type RollCall } from '../domain/rollCall';
import type { SheetGateway } from '../infra/sheetGateway';

/** How far a save got. Kept so a retry writes only what is still missing and
    pressing Save twice cannot double-count a Student. */
export interface SaveProgress {
  recordsSaved: boolean;
}

export const NOTHING_SAVED: SaveProgress = { recordsSaved: false };

/** Write whatever is still missing. Throws on failure, with the progress made
    so far already reflected in the returned value of the previous attempt. */
export async function saveRollCall(
  sheet: SheetGateway,
  rollCall: RollCall,
  progress: SaveProgress,
  onProgress: (progress: SaveProgress) => void,
): Promise<void> {
  if (!progress.recordsSaved) {
    await sheet.appendAttendance(recordsToSave(rollCall));
    onProgress({ recordsSaved: true });
  }
  await sheet.appendSession(rollCall.session);
}
