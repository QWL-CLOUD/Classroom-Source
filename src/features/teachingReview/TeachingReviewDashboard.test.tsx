import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SchoolYear } from '@/domain/models/entities';

import type { TeachingReviewView } from './teachingReviewReadModel';
import { TeachingReviewDashboard } from './TeachingReviewDashboard';

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

function createView(): TeachingReviewView {
  return {
    contractVersion: 1,
    schoolYear: {
      id: 'current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      asOfDate: '2026-08-07',
      closedThrough: '2026-08-06',
      status: 'current',
      source: {
        entityType: 'school-year',
        entityId: 'current',
        label: '2026–2027',
      },
    },
    awaitingReflection: {
      count: 1,
      rows: [
        {
          sessionOccurrenceId: 'session-1',
          title: 'Fractions workshop',
          date: '2026-08-06',
          contextName: 'Grade 4 Math',
          reflectionState: 'archived',
          sessionSource: {
            entityType: 'session',
            entityId: 'session-1',
            label: 'Fractions workshop',
            href: '#/planning/session?session=session-1',
          },
          reflectionHref:
            '#/planning/session/reflection?session=session-1&return=review&schoolYear=current&reviewQueue=awaiting-reflection&reviewFocus=session%3Asession-1',
        },
      ],
    },
    pastStillScheduled: {
      count: 1,
      rows: [
        {
          sessionOccurrenceId: 'session-2',
          title: 'Reading workshop',
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
    openNextSteps: {
      reflectionCount: 1,
      taskCount: 2,
      rows: [
        {
          reflectionId: 'reflection-1',
          sessionOccurrenceId: 'session-3',
          lessonPlanTitle: 'Vocabulary lesson',
          contextName: 'Group A',
          occurredOn: '2026-08-05',
          reflectionStatus: 'active',
          sessionState: 'completed',
          openNextStepCount: 2,
          source: {
            entityType: 'teaching-reflection',
            entityId: 'reflection-1',
            label: 'Vocabulary lesson',
            href: '#/planning/session/reflection?session=session-3',
          },
        },
      ],
    },
    recordIssues: {
      affectedRecordCount: 1,
      issueCount: 1,
      issues: [
        {
          code: 'standard-alignment-missing-source',
          entityType: 'lesson-plan',
          entityId: 'plan-1',
          message: 'Standard alignment has a missing, archived, or invalid source.',
          source: {
            entityType: 'lesson-plan',
            entityId: 'plan-1',
            label: 'Source plan',
            href: '#/planning/edit?plan=plan-1&return=learners',
          },
        },
      ],
    },
  };
}

const schoolYearPeriod = {
  preset: 'school-year' as const,
  startsOn: '2026-07-01',
  endsOn: '2027-06-30',
  label: 'Jul 1–Jun 30',
  overlapsSchoolYear: true,
};

describe('TeachingReviewDashboard', () => {
  it('renders separate factual review queues and existing source actions', () => {
    render(
      <TeachingReviewDashboard
        schoolYears={schoolYears}
        view={createView()}
        period={{ preset: 'school-year' }}
        resolvedPeriod={schoolYearPeriod}
        onSchoolYearChange={() => undefined}
        onPeriodChange={() => undefined}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Teaching Review' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to Teaching Insights' })).toHaveAttribute(
      'href',
      '#/insights?schoolYear=current',
    );

    const awaiting = screen.getByRole('region', { name: 'Awaiting Reflection' });
    expect(within(awaiting).getByText('Archived Reflection')).toBeVisible();
    expect(within(awaiting).getByRole('link', { name: 'Review Reflection' })).toHaveAttribute(
      'href',
      '#/planning/session/reflection?session=session-1&return=review&schoolYear=current&reviewQueue=awaiting-reflection&reviewFocus=session%3Asession-1',
    );

    const nextSteps = screen.getByRole('region', { name: 'Open Next Steps' });
    expect(within(nextSteps).getByText('2 open Next Steps')).toBeVisible();
    expect(within(nextSteps).getByRole('link', { name: 'Open Tasks' })).toHaveAttribute(
      'href',
      '#/tasks?reflection=reflection-1&return=review&schoolYear=current&reviewQueue=open-next-steps&reviewFocus=teaching-reflection%3Areflection-1',
    );

    const issues = screen.getByRole('region', { name: 'Record Issues' });
    expect(within(issues).getByText('standard-alignment-missing-source')).toBeVisible();
    expect(within(issues).getByRole('link', { name: 'Source plan' })).toHaveAttribute(
      'href',
      '#/planning/edit?plan=plan-1&return=review&schoolYear=current&reviewQueue=record-issues&reviewFocus=lesson-plan%3Aplan-1',
    );
    expect(screen.queryByText(/Evidence gap/i)).not.toBeInTheDocument();
  });

  it('reports School Year selection through the provided URL-state callback', () => {
    const onSchoolYearChange = vi.fn();
    render(
      <TeachingReviewDashboard
        schoolYears={schoolYears}
        view={createView()}
        period={{ preset: 'school-year' }}
        resolvedPeriod={schoolYearPeriod}
        onSchoolYearChange={onSchoolYearChange}
        onPeriodChange={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('School Year'), {
      target: { value: 'historical' },
    });

    expect(onSchoolYearChange).toHaveBeenCalledWith('historical');
  });

  it('reports URL-backed review period changes without saving review state', () => {
    const onPeriodChange = vi.fn();
    render(
      <TeachingReviewDashboard
        schoolYears={schoolYears}
        view={createView()}
        period={{ preset: 'school-year' }}
        resolvedPeriod={schoolYearPeriod}
        onSchoolYearChange={() => undefined}
        onPeriodChange={onPeriodChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'this-week' } });
    expect(onPeriodChange).toHaveBeenCalledWith({ preset: 'this-week' });
    expect(screen.getByText(/Record Issues remain School Year-wide/)).toBeVisible();
  });
});
