import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { StandardAlignmentMutationService } from './standardAlignmentMutationService';

let database: ClassroomDatabase;
const names: string[] = [];
const timestamp = '2026-07-24T02:00:00.000Z';

beforeEach(async () => {
  const name = `standard-alignments-${crypto.randomUUID()}`;
  names.push(name);
  database = new ClassroomDatabase(name);
  await database.open();

  await database.lessonPlans.put({
    id: 'plan-1',
    contextId: 'context-1',
    title: 'Fraction comparison',
    subject: 'Math',
    workflowState: 'draft',
    lessonFlow: [
      {
        id: 'plan-step-1',
        title: 'Compare models',
        phase: 'guided-practice',
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.lessonTemplates.put({
    id: 'template-1',
    title: 'Comparison workshop',
    status: 'active',
    lessonFlow: [
      {
        id: 'template-step-1',
        title: 'Compare models',
        phase: 'guided-practice',
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.standards.bulkPut([
    {
      id: 'standard-active',
      issuingOrganization: 'Synthetic organization',
      frameworkTitle: 'Synthetic framework',
      frameworkKey: 'synthetic organization|synthetic framework||2026',
      version: '2026',
      code: 'S.1',
      normalizedCode: 's.1',
      statement: 'Compare representations.',
      sortOrder: 0,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'standard-archived',
      issuingOrganization: 'Synthetic organization',
      frameworkTitle: 'Synthetic framework',
      frameworkKey: 'synthetic organization|synthetic framework||2026',
      version: '2026',
      code: 'S.2',
      normalizedCode: 's.2',
      statement: 'Explain reasoning.',
      sortOrder: 1,
      status: 'archived',
      archivedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
});

afterEach(async () => {
  database.close();
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('StandardAlignmentMutationService', () => {
  it('replaces Plan and step alignments as one globally undoable command', async () => {
    const ids = ['alignment-root', 'alignment-step', 'alignment-log'];
    const service = new StandardAlignmentMutationService(database, {
      createId: () => ids.shift() ?? crypto.randomUUID(),
      now: () => timestamp,
    });
    const history = new EditHistoryService(database, {
      now: () => '2026-07-24T02:10:00.000Z',
    });

    await service.replaceTargetAlignments(
      {
        targetType: 'lesson-plan',
        targetId: 'plan-1',
        lessonFlow: [
          {
            id: 'plan-step-1',
            title: 'Compare models',
            phase: 'guided-practice',
          },
        ],
      },
      {
        rootStandardIds: ['standard-active'],
        stepStandardIds: { 'plan-step-1': ['standard-active'] },
      },
    );

    expect(await database.standardAlignments.count()).toBe(2);
    expect(await database.standardAlignments.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scopeKey: 'lesson-plan:plan-1:root',
          standardId: 'standard-active',
        }),
        expect.objectContaining({
          scopeKey: 'lesson-plan:plan-1:step:plan-step-1',
          lessonFlowStepId: 'plan-step-1',
        }),
      ]),
    );

    await history.undo();
    expect(await database.standardAlignments.count()).toBe(0);
    await history.redo();
    expect(await database.standardAlignments.count()).toBe(2);
  });

  it('preserves an archived existing alignment but blocks adding a new archived Standard', async () => {
    await database.standardAlignments.put({
      id: 'existing-archived',
      standardId: 'standard-archived',
      targetType: 'lesson-template',
      targetId: 'template-1',
      scopeKey: 'lesson-template:template-1:root',
      createdAt: timestamp,
    });
    const ids = ['new-alignment', 'new-log', 'remove-log'];
    const service = new StandardAlignmentMutationService(database, {
      createId: () => ids.shift() ?? crypto.randomUUID(),
      now: () => timestamp,
    });
    const target = {
      targetType: 'lesson-template' as const,
      targetId: 'template-1',
      lessonFlow: [
        {
          id: 'template-step-1',
          title: 'Compare models',
          phase: 'guided-practice' as const,
        },
      ],
    };

    await service.replaceTargetAlignments(target, {
      rootStandardIds: ['standard-archived'],
      stepStandardIds: { 'template-step-1': [] },
    });
    expect(await database.standardAlignments.get('existing-archived')).toBeDefined();

    await expect(
      service.replaceTargetAlignments(target, {
        rootStandardIds: ['standard-archived'],
        stepStandardIds: { 'template-step-1': ['standard-archived'] },
      }),
    ).rejects.toThrow(/Archived Standards cannot be added/);

    await service.replaceTargetAlignments(target, {
      rootStandardIds: [],
      stepStandardIds: { 'template-step-1': [] },
    });
    expect(await database.standardAlignments.get('existing-archived')).toBeUndefined();
  });

  it('requires Lesson Flow steps to be persisted before alignment', async () => {
    const service = new StandardAlignmentMutationService(database, {
      createId: () => crypto.randomUUID(),
      now: () => timestamp,
    });

    await expect(
      service.replaceTargetAlignments(
        {
          targetType: 'lesson-plan',
          targetId: 'plan-1',
          lessonFlow: [
            {
              id: 'unsaved-step',
              title: 'Unsaved',
              phase: 'instruction',
            },
          ],
        },
        {
          rootStandardIds: [],
          stepStandardIds: { 'unsaved-step': ['standard-active'] },
        },
      ),
    ).rejects.toThrow(/Save the Plan changes/);
  });
});
