import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { TeachingReflectionMutationService } from './teachingReflectionMutationService';

let database: ClassroomDatabase;
let mutation: TeachingReflectionMutationService;
let history: EditHistoryService;
let ids: string[];

const now = '2026-09-01T15:00:00.000Z';

beforeEach(async () => {
  database = new ClassroomDatabase(`teaching-reflection-${crypto.randomUUID()}`);
  await database.open();
  ids = [];
  mutation = new TeachingReflectionMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => now,
  });
  history = new EditHistoryService(database, {
    now: () => '2026-09-01T16:00:00.000Z',
  });

  await database.schoolYears.put({
    id: 'year-1',
    label: '2026–2027',
    startsOn: '2026-08-24',
    endsOn: '2027-06-18',
    active: true,
    lifecycleState: 'active',
  });
  await database.learnerContexts.put({
    id: 'class-1',
    kind: 'class',
    name: 'Grade 3 Chinese',
    schoolYearId: 'year-1',
    status: 'active',
  });
  await database.lessonPlans.put({
    id: 'plan-1',
    contextId: 'class-1',
    title: 'Reading workshop',
    subject: 'Chinese',
    workflowState: 'ready',
    createdAt: now,
    updatedAt: now,
  });
  await database.sessionOccurrences.put({
    id: 'session-1',
    lessonPlanId: 'plan-1',
    contextId: 'class-1',
    date: '2026-09-01',
    startMinute: 540,
    endMinute: 600,
    deliveryState: 'completed',
    completedAt: '2026-09-01T14:00:00.000Z',
  });
});

afterEach(async () => {
  await database.delete();
});

function reflectionValues() {
  return {
    whatWorked: '  Learners used the target language independently.  ',
    whatToAdjust: 'Shorten partner practice.',
    additionalNotes: '',
  };
}

describe('Teaching Reflection atomic mutation and history', () => {
  it('creates one source-snapshotted Reflection, links the Session, and participates in Undo/Redo', async () => {
    ids = ['reflection-1', 'log-create'];

    const created = await mutation.create('session-1', reflectionValues());

    expect(created).toMatchObject({
      id: 'reflection-1',
      sessionOccurrenceId: 'session-1',
      schoolYearId: 'year-1',
      contextId: 'class-1',
      lessonPlanId: 'plan-1',
      occurredOn: '2026-09-01',
      whatWorked: 'Learners used the target language independently.',
      whatToAdjust: 'Shorten partner practice.',
      sourceSnapshots: {
        context: { kind: 'class', name: 'Grade 3 Chinese' },
        lessonPlan: { title: 'Reading workshop' },
        sessionOccurrence: { date: '2026-09-01', startMinute: 540, endMinute: 600 },
      },
      status: 'active',
    });
    expect(created.additionalNotes).toBeUndefined();
    expect(await database.sessionOccurrences.get('session-1')).toMatchObject({
      reflectionId: 'reflection-1',
    });

    await history.undo();
    expect(await database.teachingReflections.get('reflection-1')).toBeUndefined();
    expect(await database.sessionOccurrences.get('session-1')).not.toHaveProperty('reflectionId');

    await history.redo();
    expect(await database.teachingReflections.get('reflection-1')).toBeDefined();
    expect(await database.sessionOccurrences.get('session-1')).toMatchObject({
      reflectionId: 'reflection-1',
    });
  });

  it('rejects a Reflection for a Session that is not completed', async () => {
    await database.sessionOccurrences.update('session-1', {
      deliveryState: 'scheduled',
      completedAt: undefined,
    });
    ids = ['reflection-1', 'log-create'];

    await expect(mutation.create('session-1', reflectionValues())).rejects.toThrow(
      /only be added to a completed Session/i,
    );
    expect(await database.teachingReflections.count()).toBe(0);
    expect(await database.changeLog.count()).toBe(0);
  });

  it('enforces one Reflection per Session without repairing inconsistent links silently', async () => {
    ids = ['reflection-1', 'log-create'];
    await mutation.create('session-1', reflectionValues());
    const linkedSession = await database.sessionOccurrences.get('session-1');
    if (!linkedSession) throw new Error('Synthetic Session is missing.');
    const sessionWithoutPointer = { ...linkedSession };
    delete sessionWithoutPointer.reflectionId;
    await database.sessionOccurrences.put(sessionWithoutPointer);
    ids = ['reflection-2', 'log-second'];

    await expect(mutation.create('session-1', reflectionValues())).rejects.toThrow(
      /already has a Teaching Reflection/i,
    );
    expect(await database.teachingReflections.count()).toBe(1);
    expect(await database.sessionOccurrences.get('session-1')).not.toHaveProperty('reflectionId');
  });

  it('updates an active Reflection after its source records are removed and Undo restores the prior narrative', async () => {
    ids = ['reflection-1', 'log-create'];
    const created = await mutation.create('session-1', reflectionValues());
    await database.sessionOccurrences.delete('session-1');
    await database.lessonPlans.delete('plan-1');
    await database.learnerContexts.delete('class-1');
    ids = ['log-update'];

    const updated = await mutation.update(created.id, {
      whatWorked: 'The visual model supported discussion.',
      whatToAdjust: '',
      additionalNotes: '  Retained after source cleanup. ',
    });

    expect(updated).toMatchObject({
      whatWorked: 'The visual model supported discussion.',
      additionalNotes: 'Retained after source cleanup.',
      sourceSnapshots: {
        context: { name: 'Grade 3 Chinese' },
        lessonPlan: { title: 'Reading workshop' },
      },
    });
    expect(updated.whatToAdjust).toBeUndefined();

    await history.undo();
    expect(await database.teachingReflections.get(created.id)).toMatchObject({
      whatWorked: 'Learners used the target language independently.',
      whatToAdjust: 'Shorten partner practice.',
    });
  });

  it('archives and restores a Reflection without changing the Session link', async () => {
    ids = ['reflection-1', 'log-create'];
    await mutation.create('session-1', reflectionValues());
    ids = ['log-archive'];

    const archived = await mutation.archive('reflection-1');
    expect(archived).toMatchObject({ status: 'archived', archivedAt: now });
    expect(await database.sessionOccurrences.get('session-1')).toMatchObject({
      reflectionId: 'reflection-1',
    });

    ids = ['log-restore'];
    const restored = await mutation.restore('reflection-1');
    expect(restored.status).toBe('active');
    expect(restored.archivedAt).toBeUndefined();
    expect(await database.sessionOccurrences.get('session-1')).toMatchObject({
      reflectionId: 'reflection-1',
    });
  });

  it('requires an archived Reflection to be restored before editing', async () => {
    ids = ['reflection-1', 'log-create'];
    await mutation.create('session-1', reflectionValues());
    ids = ['log-archive'];
    await mutation.archive('reflection-1');

    await expect(
      mutation.update('reflection-1', { whatWorked: 'Edited while archived.' }),
    ).rejects.toThrow(/Restore this Teaching Reflection before editing/i);
  });

  it('rejects a Session date outside its owning School Year', async () => {
    await database.sessionOccurrences.update('session-1', { date: '2027-07-01' });
    ids = ['reflection-1', 'log-create'];

    await expect(mutation.create('session-1', reflectionValues())).rejects.toThrow(
      /outside its school year/i,
    );
    expect(await database.teachingReflections.count()).toBe(0);
  });

  it('rolls back both the Reflection and Session pointer when the change log cannot commit', async () => {
    ids = ['reflection-failed', 'log-failed'];
    database.changeLog.hook('creating', () => {
      throw new Error('Synthetic journal failure');
    });

    await expect(mutation.create('session-1', reflectionValues())).rejects.toThrow(
      /Synthetic journal failure/,
    );

    expect(await database.teachingReflections.get('reflection-failed')).toBeUndefined();
    expect(await database.sessionOccurrences.get('session-1')).not.toHaveProperty('reflectionId');
    expect(await database.changeLog.count()).toBe(0);
  });
});
