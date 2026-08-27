/**
 * One read of the Sheet, as it stood.
 *
 * Bundled rather than passed around one piece at a time: a Score, a Summary or
 * a Scoreboard needs all of these or none of them, and reading them separately
 * is how they come to disagree. Nothing here is live — the teacher can edit her
 * own columns whenever she likes — so the app takes a fresh Snapshot after
 * every write instead of editing the one it holds.
 */
import type { Adjustment } from './adjustment';
import type { Group, Student } from './group';
import type { Session } from './session';
import type { PointsLedger } from './score';

export interface Snapshot {
  students: readonly Student[];
  groups: readonly Group[];
  sessions: readonly Session[];
  ledger: PointsLedger;
  /** The teacher's hand-typed corrections, keyed by student id. */
  adjustments: ReadonlyMap<string, Adjustment>;
  /** Each Student's Notes Log as the Sheet holds it, keyed by student id. */
  notes: ReadonlyMap<string, readonly string[]>;
}
