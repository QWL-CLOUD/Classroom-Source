import { describe, expect, it } from 'vitest';
import { createReversibleMigrationPlan } from './migrationPlan';

function createEnvelope(data: Record<string, string>) {
  return JSON.stringify({
    format: 'classroom-full-local-backup-v18',
    appVersion: '18.0.0',
    storageEncoding: 'raw-localStorage-strings',
    data: {
      'cos-current-school-year': JSON.stringify('2026–2027'),
      ...data,
    },
  });
}

const fixedNow = '2026-07-15T12:00:00.000Z';

describe('reversible migration plan', () => {
  it('creates valid v20 draft records and an inverse delete for every planned write', () => {
    const plan = createReversibleMigrationPlan(
      createEnvelope({
        'cos-students': JSON.stringify([
          { id: 'learner-1', name: 'Learner', schoolYear: '2026–2027' },
        ]),
        'cos-classes': JSON.stringify([{ id: 'class-1', name: 'Class', schoolYear: '2026–2027' }]),
        'cos-schedule-blocks': JSON.stringify([
          {
            id: 'block-1',
            block: 'Chinese',
            days: ['Monday', 'Wednesday'],
            start: '09:00',
            end: '09:45',
            category: 'Teaching',
            planningEnabled: true,
          },
        ]),
        'cos-calendar-events': JSON.stringify([
          {
            id: 'event-1',
            title: 'School event',
            date: '2026-09-01',
            category: 'School',
          },
        ]),
        'cos-tasks': JSON.stringify([
          {
            id: 'task-1',
            title: 'Prepare materials',
            status: 'Completed',
            completedAt: '2026-07-14T10:00:00.000Z',
          },
        ]),
      }),
      { now: fixedNow },
    );

    expect(plan.status).toBe('draft');
    expect(plan.writeOperations).toBe(0);
    expect(plan.summary).toMatchObject({
      createRecords: 6,
      reviewRecords: 0,
      deferredRecords: 0,
      quarantineRecords: 0,
      skippedRecords: 0,
      rollbackDeletes: 6,
      plannedWriteOperations: 6,
    });
    expect(plan.rollbackOperations).toHaveLength(plan.summary.plannedWriteOperations);
    expect(
      plan.operations.find((operation) => operation.targetTable === 'scheduleBlocks'),
    ).toMatchObject({
      action: 'create',
      targetId: 'block-1',
    });
    expect(
      plan.operations.find((operation) => operation.targetTable === 'calendarEvents'),
    ).toMatchObject({
      action: 'create',
      targetId: 'event-1',
    });
  });

  it('keeps invalid active calendar records and existing quarantine records out of the active calendar', () => {
    const plan = createReversibleMigrationPlan(
      createEnvelope({
        'cos-calendar-events': JSON.stringify([
          { id: 'bad-event', title: 'Bad date', date: '2026-22-26' },
        ]),
        'cos-calendar-quarantine-v19': JSON.stringify([
          {
            id: 'old-quarantine',
            title: 'Already isolated',
            date: '2026-25-27',
            quarantineReason: 'Invalid imported calendar date',
          },
        ]),
      }),
      { now: fixedNow },
    );

    expect(
      plan.operations.filter((operation) => operation.targetTable === 'calendarEvents'),
    ).toEqual([]);
    expect(plan.summary.quarantineRecords).toBe(2);
    expect(plan.rollbackOperations).toHaveLength(3);
    expect(plan.operations.filter((operation) => operation.action === 'quarantine')).toHaveLength(
      2,
    );
  });

  it('preserves unsupported library data and flags v19 planning templates for review', () => {
    const plan = createReversibleMigrationPlan(
      createEnvelope({
        'cos-toolkit': JSON.stringify([{ id: 'activity-1', name: 'Activity' }]),
        'cos-standards': JSON.stringify([{ id: 'standard-1', code: 'C.L.G.1' }]),
        'cos-planning-templates-v19': JSON.stringify([
          { id: 'template-1', name: 'Full lesson', flowBlocks: [] },
        ]),
      }),
      { now: fixedNow },
    );

    expect(plan.summary).toMatchObject({
      createRecords: 1,
      reviewRecords: 1,
      deferredRecords: 2,
      quarantineRecords: 0,
      skippedRecords: 0,
      rollbackDeletes: 1,
    });
    expect(plan.operations.find((operation) => operation.legacyId === 'activity-1')).toMatchObject({
      action: 'defer',
      targetTable: 'Library tables (future phase)',
    });
    expect(plan.operations.find((operation) => operation.legacyId === 'template-1')).toMatchObject({
      action: 'review',
      targetTable: 'lessonSeries + lessonPlans + Lesson Flow',
    });
  });

  it('skips duplicate target identifiers and never mutates the source text', () => {
    const rawText = createEnvelope({
      'cos-calendar-events': JSON.stringify([
        { id: 'event-1', title: 'First', date: '2026-09-01' },
        { id: 'event-1', title: 'Second', date: '2026-09-02' },
      ]),
    });
    const sourceCopy = rawText.slice();
    const plan = createReversibleMigrationPlan(rawText, { now: fixedNow });

    expect(rawText).toBe(sourceCopy);
    expect(plan.summary.skippedRecords).toBe(1);
    expect(
      plan.operations.filter((operation) => operation.targetTable === 'calendarEvents'),
    ).toHaveLength(2);
    expect(plan.operations.find((operation) => operation.action === 'skip')?.reason).toContain(
      'Duplicate target identifier',
    );
  });

  it('uses a stable source fingerprint and plan identifier', () => {
    const rawText = createEnvelope({ 'cos-calendar-events': '[]' });
    const first = createReversibleMigrationPlan(rawText, { now: fixedNow });
    const second = createReversibleMigrationPlan(rawText, { now: '2026-07-16T12:00:00.000Z' });

    expect(first.sourceFingerprint).toBe(second.sourceFingerprint);
    expect(first.planId).toBe(second.planId);
    expect(first.generatedAt).not.toBe(second.generatedAt);
  });
});
