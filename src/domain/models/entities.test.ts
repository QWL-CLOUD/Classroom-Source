import { describe, expect, it } from 'vitest';
import {
  assessmentEvidenceRecordSchema,
  calendarEventImportOccurrenceSchema,
  calendarEventImportSeriesSchema,
  categoryFamilyIdSchema,
  categoryValueSchema,
  classificationMappingPresetSchema,
  learnerNoticeSchema,
  importRunSchema,
  learnerServiceOccurrenceSchema,
  libraryCatalogItemSchema,
  lessonPlanSchema,
  reminderSchema,
  scheduleBlockSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  taskSchema,
  teachingReflectionRecordSchema,
} from './entities';

describe('domain schemas', () => {
  it('accepts a Friday-only schedule block as ordinary recurrence data', () => {
    const block = scheduleBlockSchema.parse({
      id: 'fr-math',
      title: 'Math',
      subject: 'Math',
      kind: 'teachable',
      weekdays: [5],
      startMinute: 530,
      endMinute: 590,
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: true,
    });
    expect(block.weekdays).toEqual([5]);
  });

  it('rejects sessions whose end is not after the start', () => {
    expect(() =>
      sessionOccurrenceSchema.parse({
        id: 'session-1',
        lessonPlanId: 'lesson-1',
        contextId: 'class-1',
        date: '2026-07-14',
        startMinute: 600,
        endMinute: 590,
        deliveryState: 'scheduled',
      }),
    ).toThrow();
  });
  it('requires a source-linked narrative for Teaching Reflections', () => {
    const reflection = teachingReflectionRecordSchema.parse({
      id: 'reflection-1',
      sessionOccurrenceId: 'session-1',
      schoolYearId: 'year-1',
      contextId: 'class-1',
      lessonPlanId: 'lesson-1',
      occurredOn: '2026-07-14',
      whatWorked: '  Students used the visual model independently.  ',
      sourceSnapshots: {
        context: { kind: 'class', name: 'Grade 3' },
        lessonPlan: { title: 'Equivalent fractions' },
        sessionOccurrence: {
          date: '2026-07-14',
          startMinute: 600,
          endMinute: 645,
        },
      },
      status: 'active',
      createdAt: '2026-07-14T16:00:00.000Z',
      updatedAt: '2026-07-14T16:00:00.000Z',
    });

    expect(reflection.whatWorked).toBe('Students used the visual model independently.');
    expect(() =>
      teachingReflectionRecordSchema.parse({
        ...reflection,
        whatWorked: undefined,
      }),
    ).toThrow('at least one narrative field');
  });

  it('keeps Teaching Reflection lifecycle and Session snapshots internally consistent', () => {
    const reflection = {
      id: 'reflection-archived',
      sessionOccurrenceId: 'session-1',
      schoolYearId: 'year-1',
      contextId: 'class-1',
      lessonPlanId: 'lesson-1',
      occurredOn: '2026-07-14',
      additionalNotes: 'Retained historical note.',
      sourceSnapshots: {
        context: { kind: 'class' as const, name: 'Grade 3' },
        lessonPlan: { title: 'Equivalent fractions' },
        sessionOccurrence: {
          date: '2026-07-14',
          startMinute: 600,
          endMinute: 645,
        },
      },
      status: 'archived' as const,
      archivedAt: '2026-07-15T12:00:00.000Z',
      createdAt: '2026-07-14T16:00:00.000Z',
      updatedAt: '2026-07-15T12:00:00.000Z',
    };

    expect(teachingReflectionRecordSchema.parse(reflection).status).toBe('archived');
    expect(() =>
      teachingReflectionRecordSchema.parse({
        ...reflection,
        status: 'active',
      }),
    ).toThrow('cannot contain archivedAt');
    expect(() =>
      teachingReflectionRecordSchema.parse({
        ...reflection,
        sourceSnapshots: {
          ...reflection.sourceSnapshots,
          sessionOccurrence: {
            ...reflection.sourceSnapshots.sessionOccurrence,
            date: '2026-07-15',
          },
        },
      }),
    ).toThrow('must match its Session snapshot date');
  });

  it('keeps legacy lesson plans compatible without requiring lesson flow', () => {
    const plan = lessonPlanSchema.parse({
      id: 'lesson-1',
      contextId: 'class-1',
      title: 'Legacy lesson',
      subject: '',
      workflowState: 'draft',
      createdAt: '2026-07-17T12:00:00.000Z',
      updatedAt: '2026-07-17T12:00:00.000Z',
    });

    expect(plan.lessonFlow).toBeUndefined();
  });
  it('separates task Scheduled and Due values and supports the full lifecycle', () => {
    const task = taskSchema.parse({
      id: 'task-1',
      title: 'Prepare materials',
      status: 'waiting',
      scheduledDate: '2026-07-20',
      scheduledMinute: 540,
      dueDate: '2026-07-22',
      dueMinute: 1020,
      order: 0,
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
      waitingAt: '2026-07-18T12:00:00.000Z',
    });

    expect(task).toMatchObject({
      status: 'waiting',
      scheduledDate: '2026-07-20',
      dueDate: '2026-07-22',
    });
    expect(() =>
      taskSchema.parse({
        ...task,
        scheduledDate: undefined,
        scheduledMinute: 540,
      }),
    ).toThrow();
  });

  it('requires a date for date-specific learner notices while keeping support records open-ended', () => {
    const support = learnerNoticeSchema.parse({
      id: 'notice-support',
      contextId: 'context-1',
      kind: 'ongoing-support',
      title: 'Reading support',
      status: 'active',
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    expect(support.noticeDate).toBeUndefined();
    expect(() =>
      learnerNoticeSchema.parse({
        ...support,
        id: 'notice-date',
        kind: 'date-specific-notice',
      }),
    ).toThrow('requires a date');
  });

  it('models Reminder as a separate source-linked record', () => {
    const reminder = reminderSchema.parse({
      id: 'reminder-1',
      sourceType: 'task',
      sourceId: 'task-1',
      remindDate: '2026-07-20',
      remindMinute: 540,
      status: 'active',
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });

    expect(reminder).toMatchObject({
      sourceType: 'task',
      sourceId: 'task-1',
      status: 'active',
    });
  });
  it('accepts the canonical Library classification family IDs', () => {
    expect(
      ['subject', 'grade-level', 'language', 'language-level', 'activity-type'].map((value) =>
        categoryFamilyIdSchema.parse(value),
      ),
    ).toEqual(['subject', 'grade-level', 'language', 'language-level', 'activity-type']);
  });

  it('requires category lifecycle metadata to remain internally consistent', () => {
    const active = categoryValueSchema.parse({
      id: 'purpose-reading',
      familyId: 'purpose-tag',
      name: 'Reading',
      normalizedName: 'reading',
      aliases: ['Literacy'],
      normalizedAliases: ['literacy'],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
    });
    expect(active.familyId).toBe('purpose-tag');
    expect(() =>
      categoryValueSchema.parse({
        ...active,
        lifecycleState: 'merged',
        mergedIntoId: undefined,
        mergedAt: undefined,
      }),
    ).toThrow('requires its replacement');
  });

  it('validates classification mapping preset lifecycle metadata', () => {
    const active = classificationMappingPresetSchema.parse({
      id: 'mapping-ela',
      familyId: 'subject',
      sourceText: 'ELA',
      normalizedSourceText: 'ela',
      targetCategoryValueId: 'subject-english-language-arts',
      status: 'active',
      createdAt: '2026-08-03T12:00:00.000Z',
      updatedAt: '2026-08-03T12:00:00.000Z',
    });
    expect(active.status).toBe('active');
    expect(() =>
      classificationMappingPresetSchema.parse({
        ...active,
        status: 'inactive',
      }),
    ).toThrow('requires deactivatedAt');
    expect(() =>
      classificationMappingPresetSchema.parse({
        ...active,
        deactivatedAt: '2026-08-03T13:00:00.000Z',
      }),
    ).toThrow('cannot contain deactivatedAt');
  });

  it('keeps existing school years compatible while preventing archived active records', () => {
    expect(
      schoolYearSchema.parse({
        id: 'school-year-existing',
        label: '2026–2027',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
      }),
    ).toMatchObject({ active: true });

    expect(() =>
      schoolYearSchema.parse({
        id: 'school-year-invalid',
        label: 'Archived active year',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
        lifecycleState: 'archived',
      }),
    ).toThrow('archived school year');
  });
  it('validates weekly Learner Service recurrence and acted-on occurrences', () => {
    const service = learnerNoticeSchema.parse({
      id: 'service-weekly',
      contextId: 'context-1',
      kind: 'learner-service',
      title: 'Speech support',
      status: 'active',
      serviceRecurrence: {
        frequency: 'weekly',
        weekdays: [2],
        startsOn: '2026-07-01',
        endsOn: '2026-07-31',
        startMinute: 600,
        endMinute: 630,
      },
      createdAt: '2026-07-23T12:00:00.000Z',
      updatedAt: '2026-07-23T12:00:00.000Z',
    });
    expect(service.serviceRecurrence?.weekdays).toEqual([2]);
    expect(() =>
      learnerNoticeSchema.parse({
        ...service,
        serviceRecurrence: {
          ...service.serviceRecurrence,
          endMinute: 590,
        },
      }),
    ).toThrow('end time');

    expect(
      learnerServiceOccurrenceSchema.parse({
        id: 'service-weekly:2026-07-21',
        learnerNoticeId: 'service-weekly',
        date: '2026-07-21',
        status: 'completed',
        createdAt: '2026-07-21T14:00:00.000Z',
        updatedAt: '2026-07-21T14:00:00.000Z',
        completedAt: '2026-07-21T14:00:00.000Z',
      }),
    ).toMatchObject({ status: 'completed' });
  });
  it('validates stable Library Catalog metadata and archive lifecycle', () => {
    const active = libraryCatalogItemSchema.parse({
      id: 'resource-1',
      catalogType: 'resource',
      title: 'Weather slides',
      description: 'Reusable oral-language prompts.',
      tags: ['Speaking', 'Weather'],
      status: 'active',
      createdAt: '2026-07-23T12:00:00.000Z',
      updatedAt: '2026-07-23T12:00:00.000Z',
    });
    expect(active).toMatchObject({
      catalogType: 'resource',
      status: 'active',
      tags: ['Speaking', 'Weather'],
    });
    expect(() =>
      libraryCatalogItemSchema.parse({
        ...active,
        status: 'archived',
        archivedAt: undefined,
      }),
    ).toThrow('requires archivedAt');
  });
  it('validates canonical Import Center runs and imported Catalog identity metadata', () => {
    expect(
      importRunSchema.parse({
        id: 'import-run-1',
        importType: 'activities',
        sourceKind: 'xlsx',
        sourceLabel: 'activities.xlsx',
        worksheetName: 'Activities',
        totalRows: 3,
        createdCount: 2,
        updatedCount: 0,
        skippedCount: 1,
        reviewCount: 0,
        blockedCount: 0,
        committedAt: '2026-07-29T12:00:00.000Z',
      }),
    ).toMatchObject({ importType: 'activities', totalRows: 3 });
    expect(() =>
      importRunSchema.parse({
        id: 'invalid-import-run',
        importType: 'resources',
        sourceKind: 'csv',
        totalRows: 2,
        createdCount: 1,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        blockedCount: 0,
        committedAt: '2026-07-29T12:00:00.000Z',
      }),
    ).toThrow('counts must equal');
    expect(
      importRunSchema.parse({
        id: 'calendar-event-import-run',
        importType: 'calendar-events',
        sourceKind: 'ics',
        sourceLabel: 'district-calendar.ics',
        schoolYearId: 'school-year-2026',
        totalRows: 1,
        createdCount: 1,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        blockedCount: 0,
        committedAt: '2026-08-05T12:00:00.000Z',
      }),
    ).toMatchObject({
      importType: 'calendar-events',
      sourceKind: 'ics',
      schoolYearId: 'school-year-2026',
    });
    expect(() =>
      importRunSchema.parse({
        id: 'calendar-event-import-without-school-year',
        importType: 'calendar-events',
        sourceKind: 'ics',
        totalRows: 1,
        createdCount: 1,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        blockedCount: 0,
        committedAt: '2026-08-05T12:00:00.000Z',
      }),
    ).toThrow('School Year');

    expect(() =>
      importRunSchema.parse({
        id: 'roster-import-without-context',
        importType: 'roster',
        sourceKind: 'xlsx',
        totalRows: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        reviewCount: 0,
        blockedCount: 0,
        committedAt: '2026-07-29T12:00:00.000Z',
      }),
    ).toThrow('target context');

    const imported = libraryCatalogItemSchema.parse({
      id: 'activity-imported',
      catalogType: 'activity',
      title: 'Partner retell',
      tags: [],
      externalSource: 'district catalog',
      externalKey: 'activity-101',
      importIdentityKey: 'activity\u0000district catalog\u0000activity-101',
      lastImportRunId: 'import-run-1',
      typedFields: {
        catalogType: 'activity',
        grouping: 'partners',
        estimatedMinutes: 20,
        directions: 'Partners rehearse and retell the sequence.',
        materials: 'Picture cards; timer',
        notes: 'Preparation\nSort cards before the lesson.',
      },
      status: 'active',
      createdAt: '2026-07-29T12:00:00.000Z',
      updatedAt: '2026-07-29T12:00:00.000Z',
    });
    expect(imported.lastImportRunId).toBe('import-run-1');
    expect(imported.typedFields).toMatchObject({
      catalogType: 'activity',
      materials: 'Picture cards; timer',
      notes: 'Preparation\nSort cards before the lesson.',
    });
    expect(() =>
      libraryCatalogItemSchema.parse({
        ...imported,
        typedFields: {
          catalogType: 'activity',
          grouping: 'partners',
          materials: 'x'.repeat(5001),
        },
      }),
    ).toThrow();
    expect(() =>
      libraryCatalogItemSchema.parse({
        ...imported,
        externalSource: undefined,
      }),
    ).toThrow('external source');
  });

  it('keeps score, proficiency, and observation evidence structurally distinct', () => {
    const common = {
      id: 'evidence-1',
      studentId: 'student-1',
      schoolYearId: 'year-1',
      occurredOn: '2026-07-28',
      title: 'Reading conference',
      standardIds: ['standard-1'],
      status: 'active',
      createdAt: '2026-07-28T12:00:00.000Z',
      updatedAt: '2026-07-28T12:00:00.000Z',
    };

    expect(
      assessmentEvidenceRecordSchema.parse({
        ...common,
        kind: 'score',
        score: { value: 8, maximum: 10 },
      }),
    ).toMatchObject({ kind: 'score', score: { value: 8, maximum: 10 } });
    expect(
      assessmentEvidenceRecordSchema.parse({
        ...common,
        id: 'evidence-2',
        kind: 'proficiency',
        proficiency: { label: 'Developing', rank: 2, scaleKey: 'reading-4-point' },
      }),
    ).toMatchObject({ kind: 'proficiency', proficiency: { label: 'Developing' } });
    expect(
      assessmentEvidenceRecordSchema.parse({
        ...common,
        id: 'evidence-3',
        kind: 'observation',
        observation: { text: 'Used context clues independently.' },
      }),
    ).toMatchObject({ kind: 'observation' });

    expect(() =>
      assessmentEvidenceRecordSchema.parse({
        ...common,
        kind: 'score',
        score: {},
      }),
    ).toThrow('numeric value or categorical label');
    expect(() =>
      assessmentEvidenceRecordSchema.parse({
        ...common,
        kind: 'score',
        score: { value: 8 },
        proficiency: { label: 'Developing' },
      }),
    ).toThrow();
  });

  it('requires evidence lifecycle and source snapshots to remain internally consistent', () => {
    const evidence = {
      id: 'evidence-snapshot',
      studentId: 'student-1',
      schoolYearId: 'year-1',
      occurredOn: '2026-07-28',
      title: 'Exit ticket',
      kind: 'observation' as const,
      observation: { text: 'Explained the strategy clearly.' },
      contextId: 'class-1',
      standardIds: ['standard-1'],
      sourceSnapshots: {
        context: { kind: 'class' as const, name: 'Grade 3' },
        standards: [
          {
            standardId: 'standard-1',
            code: 'RL.3.1',
            statement: 'Ask and answer questions about a text.',
          },
        ],
      },
      status: 'archived' as const,
      archivedAt: '2026-07-28T13:00:00.000Z',
      createdAt: '2026-07-28T12:00:00.000Z',
      updatedAt: '2026-07-28T13:00:00.000Z',
    };

    expect(assessmentEvidenceRecordSchema.parse(evidence)).toMatchObject({
      status: 'archived',
      contextId: 'class-1',
    });
    expect(() =>
      assessmentEvidenceRecordSchema.parse({
        ...evidence,
        status: 'active',
      }),
    ).toThrow('cannot contain archivedAt');
    expect(() =>
      assessmentEvidenceRecordSchema.parse({
        ...evidence,
        sourceSnapshots: {
          standards: [
            {
              standardId: 'standard-2',
              code: 'RL.3.2',
              statement: 'Retell stories.',
            },
          ],
        },
      }),
    ).toThrow('linked standardId');
  });

  it('validates recurrence ownership metadata and removed import counts', () => {
    const series = calendarEventImportSeriesSchema.parse({
      id: 'series-1',
      schoolYearId: 'year-1',
      externalSource: 'ics',
      externalKey: 'district-calendar@example.test',
      seriesIdentityKey: 'series-key-1',
      masterFingerprint: 'fnv1a32:11111111',
      calendarTimeZoneFingerprint: 'fnv1a32:22222222',
      recurrenceEngineVersion: 'classroom-rfc5545-v1+ical.js-2.2.1',
      lastImportRunId: 'run-1',
      createdAt: '2026-08-05T12:00:00.000Z',
      updatedAt: '2026-08-05T12:00:00.000Z',
    });
    expect(series.externalSource).toBe('ics');

    expect(
      calendarEventImportOccurrenceSchema.parse({
        id: 'occurrence-1',
        seriesId: series.id,
        schoolYearId: 'year-1',
        occurrenceKey: 'date\u00002026-10-12\u0000',
        occurrenceIdentityKey: 'occurrence-key-1',
        sourceStatus: 'active',
        managementStatus: 'materialized',
        eventId: 'event-1',
        sourceOccurrenceFingerprint: 'fnv1a32:33333333',
        lastImportedEventFingerprint: 'fnv1a32:44444444',
        lastImportRunId: 'run-1',
        createdAt: '2026-08-05T12:00:00.000Z',
        updatedAt: '2026-08-05T12:00:00.000Z',
      }),
    ).toMatchObject({ eventId: 'event-1', managementStatus: 'materialized' });

    expect(() =>
      calendarEventImportOccurrenceSchema.parse({
        id: 'occurrence-invalid',
        seriesId: series.id,
        schoolYearId: 'year-1',
        occurrenceKey: 'date\u00002026-10-13\u0000',
        occurrenceIdentityKey: 'occurrence-key-invalid',
        sourceStatus: 'active',
        managementStatus: 'materialized',
        lastImportRunId: 'run-1',
        createdAt: '2026-08-05T12:00:00.000Z',
        updatedAt: '2026-08-05T12:00:00.000Z',
      }),
    ).toThrow('requires an Event');

    const removedOnly = importRunSchema.parse({
      id: 'run-remove',
      importType: 'calendar-events',
      sourceKind: 'ics',
      schoolYearId: 'year-1',
      totalRows: 1,
      createdCount: 0,
      updatedCount: 0,
      removedCount: 1,
      skippedCount: 0,
      reviewCount: 0,
      blockedCount: 0,
      committedAt: '2026-08-05T12:00:00.000Z',
    });
    expect(removedOnly.removedCount).toBe(1);
  });
});
