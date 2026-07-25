import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';
import { LessonTemplateMutationService } from '@/features/lessonTemplates/lessonTemplateMutationService';
import { PlanningMutationService } from '@/features/planning/planningMutationService';
import {
  toLessonPlanEditorValues,
  type LessonPlanEditorValues,
} from '@/features/planning/planningEditorModel';

let database: ClassroomDatabase;
const names: string[] = [];
const timestamp = '2026-07-24T05:00:00.000Z';

beforeEach(async () => {
  const name = `standard-cleanup-${crypto.randomUUID()}`;
  names.push(name);
  database = new ClassroomDatabase(name);
  await database.open();
});

afterEach(async () => {
  database.close();
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('Standard alignment lifecycle integration', () => {
  it('removes orphaned Plan step alignments transactionally and restores them through Undo', async () => {
    await database.lessonPlans.put({
      id: 'plan-1',
      contextId: 'context-1',
      title: 'Two-step lesson',
      subject: 'Math',
      workflowState: 'draft',
      lessonFlow: [
        { id: 'step-keep', title: 'Keep', phase: 'instruction' },
        { id: 'step-remove', title: 'Remove', phase: 'closure' },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database.standardAlignments.put({
      id: 'alignment-remove',
      standardId: 'standard-1',
      targetType: 'lesson-plan',
      targetId: 'plan-1',
      lessonFlowStepId: 'step-remove',
      scopeKey: 'lesson-plan:plan-1:step:step-remove',
      createdAt: timestamp,
    });

    const plan = (await database.lessonPlans.get('plan-1'))!;
    const values: LessonPlanEditorValues = {
      ...toLessonPlanEditorValues(plan),
      lessonFlow: [
        {
          id: 'step-keep',
          title: 'Keep',
          phase: 'instruction',
          durationMinutes: '',
          details: '',
          teacherNotes: '',
          libraryLinks: [],
        },
      ],
    };
    const service = new PlanningMutationService(database, {
      createId: () => 'plan-update-log',
      now: () => '2026-07-24T05:10:00.000Z',
    });
    const history = new EditHistoryService(database, {
      now: () => '2026-07-24T05:20:00.000Z',
    });

    await service.updatePlan('plan-1', values);
    expect(await database.standardAlignments.get('alignment-remove')).toBeUndefined();

    await history.undo();
    expect(await database.standardAlignments.get('alignment-remove')).toBeDefined();
    expect((await database.lessonPlans.get('plan-1'))?.lessonFlow).toHaveLength(2);
  });

  it('removes orphaned Template step alignments transactionally and restores them through Undo', async () => {
    await database.lessonTemplates.put({
      id: 'template-1',
      title: 'Two-step template',
      status: 'active',
      lessonFlow: [
        { id: 'step-keep', title: 'Keep', phase: 'instruction' },
        { id: 'step-remove', title: 'Remove', phase: 'closure' },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database.standardAlignments.put({
      id: 'alignment-remove',
      standardId: 'standard-1',
      targetType: 'lesson-template',
      targetId: 'template-1',
      lessonFlowStepId: 'step-remove',
      scopeKey: 'lesson-template:template-1:step:step-remove',
      createdAt: timestamp,
    });

    const service = new LessonTemplateMutationService(database, {
      createId: () => 'template-update-log',
      now: () => '2026-07-24T05:10:00.000Z',
    });
    const history = new EditHistoryService(database, {
      now: () => '2026-07-24T05:20:00.000Z',
    });

    await service.update('template-1', {
      title: 'Two-step template',
      description: '',
      defaultPlanTitle: '',
      subject: '',
      durationMinutes: '',
      learningTarget: '',
      notes: '',
      libraryLinks: [],
      lessonFlow: [
        {
          id: 'step-keep',
          title: 'Keep',
          phase: 'instruction',
          durationMinutes: '',
          details: '',
          teacherNotes: '',
          libraryLinks: [],
        },
      ],
    });
    expect(await database.standardAlignments.get('alignment-remove')).toBeUndefined();

    await history.undo();
    expect(await database.standardAlignments.get('alignment-remove')).toBeDefined();
    expect((await database.lessonTemplates.get('template-1'))?.lessonFlow).toHaveLength(2);
  });
});
