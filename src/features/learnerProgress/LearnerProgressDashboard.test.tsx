import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LearnerProgressView } from './learnerProgressReadModel';
import { LearnerProgressDashboard } from './LearnerProgressDashboard';

const view: LearnerProgressView = {
  contractVersion: 1,
  schoolYear: {
    id: 'year-1',
    label: '2026–2027',
    startsOn: '2026-07-01',
    endsOn: '2027-06-30',
    active: true,
    lifecycleState: 'active',
  },
  asOfDate: '2026-08-07',
  mode: 'learners',
  selectedId: 'student-1',
  scopeLabel: 'Alice Chen',
  scopeRows: [
    {
      id: 'student-1',
      label: 'Alice Chen',
      meta: 'Student record',
      sourceStatus: 'current',
      evidenceCount: 1,
    },
  ],
  scopeEvidenceCount: 1,
  evidence: [
    {
      id: 'evidence-1',
      studentId: 'student-1',
      schoolYearId: 'year-1',
      occurredOn: '2026-08-04',
      title: 'Reading check',
      kind: 'score',
      status: 'active',
      valueLabel: '3 / 4',
      student: {
        entityType: 'student',
        entityId: 'student-1',
        label: 'Alice Chen',
        status: 'current',
        href: '#/learners?student=student-1',
      },
      standards: [],
    },
  ],
  summary: {
    evidenceCount: 1,
    learnerCount: 1,
    scoreCount: 1,
    proficiencyCount: 0,
    observationCount: 0,
  },
};

const noop = vi.fn();

describe('LearnerProgressDashboard', () => {
  it('states the non-inference contract and presents recorded Evidence without a grade or mastery score', () => {
    render(
      <LearnerProgressDashboard
        schoolYears={[view.schoolYear]}
        view={view}
        period={{ preset: 'school-year' }}
        resolvedPeriod={{
          preset: 'school-year',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          label: 'Jul 1, 2026–Jun 30, 2027',
          overlapsSchoolYear: true,
        }}
        statusFilter="active"
        kindFilter="all"
        onSchoolYearChange={noop}
        onPeriodChange={noop}
        onModeChange={noop}
        onScopeChange={noop}
        onStatusFilterChange={noop}
        onKindFilterChange={noop}
        onEvidenceChange={noop}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Learner Progress' })).toBeVisible();
    expect(screen.getByText('Recorded Evidence, not a mastery judgment')).toBeVisible();
    expect(screen.getByText('Reading check')).toBeVisible();
    expect(screen.getByText('3 / 4')).toBeVisible();
    expect(screen.getByText(/No Evidence in this scope does not mean failure/)).toBeVisible();
  });
});
