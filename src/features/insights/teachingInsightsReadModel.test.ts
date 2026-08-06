import { describe, expect, it } from 'vitest';

import type {
  AssessmentEvidenceRecord,
  CategoryAssignment,
  CategoryValue,
  LearnerContext,
  LessonPlan,
  LibraryCatalogItem,
  RosterMembership,
  SchoolYear,
  SessionOccurrence,
  Standard,
  StandardAlignment,
  StudentRecord,
  Task,
  TeachingReflectionRecord,
} from '@/domain/models/entities';

import {
  buildTeachingInsightsView,
  type TeachingInsightsSnapshot,
} from './teachingInsightsReadModel';

const now = '2026-08-05T12:00:00.000Z';

const schoolYear: SchoolYear = {
  id: 'year-1',
  label: '2026–27',
  startsOn: '2026-07-01',
  endsOn: '2027-06-30',
  active: true,
  lifecycleState: 'active',
};

function context(
  values: Partial<LearnerContext> & Pick<LearnerContext, 'id' | 'kind' | 'name'>,
): LearnerContext {
  return {
    schoolYearId: schoolYear.id,
    status: 'active',
    ...values,
    id: values.id,
    kind: values.kind,
    name: values.name,
  };
}

function student(
  values: Partial<StudentRecord> & Pick<StudentRecord, 'id' | 'name'>,
): StudentRecord {
  return {
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...values,
    id: values.id,
    name: values.name,
  };
}

function membership(
  values: Partial<RosterMembership> & Pick<RosterMembership, 'id' | 'contextId' | 'studentId'>,
): RosterMembership {
  return {
    createdAt: now,
    ...values,
    id: values.id,
    contextId: values.contextId,
    studentId: values.studentId,
  };
}

function plan(
  values: Partial<LessonPlan> & Pick<LessonPlan, 'id' | 'contextId' | 'title'>,
): LessonPlan {
  return {
    subject: '',
    workflowState: 'ready',
    createdAt: now,
    updatedAt: now,
    ...values,
    id: values.id,
    contextId: values.contextId,
    title: values.title,
  };
}

function session(
  values: Partial<SessionOccurrence> &
    Pick<SessionOccurrence, 'id' | 'lessonPlanId' | 'contextId' | 'date'>,
): SessionOccurrence {
  return {
    startMinute: 540,
    endMinute: 600,
    deliveryState: 'scheduled',
    ...values,
    id: values.id,
    lessonPlanId: values.lessonPlanId,
    contextId: values.contextId,
    date: values.date,
  };
}

function evidence(
  values: Partial<AssessmentEvidenceRecord> &
    Pick<AssessmentEvidenceRecord, 'id' | 'studentId' | 'occurredOn'>,
): AssessmentEvidenceRecord {
  return {
    schoolYearId: schoolYear.id,
    title: 'Evidence',
    kind: 'observation',
    observation: { text: 'Observed' },
    standardIds: [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...values,
    id: values.id,
    studentId: values.studentId,
    occurredOn: values.occurredOn,
  } as AssessmentEvidenceRecord;
}

function libraryItem(
  values: Partial<LibraryCatalogItem> & Pick<LibraryCatalogItem, 'id' | 'catalogType' | 'title'>,
): LibraryCatalogItem {
  return {
    tags: [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...values,
    id: values.id,
    catalogType: values.catalogType,
    title: values.title,
  };
}

function standard(values: Partial<Standard> & Pick<Standard, 'id' | 'code'>): Standard {
  return {
    issuingOrganization: 'State',
    frameworkTitle: 'Framework',
    frameworkKey: 'state::framework',
    normalizedCode: values.code.toLowerCase(),
    statement: 'Statement',
    sortOrder: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...values,
    id: values.id,
    code: values.code,
  };
}

function categoryValue(
  values: Partial<CategoryValue> & Pick<CategoryValue, 'id' | 'familyId' | 'name'>,
): CategoryValue {
  return {
    normalizedName: values.name.toLowerCase(),
    aliases: [],
    normalizedAliases: [],
    sortOrder: 0,
    isDefault: false,
    lifecycleState: 'active',
    createdAt: now,
    updatedAt: now,
    ...values,
    id: values.id,
    familyId: values.familyId,
    name: values.name,
  };
}

function categoryAssignment(
  values: Pick<CategoryAssignment, 'id' | 'familyId' | 'categoryValueId' | 'entityId'>,
): CategoryAssignment {
  return {
    ...values,
    entityType: 'lesson-plan',
    createdAt: now,
  };
}

function reflection(
  values: Partial<TeachingReflectionRecord> &
    Pick<
      TeachingReflectionRecord,
      'id' | 'sessionOccurrenceId' | 'contextId' | 'lessonPlanId' | 'occurredOn'
    > & { contextName?: string; planTitle?: string },
): TeachingReflectionRecord {
  return {
    schoolYearId: schoolYear.id,
    whatWorked: 'Students compared strategies.',
    sourceSnapshots: {
      context: { kind: 'class', name: values.contextName ?? 'Class One' },
      lessonPlan: { title: values.planTitle ?? 'Reading' },
      sessionOccurrence: {
        date: values.occurredOn,
        startMinute: 540,
        endMinute: 600,
      },
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...values,
    id: values.id,
    sessionOccurrenceId: values.sessionOccurrenceId,
    contextId: values.contextId,
    lessonPlanId: values.lessonPlanId,
    occurredOn: values.occurredOn,
  };
}

function task(values: Partial<Task> & Pick<Task, 'id' | 'title' | 'status'>): Task {
  return {
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...values,
    id: values.id,
    title: values.title,
    status: values.status,
  };
}

function snapshot(values: Partial<TeachingInsightsSnapshot> = {}): TeachingInsightsSnapshot {
  return {
    schoolYear,
    asOfDate: '2026-08-05',
    learnerContexts: [],
    studentRecords: [],
    rosterMemberships: [],
    lessonPlans: [],
    sessionOccurrences: [],
    assessmentEvidence: [],
    libraryItems: [],
    standards: [],
    standardAlignments: [],
    categoryValues: [],
    categoryAssignments: [],
    teachingReflections: [],
    tasks: [],
    ...values,
  };
}

function issueCodes(view: ReturnType<typeof buildTeachingInsightsView>): string[] {
  return view.needsReview.issues.map((issue) => issue.code);
}

describe('Teaching Insights read model', () => {
  it('derives completed teaching activity from Session facts and excludes cancelled Sessions', () => {
    const classroom = context({ id: 'class-1', kind: 'class', name: 'Class One' });
    const lesson = plan({ id: 'plan-1', contextId: classroom.id, title: 'Reading' });
    const view = buildTeachingInsightsView(
      snapshot({
        learnerContexts: [classroom],
        lessonPlans: [lesson],
        sessionOccurrences: [
          session({
            id: 'completed-1',
            lessonPlanId: lesson.id,
            contextId: classroom.id,
            date: '2026-08-03',
            deliveryState: 'completed',
            completedAt: now,
            startMinute: 540,
            endMinute: 600,
          }),
          session({
            id: 'completed-2',
            lessonPlanId: lesson.id,
            contextId: classroom.id,
            date: '2026-08-03',
            deliveryState: 'completed',
            completedAt: now,
            startMinute: 660,
            endMinute: 690,
          }),
          session({
            id: 'cancelled',
            lessonPlanId: lesson.id,
            contextId: classroom.id,
            date: '2026-08-02',
            deliveryState: 'cancelled',
          }),
        ],
      }),
    );

    expect(view.teachingActivity).toMatchObject({
      completedSessionCount: 2,
      completedTeachingMinutes: 90,
      teachingDayCount: 1,
    });
    expect(view.plannedVersusTaught.cancelledSessionCount).toBe(1);
  });

  it('uses yesterday as the current-year closed boundary and leaves today in future scheduled work', () => {
    const classroom = context({ id: 'class-1', kind: 'class', name: 'Class One' });
    const lesson = plan({ id: 'plan-1', contextId: classroom.id, title: 'Reading' });
    const view = buildTeachingInsightsView(
      snapshot({
        learnerContexts: [classroom],
        lessonPlans: [lesson],
        sessionOccurrences: [
          session({
            id: 'past',
            lessonPlanId: lesson.id,
            contextId: classroom.id,
            date: '2026-08-04',
          }),
          session({
            id: 'today',
            lessonPlanId: lesson.id,
            contextId: classroom.id,
            date: '2026-08-05',
          }),
        ],
      }),
    );

    expect(view.schoolYear.closedThrough).toBe('2026-08-04');
    expect(view.plannedVersusTaught.unresolvedPastSessionCount).toBe(1);
    expect(view.plannedVersusTaught.futureScheduledSessionCount).toBe(1);
    expect(issueCodes(view)).toContain('past-session-still-scheduled');
  });

  it('returns an unavailable planned-to-taught ratio when the closed period has no eligible Sessions', () => {
    const view = buildTeachingInsightsView(snapshot());

    expect(view.plannedVersusTaught.completion).toEqual({
      status: 'unavailable',
      numerator: 0,
      denominator: 0,
      reason: 'no-eligible-records',
    });
  });

  it('keeps Class, Group, and Individual as peer context kinds', () => {
    const contexts = [
      context({ id: 'class-1', kind: 'class', name: 'Class' }),
      context({ id: 'group-1', kind: 'group', name: 'Group' }),
      context({
        id: 'individual-1',
        kind: 'individual',
        name: 'Individual',
        linkedStudentId: 's-1',
      }),
    ];
    const plans = contexts.map((value) =>
      plan({ id: `plan-${value.id}`, contextId: value.id, title: value.name }),
    );
    const sessions = plans.map((value, index) =>
      session({
        id: `session-${index}`,
        lessonPlanId: value.id,
        contextId: value.contextId,
        date: '2026-08-03',
        deliveryState: 'completed',
        completedAt: now,
      }),
    );
    const view = buildTeachingInsightsView(
      snapshot({
        learnerContexts: contexts,
        studentRecords: [student({ id: 's-1', name: 'Student' })],
        lessonPlans: plans,
        sessionOccurrences: sessions,
      }),
    );

    expect(view.contextDistribution.byKind).toEqual([
      { contextKind: 'class', completedSessions: 1, completedMinutes: 60, teachingDays: 1 },
      { contextKind: 'group', completedSessions: 1, completedMinutes: 60, teachingDays: 1 },
      { contextKind: 'individual', completedSessions: 1, completedMinutes: 60, teachingDays: 1 },
    ]);
  });

  it('deduplicates current retained roster learners across peer contexts', () => {
    const learner = student({ id: 'student-1', name: 'Learner' });
    const contexts = [
      context({ id: 'class-1', kind: 'class', name: 'Class' }),
      context({ id: 'group-1', kind: 'group', name: 'Group' }),
      context({
        id: 'individual-1',
        kind: 'individual',
        name: 'Individual',
        linkedStudentId: learner.id,
      }),
    ];
    const view = buildTeachingInsightsView(
      snapshot({
        learnerContexts: contexts,
        studentRecords: [learner],
        rosterMemberships: [
          membership({ id: 'm-1', contextId: 'class-1', studentId: learner.id }),
          membership({ id: 'm-2', contextId: 'group-1', studentId: learner.id }),
        ],
        assessmentEvidence: [
          evidence({ id: 'e-1', studentId: learner.id, occurredOn: '2026-08-01' }),
        ],
      }),
    );

    expect(view.assessmentEvidence).toMatchObject({
      activeEvidenceCount: 1,
      learnerCount: 1,
      currentRetainedRosterLearnerCount: 1,
      currentRetainedRosterCoveredLearnerCount: 1,
      currentRetainedRosterCoverage: {
        status: 'available',
        numerator: 1,
        denominator: 1,
        value: 1,
      },
    });
  });

  it('does not invent historical coverage when no retained roster links exist', () => {
    const view = buildTeachingInsightsView(snapshot());

    expect(view.assessmentEvidence.currentRetainedRosterCoverage).toEqual({
      status: 'unavailable',
      numerator: 0,
      denominator: 0,
      reason: 'no-retained-roster-links',
    });
  });

  it('counts explicit Standard placements without multiplying them by Sessions', () => {
    const classroom = context({ id: 'class-1', kind: 'class', name: 'Class One' });
    const lesson = plan({
      id: 'plan-1',
      contextId: classroom.id,
      title: 'Reading',
      lessonFlow: [{ id: 'step-1', title: 'Practice', phase: 'guided-practice' }],
    });
    const alignedStandard = standard({ id: 'standard-1', code: 'ELA.1' });
    const alignments: StandardAlignment[] = [
      {
        id: 'alignment-root',
        standardId: alignedStandard.id,
        targetType: 'lesson-plan',
        targetId: lesson.id,
        scopeKey: `lesson-plan:${lesson.id}:root`,
        createdAt: now,
      },
      {
        id: 'alignment-step',
        standardId: alignedStandard.id,
        targetType: 'lesson-plan',
        targetId: lesson.id,
        lessonFlowStepId: 'step-1',
        scopeKey: `lesson-plan:${lesson.id}:step:step-1`,
        createdAt: now,
      },
    ];
    const view = buildTeachingInsightsView(
      snapshot({
        learnerContexts: [classroom],
        lessonPlans: [lesson],
        standards: [alignedStandard],
        standardAlignments: alignments,
        sessionOccurrences: [
          session({
            id: 'session-1',
            lessonPlanId: lesson.id,
            contextId: classroom.id,
            date: '2026-08-03',
            deliveryState: 'completed',
            completedAt: now,
          }),
          session({
            id: 'session-2',
            lessonPlanId: lesson.id,
            contextId: classroom.id,
            date: '2026-08-04',
            deliveryState: 'completed',
            completedAt: now,
          }),
        ],
      }),
    );

    expect(view.standardsUsage).toMatchObject({
      activePlanCount: 1,
      plansWithActiveAlignmentCount: 1,
      plansWithoutActiveAlignmentCount: 0,
      uniqueExplicitlyLinkedStandardCount: 1,
      alignmentPlacementCount: 2,
    });
  });

  it('separates content placements from unique Library items and retains archived sources', () => {
    const classroom = context({ id: 'class-1', kind: 'class', name: 'Class One' });
    const activity = libraryItem({
      id: 'activity-1',
      catalogType: 'activity',
      title: 'Think Pair Share',
    });
    const resource = libraryItem({
      id: 'resource-1',
      catalogType: 'resource',
      title: 'Reading Text',
      status: 'archived',
      archivedAt: now,
    });
    const lesson = plan({
      id: 'plan-1',
      contextId: classroom.id,
      title: 'Reading',
      libraryLinks: [{ libraryItemId: activity.id, catalogType: 'activity' }],
      lessonFlow: [
        {
          id: 'step-1',
          title: 'Practice',
          phase: 'guided-practice',
          libraryLinks: [
            { libraryItemId: activity.id, catalogType: 'activity' },
            { libraryItemId: resource.id, catalogType: 'resource' },
          ],
        },
      ],
    });
    const view = buildTeachingInsightsView(
      snapshot({
        learnerContexts: [classroom],
        lessonPlans: [lesson],
        libraryItems: [activity, resource],
      }),
    );

    expect(view.contentUsage).toMatchObject({
      plansWithContentLinksCount: 1,
      uniqueItemCount: 2,
      placementCount: 3,
      archivedSourcePlacementCount: 1,
      uniqueItemsByType: { activity: 1, resource: 1, assessment: 0 },
      placementsByType: { activity: 2, resource: 1, assessment: 0 },
    });
  });

  it('counts only supported managed Plan classification families', () => {
    const classroom = context({ id: 'class-1', kind: 'class', name: 'Class One' });
    const lesson = plan({ id: 'plan-1', contextId: classroom.id, title: 'Reading' });
    const focus = categoryValue({ id: 'focus-1', familyId: 'focus-tag', name: 'Fluency' });
    const purpose = categoryValue({ id: 'purpose-1', familyId: 'purpose-tag', name: 'Review' });
    const view = buildTeachingInsightsView(
      snapshot({
        learnerContexts: [classroom],
        lessonPlans: [lesson],
        categoryValues: [focus, purpose],
        categoryAssignments: [
          categoryAssignment({
            id: 'assignment-1',
            familyId: 'focus-tag',
            categoryValueId: focus.id,
            entityId: lesson.id,
          }),
          categoryAssignment({
            id: 'assignment-2',
            familyId: 'purpose-tag',
            categoryValueId: purpose.id,
            entityId: lesson.id,
          }),
        ],
      }),
    );

    expect(view.classificationUsage.families).toEqual([
      { familyId: 'focus-tag', assignmentCount: 1, planCount: 1, distinctValueCount: 1 },
      { familyId: 'purpose-tag', assignmentCount: 1, planCount: 1, distinctValueCount: 1 },
      { familyId: 'theme-tag', assignmentCount: 0, planCount: 0, distinctValueCount: 0 },
    ]);
  });

  it('deduplicates affected records while retaining every review issue', () => {
    const classroom = context({ id: 'class-1', kind: 'class', name: 'Class One' });
    const lesson = plan({ id: 'plan-1', contextId: classroom.id, title: 'Reading' });
    const view = buildTeachingInsightsView(
      snapshot({
        learnerContexts: [classroom],
        lessonPlans: [lesson],
        sessionOccurrences: [
          session({
            id: 'session-1',
            lessonPlanId: lesson.id,
            contextId: classroom.id,
            date: '2026-08-03',
            deliveryState: 'completed',
          }),
        ],
      }),
    );

    expect(issueCodes(view)).toContain('completed-session-missing-completed-at');
    expect(view.needsReview.issueCount).toBe(1);
    expect(view.needsReview.affectedRecordCount).toBe(1);
  });

  it('excludes out-of-year records from primary metrics and exposes review traces', () => {
    const classroom = context({ id: 'class-1', kind: 'class', name: 'Class One' });
    const lesson = plan({ id: 'plan-1', contextId: classroom.id, title: 'Reading' });
    const learner = student({ id: 'student-1', name: 'Learner' });
    const view = buildTeachingInsightsView(
      snapshot({
        learnerContexts: [classroom],
        studentRecords: [learner],
        lessonPlans: [lesson],
        sessionOccurrences: [
          session({
            id: 'session-1',
            lessonPlanId: lesson.id,
            contextId: classroom.id,
            date: '2027-07-01',
            deliveryState: 'completed',
            completedAt: now,
          }),
        ],
        assessmentEvidence: [
          evidence({ id: 'evidence-1', studentId: learner.id, occurredOn: '2027-07-01' }),
        ],
      }),
    );

    expect(view.teachingActivity.completedSessionCount).toBe(0);
    expect(view.assessmentEvidence.activeEvidenceCount).toBe(0);
    expect(issueCodes(view)).toEqual([
      'evidence-outside-school-year',
      'session-outside-school-year',
    ]);
  });

  it('derives active Reflection coverage without treating archived or reopened sources as completed coverage', () => {
    const classroom = context({ id: 'class-1', kind: 'class', name: 'Class One' });
    const lesson = plan({ id: 'plan-1', contextId: classroom.id, title: 'Reading' });
    const completedWithReflection = session({
      id: 'session-reflected',
      lessonPlanId: lesson.id,
      contextId: classroom.id,
      date: '2026-08-03',
      deliveryState: 'completed',
      completedAt: now,
      reflectionId: 'reflection-active',
    });
    const completedWithArchivedReflection = session({
      id: 'session-archived',
      lessonPlanId: lesson.id,
      contextId: classroom.id,
      date: '2026-08-04',
      deliveryState: 'completed',
      completedAt: now,
      reflectionId: 'reflection-archived',
    });
    const reopened = session({
      id: 'session-reopened',
      lessonPlanId: lesson.id,
      contextId: classroom.id,
      date: '2026-08-02',
      deliveryState: 'scheduled',
      reflectionId: 'reflection-reopened',
    });

    const view = buildTeachingInsightsView(
      snapshot({
        learnerContexts: [classroom],
        lessonPlans: [lesson],
        sessionOccurrences: [completedWithReflection, completedWithArchivedReflection, reopened],
        teachingReflections: [
          reflection({
            id: 'reflection-active',
            sessionOccurrenceId: completedWithReflection.id,
            contextId: classroom.id,
            lessonPlanId: lesson.id,
            occurredOn: completedWithReflection.date,
          }),
          reflection({
            id: 'reflection-archived',
            sessionOccurrenceId: completedWithArchivedReflection.id,
            contextId: classroom.id,
            lessonPlanId: lesson.id,
            occurredOn: completedWithArchivedReflection.date,
            status: 'archived',
            archivedAt: now,
          }),
          reflection({
            id: 'reflection-reopened',
            sessionOccurrenceId: reopened.id,
            contextId: classroom.id,
            lessonPlanId: lesson.id,
            occurredOn: reopened.date,
          }),
        ],
      }),
    );

    expect(view.reflectionAndNextSteps).toMatchObject({
      activeReflectionCount: 2,
      archivedReflectionCount: 1,
      reflectedCompletedSessionCount: 1,
      completedSessionWithoutActiveReflectionCount: 1,
      reflectionCoverage: {
        status: 'available',
        numerator: 1,
        denominator: 2,
        value: 0.5,
      },
    });
    expect(
      view.reflectionAndNextSteps.reflections.find((row) => row.id === 'reflection-reopened'),
    ).toMatchObject({ sessionState: 'reopened' });
  });

  it('counts only Tasks explicitly linked to retained Reflections in the selected School Year', () => {
    const classroom = context({ id: 'class-1', kind: 'class', name: 'Class One' });
    const lesson = plan({ id: 'plan-1', contextId: classroom.id, title: 'Reading' });
    const completed = session({
      id: 'session-1',
      lessonPlanId: lesson.id,
      contextId: classroom.id,
      date: '2026-08-03',
      deliveryState: 'completed',
      completedAt: now,
      reflectionId: 'reflection-1',
    });
    const retainedReflection = reflection({
      id: 'reflection-1',
      sessionOccurrenceId: completed.id,
      contextId: classroom.id,
      lessonPlanId: lesson.id,
      occurredOn: completed.date,
    });

    const view = buildTeachingInsightsView(
      snapshot({
        learnerContexts: [classroom],
        lessonPlans: [lesson],
        sessionOccurrences: [completed],
        teachingReflections: [retainedReflection],
        tasks: [
          task({
            id: 'task-active',
            title: 'Prepare visuals',
            status: 'active',
            linkedEntityType: 'teaching-reflection',
            linkedEntityId: retainedReflection.id,
          }),
          task({
            id: 'task-waiting',
            title: 'Ask specialist',
            status: 'waiting',
            linkedEntityType: 'teaching-reflection',
            linkedEntityId: retainedReflection.id,
            waitingAt: now,
          }),
          task({
            id: 'task-completed',
            title: 'Print cards',
            status: 'completed',
            linkedEntityType: 'teaching-reflection',
            linkedEntityId: retainedReflection.id,
            completedAt: now,
          }),
          task({
            id: 'task-unrelated',
            title: 'Unrelated',
            status: 'cancelled',
            linkedEntityType: 'teaching-reflection',
            linkedEntityId: 'other-reflection',
            cancelledAt: now,
          }),
        ],
      }),
    );

    expect(view.reflectionAndNextSteps).toMatchObject({
      activeNextStepCount: 1,
      waitingNextStepCount: 1,
      completedNextStepCount: 1,
      cancelledNextStepCount: 0,
      openNextStepCount: 2,
      closedNextStepCount: 1,
    });
    expect(view.reflectionAndNextSteps.reflections[0]).toMatchObject({
      openNextStepCount: 2,
      closedNextStepCount: 1,
      source: {
        entityType: 'teaching-reflection',
        entityId: retainedReflection.id,
        href: '#/planning/session/reflection?session=session-1',
      },
    });
  });
});
