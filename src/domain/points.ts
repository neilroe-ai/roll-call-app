/** Attendance status chosen during roll call. */
export type AttendanceStatus = 'present' | 'absent' | 'sick' | 'other';

/** Where an attendance point stands. `held` is pending until documentation is known. */
export type PointState = 'awarded' | 'held' | 'denied';

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

/** Behavior points are immediate and final: +1 positive, -1 negative. */
export function behaviorPoints(kind: BehaviorKind): number {
  return kind === 'positive' ? 1 : -1;
}
