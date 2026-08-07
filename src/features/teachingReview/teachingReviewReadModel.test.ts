import { describe, expect, it } from 'vitest';

import type { TeachingInsightsView } from '@/features/insights/teachingInsightsReadModel';

import { buildTeachingReviewView } from './teachingReviewReadModel';

function source(
  entityType: 'session' | 'teaching-reflection' | 'lesson-plan',
  entityId: string,
  label: string,
  href?: string,
) {
  return { entityType, entityId, label, href };
}

function createInsights(): TeachingInsightsView {
  return {
    contractVersion: 2,
    schoolYear: {
      id: 'year-1',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      asOfDate: '2026-08-07',
      closedThrough: '2026-08-06',
      status: 'current',
      source: {
        entityType: 'school-year',
        entityId: 'year-1',
        label: '2026–2027',
      },
    },
    teachingActivity: {
      completedSessionCount: 3,
      completedTeachingMinutes: 120,
      teachingDayCount: 3,
      sessions: [
        {
          id: 'session-active-reflection',
          title: 'Active reflection lesson',
          date: '2026-08-05',
          minutes: 40,
          contextId: 'context-1',
          contextName: 'Class A',
          contextKind: 'class',
          contextArchived: false,
          deliveryState: 'completed',
          source: source(
            'session',
            'session-active-reflection',
            'Active reflection lesson',
            '#/planning/session?session=session-active-reflection',
          ),
        },
        {
          id: 'session-archived-reflection',
          title: 'Archived reflection lesson',
          date: '2026-08-06',
          minutes: 40,
          contextId: 'context-1',
          contextName: 'Class A',
          contextKind: 'class',
          contextArchived: false,
          deliveryState: 'completed',
          source: source(
            'session',
            'session-archived-reflection',
            'Archived reflection lesson',
            '#/planning/session?session=session-archived-reflection',
          ),
        },
        {
          id: 'session-no-reflection',
          title: 'No reflection lesson',
          date: '2026-08-04',
          minutes: 40,
          contextId: 'context-2',
          contextName: 'Group B',
          contextKind: 'group',
          contextArchived: false,
          deliveryState: 'completed',
          source: source(
            'session',
            'session-no-reflection',
            'No reflection lesson',
            '#/planning/session?session=session-no-reflection',
          ),
        },
      ],
    },
    plannedVersusTaught: {
      pastPlannedSessionCount: 4,
      taughtSessionCount: 3,
      unresolvedPastSessionCount: 1,
      futureScheduledSessionCount: 0,
      cancelledSessionCount: 0,
      completion: { status: 'available', numerator: 3, denominator: 4, value: 0.75 },
      readyUnscheduledPlanCount: 0,
    },
    assessmentEvidence: {
      activeEvidenceCount: 0,
      learnerCount: 0,
      currentRetainedRosterLearnerCount: 0,
      currentRetainedRosterCoveredLearnerCount: 0,
      currentRetainedRosterCoverage: {
        status: 'unavailable',
        numerator: 0,
        denominator: 0,
        reason: 'no-retained-roster-links',
      },
      byKind: { score: 0, proficiency: 0, observation: 0 },
      sourceLinkage: { context: 0, lessonPlan: 0, session: 0, assessment: 0, standard: 0 },
    },
    contextDistribution: { byKind: [], contexts: [] },
    standardsUsage: {
      activePlanCount: 0,
      plansWithActiveAlignmentCount: 0,
      plansWithoutActiveAlignmentCount: 0,
      uniqueExplicitlyLinkedStandardCount: 0,
      alignmentPlacementCount: 0,
      placements: [],
    },
    contentUsage: {
      plansWithContentLinksCount: 0,
      uniqueItemCount: 0,
      placementCount: 0,
      archivedSourcePlacementCount: 0,
      uniqueItemsByType: { activity: 0, resource: 0, assessment: 0 },
      placementsByType: { activity: 0, resource: 0, assessment: 0 },
      placements: [],
    },
    classificationUsage: { families: [] },
    reflectionAndNextSteps: {
      activeReflectionCount: 1,
      archivedReflectionCount: 1,
      reflectedCompletedSessionCount: 1,
      completedSessionWithoutActiveReflectionCount: 2,
      reflectionCoverage: { status: 'available', numerator: 1, denominator: 3, value: 1 / 3 },
      activeNextStepCount: 2,
      waitingNextStepCount: 1,
      completedNextStepCount: 0,
      cancelledNextStepCount: 0,
      openNextStepCount: 3,
      closedNextStepCount: 0,
      reflections: [
        {
          id: 'reflection-active',
          sessionOccurrenceId: 'session-active-reflection',
          lessonPlanId: 'plan-1',
          lessonPlanTitle: 'Active reflection lesson',
          contextId: 'context-1',
          contextName: 'Class A',
          occurredOn: '2026-08-05',
          status: 'active',
          sessionState: 'completed',
          openNextStepCount: 3,
          closedNextStepCount: 0,
          source: source(
            'teaching-reflection',
            'reflection-active',
            'Active reflection lesson',
            '#/planning/session/reflection?session=session-active-reflection',
          ),
        },
        {
          id: 'reflection-archived',
          sessionOccurrenceId: 'session-archived-reflection',
          lessonPlanId: 'plan-2',
          lessonPlanTitle: 'Archived reflection lesson',
          contextId: 'context-1',
          contextName: 'Class A',
          occurredOn: '2026-08-06',
          status: 'archived',
          sessionState: 'completed',
          openNextStepCount: 0,
          closedNextStepCount: 0,
          source: source(
            'teaching-reflection',
            'reflection-archived',
            'Archived reflection lesson',
            '#/planning/session/reflection?session=session-archived-reflection',
          ),
        },
      ],
    },
    needsReview: {
      affectedRecordCount: 2,
      issueCount: 2,
      issues: [
        {
          code: 'past-session-still-scheduled',
          entityType: 'session',
          entityId: 'session-past',
          message: 'Past Session is still marked Scheduled.',
          source: source(
            'session',
            'session-past',
            'Past scheduled lesson',
            '#/planning/session?session=session-past',
          ),
        },
        {
          code: 'standard-alignment-missing-source',
          entityType: 'lesson-plan',
          entityId: 'plan-broken',
          message: 'Standard alignment has a missing, archived, or invalid source.',
          source: source(
            'lesson-plan',
            'plan-broken',
            'Plan with broken alignment',
            '#/planning/edit?plan=plan-broken&return=learners',
          ),
        },
      ],
    },
  };
}

describe('Teaching Review read model', () => {
  it('separates teacher review queues from integrity issues without inventing state', () => {
    const view = buildTeachingReviewView(createInsights());

    expect(view.contractVersion).toBe(1);
    expect(view.awaitingReflection.count).toBe(2);
    expect(view.awaitingReflection.rows.map((row) => row.sessionOccurrenceId)).toEqual([
      'session-archived-reflection',
      'session-no-reflection',
    ]);
    expect(view.awaitingReflection.rows[0]).toMatchObject({
      reflectionState: 'archived',
      reflectionHref: '#/planning/session/reflection?session=session-archived-reflection',
    });
    expect(view.awaitingReflection.rows[1]).toMatchObject({
      reflectionState: 'missing',
      reflectionHref: '#/planning/session/reflection?session=session-no-reflection',
    });

    expect(view.pastStillScheduled.count).toBe(1);
    expect(view.pastStillScheduled.rows[0]?.sessionOccurrenceId).toBe('session-past');

    expect(view.openNextSteps.reflectionCount).toBe(1);
    expect(view.openNextSteps.taskCount).toBe(3);
    expect(view.openNextSteps.rows[0]).toMatchObject({
      reflectionId: 'reflection-active',
      openNextStepCount: 3,
    });

    expect(view.recordIssues.issueCount).toBe(1);
    expect(view.recordIssues.affectedRecordCount).toBe(1);
    expect(view.recordIssues.issues[0]?.code).toBe('standard-alignment-missing-source');
  });

  it('does not treat completed teaching without Evidence as a review queue', () => {
    const view = buildTeachingReviewView(createInsights());

    expect(Object.keys(view)).toEqual([
      'contractVersion',
      'schoolYear',
      'awaitingReflection',
      'pastStillScheduled',
      'openNextSteps',
      'recordIssues',
    ]);
  });
});
