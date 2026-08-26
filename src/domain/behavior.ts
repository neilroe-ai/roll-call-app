import { behaviorPoints, type BehaviorKind } from './points';

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
  date: CalendarDate;
  kind: BehaviorKind;
  note?: string;
}

/** Award or subtract a Behavior Point. It is immediate and final: there is no
    held state to resolve later, so what is written here counts at once. */
export function awardBehavior(
  id: string,
  studentId: string,
  date: CalendarDate,
  kind: BehaviorKind,
  note?: string,
): BehaviorPoint {
  const point: BehaviorPoint = { id, studentId, date, kind };
  return note === undefined || note.trim() === '' ? point : { ...point, note: note.trim() };
}

/** How a Behavior Point reads with a sign in front, e.g. `+1`. */
export function signOf(kind: BehaviorKind): string {
  const points = behaviorPoints(kind);
  return points > 0 ? `+${String(points)}` : String(points);
}
