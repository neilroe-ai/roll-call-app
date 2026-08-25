import type { BehaviorKind } from './points';

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
