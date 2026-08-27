/** A person counted in roll call. Exists independently of any Group. */
export interface Student {
  id: string;
  /** Display name as the teacher writes it on the Students tab. */
  name: string;
}

/** A named set of Students that roll call is taken against. */
export interface Group {
  id: string;
  name: string;
  /** Membership is many-to-many: a Student may appear in several Groups. */
  studentIds: string[];
}

/** Whether a Student belongs to a Group. */
export function isMember(group: Group, studentId: string): boolean {
  return group.studentIds.includes(studentId);
}

/** The Students of a Group, in the order the Group lists them.
    Ids with no matching Student are skipped. */
export function membersOf(group: Group, students: readonly Student[]): Student[] {
  const byId = new Map(students.map((student) => [student.id, student]));
  return group.studentIds
    .map((id) => byId.get(id))
    .filter((student): student is Student => student !== undefined);
}
