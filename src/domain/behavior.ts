import { isMember, type Group } from './group';
import { behaviorPoints, type BehaviorKind } from './points';
import type { Session } from './session';

/** A calendar date, `YYYY-MM-DD`. Behavior points belong to a date, not a Session. */
export type CalendarDate = string;

/** The date where the teacher is standing, not in UTC. A 9am lesson in Taiwan
    is the previous day in UTC, which would date the morning's Notes wrongly. */
export function calendarDateOf(instant: Date): CalendarDate {
  const year = String(instant.getFullYear());
  const month = String(instant.getMonth() + 1).padStart(2, '0');
  const day = String(instant.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** A point the teacher awards or subtracts for a Student's conduct. */
export interface BehaviorPoint {
  id: string;
  studentId: string;
  /** The Group the point counts in. Points are kept by Group. */
  groupId: string;
  date: CalendarDate;
  kind: BehaviorKind;
  note?: string;
}

/** Award or subtract a Behavior Point. It is immediate and final: there is no
    held state to resolve later, so what is written here counts at once. */
export function awardBehavior(
  id: string,
  studentId: string,
  groupId: string,
  date: CalendarDate,
  kind: BehaviorKind,
  note?: string,
): BehaviorPoint {
  const point: BehaviorPoint = { id, studentId, groupId, date, kind };
  return note === undefined || note.trim() === '' ? point : { ...point, note: note.trim() };
}

/** How a Behavior Point reads with a sign in front, e.g. `+1`. */
export function signOf(kind: BehaviorKind): string {
  const points = behaviorPoints(kind);
  return points > 0 ? `+${String(points)}` : String(points);
}

/** The Groups a Behavior Point for this Student can count in: every Group they
    belong to, in Sheet column order. */
export function behaviorGroupsOf(studentId: string, groups: readonly Group[]): Group[] {
  return groups.filter((group) => isMember(group, studentId));
}

/**
 * The Group a Behavior Point counts in unless the teacher picks another: the
 * one she last took roll for, since that is most likely the class in front of
 * her. A Student not in that Group gets their own Group she took roll for most
 * recently, then their first Group. A Student in no Group gets nothing: there
 * is no Group for the point to count in.
 */
export function defaultBehaviorGroup(
  studentId: string,
  groups: readonly Group[],
  sessions: readonly Session[],
): Group | undefined {
  const theirs = behaviorGroupsOf(studentId, groups);
  const latestFirst = [...sessions].sort((one, other) => other.takenAt.localeCompare(one.takenAt));
  for (const session of latestFirst) {
    const group = theirs.find((candidate) => candidate.id === session.groupId);
    if (group) return group;
  }
  return theirs[0];
}
