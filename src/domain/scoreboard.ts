/**
 * The Scoreboard: every Student's name and Score, highest first.
 *
 * Shown to the class, so it carries only names and totals — never a Note, an
 * Attendance Status or a Point State.
 */
import { adjustmentFor } from './adjustment';
import { isMember, type Group } from './group';
import { scoreFor } from './score';
import type { Snapshot } from './snapshot';
import type { StudentSummary } from './studentSummary';

export interface ScoreboardEntry {
  studentId: string;
  name: string;
  score: number;
}

/** Highest Score first; Students on the same Score keep alphabetical order, so
    the list does not reshuffle at random when a point moves.

    Adjustments count here exactly as they do everywhere else: a Score the class
    sees that disagreed with the Score on the Summary tab would be read as the
    app losing points. */
export function scoreboard(snapshot: Snapshot): ScoreboardEntry[] {
  return ranked(
    snapshot.students.map((student) => ({
      studentId: student.id,
      name: student.name,
      score: scoreFor(student.id, snapshot.ledger, adjustmentFor(student.id, snapshot.adjustments)),
    })),
  );
}

function ranked(entries: ScoreboardEntry[]): ScoreboardEntry[] {
  return entries.sort(
    (left, right) => right.score - left.score || left.name.localeCompare(right.name),
  );
}

/** The Scoreboard for one Group: its members only, in the same order. With no
    Group it is everyone.

    A Student's Score here is still their whole Score. Points belong to the
    Student, not to a Group, so a Student in two Groups shows the same Score in
    both. */
export function scoreboardOf(
  entries: readonly ScoreboardEntry[],
  group: Group | undefined,
): readonly ScoreboardEntry[] {
  return group === undefined
    ? entries
    : entries.filter((entry) => isMember(group, entry.studentId));
}

/** One list on the Scoreboard tab: a heading and the Students under it. */
export interface ScoreboardBlock {
  title: string;
  entries: readonly ScoreboardEntry[];
}

/**
 * The Scoreboard tab's lists, side by side: everyone first, then one per Group
 * in the order the Groups Grid holds them — the same choices the Scoreboard
 * screen offers. A Group nobody is ticked into has no list, as it has no button.
 *
 * Worked out from the summaries being written, not from the Snapshot, so the
 * Scores here are the ones the Summary tab shows in the same save.
 */
export function scoreboardBlocks(
  summaries: readonly StudentSummary[],
  groups: readonly Group[],
): ScoreboardBlock[] {
  const everyone = ranked(
    summaries.map(({ studentId, name, score }) => ({ studentId, name, score })),
  );
  return [
    { title: 'Everyone', entries: everyone },
    ...groups
      .filter((group) => group.studentIds.length > 0)
      .map((group) => ({ title: group.name, entries: scoreboardOf(everyone, group) })),
  ];
}
