import type { BehaviorKind } from './points';

/** A calendar date, `YYYY-MM-DD`. Behavior points belong to a date, not a Session. */
export type CalendarDate = string;

/** A point the teacher awards or subtracts for a Student's conduct. */
export interface BehaviorPoint {
  id: string;
  studentId: string;
  date: CalendarDate;
  kind: BehaviorKind;
  note?: string;
}
