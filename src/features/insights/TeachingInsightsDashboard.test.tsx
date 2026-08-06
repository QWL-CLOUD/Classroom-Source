import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SchoolYear } from '@/domain/models/entities';

import type { TeachingInsightsView } from './teachingInsightsReadModel';
import { TeachingInsightsDashboard } from './TeachingInsightsDashboard';

const schoolYears: SchoolYear[] = [
  {
    id: 'current',
    label: '2026–2027',
    startsOn: '2026-07-01',
    endsOn: '2027-06-30',
    active: true,
    lifecycleState: 'active',
  },
  {
    id: 'historical',
    label: '2025–2026',
    startsOn: '2025-07-01',
    endsOn: '2026-06-30',
    active: false,
    lifecycleState: 'archived',
  },
];

function createView(overrides: Partial<TeachingInsightsView> = {}): TeachingInsightsView {
  const view: TeachingInsightsView = {
    contractVersion: 2,
    schoolYear: {
      id: 'current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      asOfDate: '2026-08-05',
      closedThrough: '2026-08-04',
      status: 'current',
      source: { entityType: 'school-year', entityId: 'current', label: '2026–2027' },
    },
    teachingActivity: {
      completedSessionCount: 2,
      completedTeachingMinutes: 90,
      teachingDayCount: 2,
      sessions: [
        {
          id: 'session-1',
          title: 'Fractions workshop',
          date: '2026-08-04',
          minutes: 45,
          contextId: 'class-1',
          contextName: 'Grade 4 Math',
          contextKind: 'class',
          contextArchived: false,
          deliveryState: 'completed',
          source: {
            entityType: 'session',
            entityId: 'session-1',
            label: 'Fractions workshop',
            href: '#/planning/session?session=session-1',
          },
        },
      ],
    },
    plannedVersusTaught: {
      pastPlannedSessionCount: 3,
      taughtSessionCount: 2,
      unresolvedPastSessionCount: 1,
      futureScheduledSessionCount: 2,
      cancelledSessionCount: 1,
      completion: { status: 'available', numerator: 2, denominator: 3, value: 2 / 3 },
      readyUnscheduledPlanCount: 1,
    },
    assessmentEvidence: {
      activeEvidenceCount: 4,
      learnerCount: 3,
      currentRetainedRosterLearnerCount: 5,
      currentRetainedRosterCoveredLearnerCount: 3,
      currentRetainedRosterCoverage: {
        status: 'available',
        numerator: 3,
        denominator: 5,
        value: 0.6,
      },
      byKind: { score: 1, proficiency: 1, observation: 2 },
      sourceLinkage: { context: 4, lessonPlan: 3, session: 2, assessment: 1, standard: 2 },
    },
    contextDistribution: {
      byKind: [
        { contextKind: 'class', completedSessions: 2, completedMinutes: 90, teachingDays: 2 },
        { contextKind: 'group', completedSessions: 0, completedMinutes: 0, teachingDays: 0 },
        { contextKind: 'individual', completedSessions: 0, completedMinutes: 0, teachingDays: 0 },
      ],
      contexts: [
        {
          contextId: 'class-1',
          contextName: 'Grade 4 Math',
          contextKind: 'class',
          archived: false,
          completedSessions: 2,
          completedMinutes: 90,
          teachingDays: 2,
          unresolvedPastSessions: 1,
          futureScheduledSessions: 2,
          source: {
            entityType: 'context',
            entityId: 'class-1',
            label: 'Grade 4 Math',
            href: '#/learners?context=class-1',
          },
        },
      ],
    },
    standardsUsage: {
      activePlanCount: 2,
      plansWithActiveAlignmentCount: 1,
      plansWithoutActiveAlignmentCount: 1,
      uniqueExplicitlyLinkedStandardCount: 1,
      alignmentPlacementCount: 1,
      placements: [],
    },
    contentUsage: {
      plansWithContentLinksCount: 1,
      uniqueItemCount: 2,
      placementCount: 2,
      archivedSourcePlacementCount: 0,
      uniqueItemsByType: { activity: 1, resource: 1, assessment: 0 },
      placementsByType: { activity: 1, resource: 1, assessment: 0 },
      placements: [],
    },
    classificationUsage: {
      families: [
        { familyId: 'focus-tag', assignmentCount: 1, planCount: 1, distinctValueCount: 1 },
        { familyId: 'purpose-tag', assignmentCount: 0, planCount: 0, distinctValueCount: 0 },
        { familyId: 'theme-tag', assignmentCount: 0, planCount: 0, distinctValueCount: 0 },
      ],
    },
    reflectionAndNextSteps: {
      activeReflectionCount: 1,
      archivedReflectionCount: 0,
      reflectedCompletedSessionCount: 1,
      completedSessionWithoutActiveReflectionCount: 1,
      reflectionCoverage: { status: 'available', numerator: 1, denominator: 2, value: 0.5 },
      activeNextStepCount: 1,
      waitingNextStepCount: 1,
      completedNextStepCount: 1,
      cancelledNextStepCount: 0,
      openNextStepCount: 2,
      closedNextStepCount: 1,
      reflections: [
        {
          id: 'reflection-1',
          sessionOccurrenceId: 'session-1',
          lessonPlanId: 'plan-1',
          lessonPlanTitle: 'Fractions workshop',
          contextId: 'class-1',
          contextName: 'Grade 4 Math',
          occurredOn: '2026-08-04',
          status: 'active',
          sessionState: 'completed',
          openNextStepCount: 2,
          closedNextStepCount: 1,
          source: {
            entityType: 'teaching-reflection',
            entityId: 'reflection-1',
            label: 'Fractions workshop',
            href: '#/planning/session/reflection?session=session-1',
          },
        },
      ],
    },
    needsReview: {
      affectedRecordCount: 1,
      issueCount: 1,
      issues: [
        {
          code: 'past-session-still-scheduled',
          entityType: 'session',
          entityId: 'session-2',
          message: 'Past Session is still marked Scheduled.',
          source: {
            entityType: 'session',
            entityId: 'session-2',
            label: 'Reading workshop',
            href: '#/planning/session?session=session-2',
          },
        },
      ],
    },
  };

  return { ...view, ...overrides };
}

describe('TeachingInsightsDashboard', () => {
  it('renders source-linked descriptive metrics without unsupported teaching judgments', () => {
    render(
      <TeachingInsightsDashboard
        schoolYears={schoolYears}
        view={createView()}
        onSchoolYearChange={() => undefined}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Teaching Insights' })).toBeVisible();
    expect(screen.getByText('Completed Sessions')).toBeVisible();
    expect(screen.getByText('67%')).toBeVisible();
    expect(screen.getByText('Current retained roster coverage')).toBeVisible();
    const reflectionSection = screen.getByRole('region', { name: 'Reflection and Next Steps' });
    expect(within(reflectionSection).getByText('50%')).toBeVisible();
    expect(
      within(reflectionSection).getByRole('link', { name: 'Fractions workshop' }),
    ).toHaveAttribute('href', '#/planning/session/reflection?session=session-1');
    expect(screen.getByText('Past Session is still marked Scheduled.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Reading workshop' })).toHaveAttribute(
      'href',
      '#/planning/session?session=session-2',
    );
    expect(screen.queryByText(/teacher score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/learner ranking/i)).toBeInTheDocument();
  });

  it('reports School Year selection through the provided URL-state callback', () => {
    const onSchoolYearChange = vi.fn();
    render(
      <TeachingInsightsDashboard
        schoolYears={schoolYears}
        view={createView()}
        onSchoolYearChange={onSchoolYearChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('School Year'), {
      target: { value: 'historical' },
    });

    expect(onSchoolYearChange).toHaveBeenCalledWith('historical');
  });

  it('shows unavailable denominators as unavailable instead of a misleading zero percent', () => {
    const base = createView();
    render(
      <TeachingInsightsDashboard
        schoolYears={schoolYears}
        view={createView({
          plannedVersusTaught: {
            ...base.plannedVersusTaught,
            completion: {
              status: 'unavailable',
              numerator: 0,
              denominator: 0,
              reason: 'no-eligible-records',
            },
          },
          assessmentEvidence: {
            ...base.assessmentEvidence,
            currentRetainedRosterLearnerCount: 0,
            currentRetainedRosterCoveredLearnerCount: 0,
            currentRetainedRosterCoverage: {
              status: 'unavailable',
              numerator: 0,
              denominator: 0,
              reason: 'no-retained-roster-links',
            },
          },
          reflectionAndNextSteps: {
            ...base.reflectionAndNextSteps,
            activeReflectionCount: 0,
            archivedReflectionCount: 0,
            reflectedCompletedSessionCount: 0,
            completedSessionWithoutActiveReflectionCount: 0,
            reflectionCoverage: {
              status: 'unavailable',
              numerator: 0,
              denominator: 0,
              reason: 'no-eligible-records',
            },
            activeNextStepCount: 0,
            waitingNextStepCount: 0,
            completedNextStepCount: 0,
            cancelledNextStepCount: 0,
            openNextStepCount: 0,
            closedNextStepCount: 0,
            reflections: [],
          },
          needsReview: { affectedRecordCount: 0, issueCount: 0, issues: [] },
        })}
        onSchoolYearChange={() => undefined}
      />,
    );

    expect(screen.getAllByText('Not available')).toHaveLength(3);
    expect(screen.getByText('No eligible closed-period records.')).toBeVisible();
    expect(
      screen.getByText('No retained roster or linked Individual learner records.'),
    ).toBeVisible();
    expect(
      screen.getByText('No completed Sessions are retained for this School Year.'),
    ).toBeVisible();
    expect(screen.getByText('No review issues were found for this School Year.')).toBeVisible();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
