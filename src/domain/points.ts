/** Attendance status chosen during roll call. */
export type AttendanceStatus = 'present' | 'absent' | 'sick' | 'other';

/** Every Attendance Status, in the order the teacher sees them. One list, so
    the buttons on screen and the values the Sheet accepts cannot drift apart. */
export const STATUSES: readonly AttendanceStatus[] = ['present', 'absent', 'sick', 'other'];

/** Where an attendance point stands. A `held` point waits for documentation. */
export type PointState = 'awarded' | 'held' | 'denied';

export const POINT_STATES: readonly PointState[] = ['awarded', 'held', 'denied'];

/** The point state assigned at roll call, before any later resolution. */
export function initialPointState(status: AttendanceStatus): PointState {
  switch (status) {
    case 'present':
      return 'awarded';
    case 'absent':
      return 'denied';
    case 'sick':
    case 'other':
      return 'held';
  }
}

/** A held point resolves once documentation (sick note / paperwork) is known. */
export function resolveHeld(documentationProvided: boolean): PointState {
  return documentationProvided ? 'awarded' : 'denied';
}

/** Points from an attendance point state. `held` counts as 0 until it resolves. */
export function attendancePoints(state: PointState): number {
  return state === 'awarded' ? 1 : 0;
}

/** A behavior point awarded ad hoc during class. */
export type BehaviorKind = 'positive' | 'negative';

export const BEHAVIOR_KINDS: readonly BehaviorKind[] = ['positive', 'negative'];

/** Behavior points are immediate and final: +1 positive, -1 negative. */
export function behaviorPoints(kind: BehaviorKind): number {
  return kind === 'positive' ? 1 : -1;
}

/** A Student's Attendance Counts: how many Sessions they took each Attendance
    Status in. */
export type AttendanceCounts = Record<AttendanceStatus, number>;

/** Every Attendance Status at zero — the starting point for any tally. */
export function emptyCounts(): AttendanceCounts {
  return Object.fromEntries(STATUSES.map((status) => [status, 0])) as AttendanceCounts;
}
