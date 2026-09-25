/**
 * The Scoreboard: one Group's Students, name and Score, highest first.
 *
 * Shown to the class, so it carries only names and totals — never a Note, an
 * Attendance Status or a Point State. Points are kept by Group, so there is a
 * Scoreboard per Group and none for everyone: a Student in two Groups shows the
 * Score they earned in each.
 */
import type { Group } from './group';
import type { StudentSummary } from './studentSummary';

export interface ScoreboardEntry {
  studentId: string;
  name: string;
  score: number;
}

/** One Group's Scoreboard, worked out from the summaries so a Score the class
    sees always agrees with the Summary tab. Highest Score first; Students on
    the same Score keep alphabetical order, so the list does not reshuffle at
    random when a point moves. */
export function scoreboardOf(
  summaries: readonly StudentSummary[],
  group: Group,
): ScoreboardEntry[] {
  const entries: ScoreboardEntry[] = [];
  for (const summary of summaries) {
    const figures = summary.groups.find((candidate) => candidate.groupId === group.id);
    if (figures === undefined) continue;
    entries.push({ studentId: summary.studentId, name: summary.name, score: figures.score });
  }
  return entries.sort(
    (left, right) => right.score - left.score || left.name.localeCompare(right.name),
  );
}

/** One list on the Scoreboard tab: a heading and the Students under it. */
export interface ScoreboardBlock {
  title: string;
  entries: readonly ScoreboardEntry[];
}

/**
 * The Scoreboard tab's lists, side by side: one per Group in the order the
 * Groups Grid holds them — the same choices the Scoreboard screen offers. A
 * Group nobody is ticked into has no list, as it has no button.
 *
 * Worked out from the summaries being written, not from the Snapshot, so the
 * Scores here are the ones the Summary tab shows in the same save.
 */
export function scoreboardBlocks(
  summaries: readonly StudentSummary[],
  groups: readonly Group[],
): ScoreboardBlock[] {
  return groups
    .filter((group) => group.studentIds.length > 0)
    .map((group) => ({ title: group.name, entries: scoreboardOf(summaries, group) }));
}
