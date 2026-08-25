import { describe, it, expect } from 'vitest';
import { addMember, isMember, membersOf, removeMember, type Group, type Student } from './group';

const ana: Student = { id: 's1', name: 'Ana' };
const ben: Student = { id: 's2', name: 'Ben' };
const group: Group = { id: 'g1', name: '3A', studentIds: ['s2', 's1'] };

describe('isMember', () => {
  it('is true only for listed students', () => {
    expect(isMember(group, 's1')).toBe(true);
    expect(isMember(group, 's9')).toBe(false);
  });
});

describe('membersOf', () => {
  it('returns students in group order, not the order given', () => {
    expect(membersOf(group, [ana, ben])).toEqual([ben, ana]);
  });

  it('skips ids with no matching student', () => {
    expect(membersOf({ ...group, studentIds: ['s1', 's9'] }, [ana, ben])).toEqual([ana]);
  });
});

describe('addMember', () => {
  it('appends a new student without mutating the group', () => {
    const updated = addMember(group, 's3');
    expect(updated.studentIds).toEqual(['s2', 's1', 's3']);
    expect(group.studentIds).toEqual(['s2', 's1']);
  });

  it('returns the group unchanged when already a member', () => {
    expect(addMember(group, 's1')).toBe(group);
  });
});

describe('removeMember', () => {
  it('drops the student', () => {
    expect(removeMember(group, 's2').studentIds).toEqual(['s1']);
  });

  it('returns the group unchanged when not a member', () => {
    expect(removeMember(group, 's9')).toBe(group);
  });
});
