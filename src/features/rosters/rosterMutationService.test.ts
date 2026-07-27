import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { RosterMutationService } from './rosterMutationService';
import { RosterReadService } from './rosterReadService';

let database: ClassroomDatabase;
let mutation: RosterMutationService;
let read: RosterReadService;
let history: EditHistoryService;
let ids: string[];

beforeEach(async () => {
  database = new ClassroomDatabase(`roster-foundation-${crypto.randomUUID()}`);
  await database.open();
  ids = [];
  mutation = new RosterMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => '2026-07-27T12:00:00.000Z',
  });
  read = new RosterReadService(database);
  history = new EditHistoryService(database, {
    now: () => '2026-07-27T13:00:00.000Z',
  });

  await database.schoolYears.put({
    id: 'year-1',
    label: '2026–2027',
    startsOn: '2026-08-24',
    endsOn: '2027-06-18',
    active: true,
    lifecycleState: 'active',
  });
  await database.learnerContexts.bulkPut([
    {
      id: 'class-1',
      kind: 'class',
      name: 'Grade 3 Chinese',
      schoolYearId: 'year-1',
      status: 'active',
    },
    {
      id: 'group-1',
      kind: 'group',
      name: 'Beginner Chinese',
      schoolYearId: 'year-1',
      status: 'active',
    },
    {
      id: 'individual-1',
      kind: 'individual',
      name: 'Carlie 1-on-1',
      schoolYearId: 'year-1',
      status: 'active',
    },
  ]);
});

afterEach(async () => {
  await database.delete();
});

describe('Student and roster foundation', () => {
  it('creates a Student and roster membership as one atomic undoable action', async () => {
    ids = ['student-new', 'membership-new', 'log-create-and-add'];

    const result = await mutation.createStudentAndAddToRoster(
      'group-1',
      {
        name: 'Elena Park',
        preferredName: 'Ellie',
        notes: 'Created from the Group roster.',
      },
      'Student',
    );

    expect(result.student).toMatchObject({
      id: 'student-new',
      name: 'Elena Park',
      preferredName: 'Ellie',
    });
    expect(result.membership).toMatchObject({
      id: 'membership-new',
      contextId: 'group-1',
      studentId: 'student-new',
      role: 'Student',
    });
    expect(await database.studentRecords.count()).toBe(1);
    expect(await database.rosterMemberships.count()).toBe(1);

    await history.undo();
    expect(await database.studentRecords.get('student-new')).toBeUndefined();
    expect(await database.rosterMemberships.get('membership-new')).toBeUndefined();

    await history.redo();
    expect(await database.studentRecords.get('student-new')).toBeDefined();
    expect(await database.rosterMemberships.get('membership-new')).toBeDefined();
  });

  it('keeps Class, Group, and Individual as peer contexts with independent roster rules', async () => {
    ids = [
      'student-1',
      'log-create',
      'membership-class',
      'log-class',
      'membership-group',
      'log-group',
    ];
    const student = await mutation.createStudent({ name: 'Amy Chen' });
    await mutation.addToRoster({
      contextId: 'class-1',
      studentId: student.id,
      role: 'Student',
    });
    await mutation.addToRoster({
      contextId: 'group-1',
      studentId: student.id,
    });

    const classRoster = await read.loadContextRoster('class-1');
    const groupRoster = await read.loadContextRoster('group-1');
    const individual = await read.loadContextRoster('individual-1');

    expect(classRoster.members).toHaveLength(1);
    expect(groupRoster.members).toHaveLength(1);
    expect(classRoster.members[0]?.student.id).toBe('student-1');
    expect(groupRoster.members[0]?.student.id).toBe('student-1');
    expect(individual.members).toEqual([]);
    expect(individual.linkedStudent).toBeUndefined();

    await expect(
      mutation.addToRoster({ contextId: 'individual-1', studentId: student.id }),
    ).rejects.toThrow(/do not have rosters/);
  });

  it('links an Individual context explicitly without turning roster membership into a context hierarchy', async () => {
    ids = ['student-1', 'log-create', 'log-link'];
    const student = await mutation.createStudent({ name: 'Carlie' });
    await mutation.linkIndividualContext('individual-1', student.id);

    const individual = await read.loadContextRoster('individual-1');
    expect(individual.context).toMatchObject({
      kind: 'individual',
      linkedStudentId: 'student-1',
    });
    expect(individual.linkedStudent?.name).toBe('Carlie');
    expect(await database.rosterMemberships.count()).toBe(0);

    await history.undo();
    expect((await database.learnerContexts.get('individual-1'))?.linkedStudentId).toBeUndefined();

    await history.redo();
    expect((await database.learnerContexts.get('individual-1'))?.linkedStudentId).toBe('student-1');
  });

  it('removes only the roster relationship and preserves the student, context, and legacy context memberships', async () => {
    await database.contextMemberships.put({
      id: 'legacy-membership',
      containerContextId: 'class-1',
      memberContextId: 'individual-1',
    });

    ids = ['student-1', 'log-create', 'membership-1', 'log-add', 'log-remove'];
    const student = await mutation.createStudent({ name: 'Ben Lee' });
    const membership = await mutation.addToRoster({
      contextId: 'group-1',
      studentId: student.id,
    });
    await mutation.removeFromRoster(membership.id);

    expect(await database.studentRecords.get(student.id)).toBeDefined();
    expect(await database.learnerContexts.get('group-1')).toBeDefined();
    expect(await database.rosterMemberships.count()).toBe(0);
    expect(await database.contextMemberships.get('legacy-membership')).toBeDefined();

    await history.undo();
    expect(await database.rosterMemberships.get(membership.id)).toBeDefined();
    expect(await database.contextMemberships.get('legacy-membership')).toBeDefined();
  });

  it('prevents duplicate roster membership while allowing the same student in a peer Class and Group', async () => {
    ids = ['student-1', 'log-create', 'membership-1', 'log-add'];
    const student = await mutation.createStudent({ name: 'Diana Wu' });
    await mutation.addToRoster({ contextId: 'class-1', studentId: student.id });

    await expect(
      mutation.addToRoster({ contextId: 'class-1', studentId: student.id }),
    ).rejects.toThrow(/already in/);

    ids = ['membership-2', 'log-group'];
    await mutation.addToRoster({ contextId: 'group-1', studentId: student.id });
    expect(await database.rosterMemberships.count()).toBe(2);
  });
});
