import { describe, expect, it } from 'vitest';

import type { LearnerProgressView } from '@/features/learnerProgress/learnerProgressReadModel';

import { buildLearnerEvidenceReport } from './learnerEvidenceReport';

function view(): LearnerProgressView {
  return {
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
        evidenceCount: 2,
      },
    ],
    scopeEvidenceCount: 2,
    evidence: [
      {
        id: 'evidence-1',
        studentId: 'student-1',
        schoolYearId: 'year-1',
        occurredOn: '2026-08-05',
        title: 'Reading check',
        kind: 'score',
        status: 'active',
        valueLabel: '3 / 4',
        student: {
          entityType: 'student',
          entityId: 'student-1',
          label: 'Alice Chen',
          status: 'current',
        },
        context: {
          entityType: 'context',
          entityId: 'class-1',
          label: 'Class · Reading',
          status: 'current',
        },
        assessment: {
          entityType: 'assessment',
          entityId: 'assessment-1',
          label: 'Reading Check',
          status: 'archived',
        },
        session: {
          entityType: 'session',
          entityId: 'session-1',
          label: 'Session · Aug 5',
          status: 'current',
        },
        standards: [
          {
            entityType: 'standard',
            entityId: 'standard-1',
            label: 'ELA.4.R.1 · Use details from text.',
            status: 'snapshot',
          },
        ],
      },
      {
        id: 'evidence-2',
        studentId: 'student-1',
        schoolYearId: 'year-1',
        occurredOn: '2026-08-03',
        title: 'Conference observation',
        kind: 'observation',
        status: 'active',
        valueLabel: 'Teacher observation',
        observationText: 'Explained reasoning independently.',
        notes: 'Follow up next week.',
        student: {
          entityType: 'student',
          entityId: 'student-1',
          label: 'Alice Chen',
          status: 'current',
        },
        context: {
          entityType: 'context',
          entityId: 'deleted-group',
          label: 'Group · Historical vocabulary group',
          status: 'snapshot',
        },
        standards: [],
      },
    ],
    selectedEvidence: undefined,
    summary: {
      evidenceCount: 2,
      learnerCount: 1,
      scoreCount: 1,
      proficiencyCount: 0,
      observationCount: 1,
    },
    assessmentOptions: [],
    standardOptions: [],
    sessionOptions: [],
    schoolYearState: 'current',
  };
}

describe('Learner Evidence teacher report', () => {
  it('projects the already-filtered Learner Progress view without deriving mastery or grades', () => {
    const report = buildLearnerEvidenceReport({
      view: view(),
      period: {
        preset: 'this-week',
        startsOn: '2026-08-03',
        endsOn: '2026-08-09',
        label: 'Aug 3–Aug 9',
        overlapsSchoolYear: true,
      },
      status: 'active',
      kind: 'all',
    });

    expect(report).toMatchObject({
      contractVersion: 1,
      audience: 'teacher-internal',
      schoolYearLabel: '2026–2027',
      learnerLabel: 'Alice Chen',
      filters: { status: 'active', kind: 'all' },
      summary: {
        evidenceCount: 2,
        scoreCount: 1,
        proficiencyCount: 0,
        observationCount: 1,
      },
    });
    expect(report?.rows[0]).toMatchObject({
      title: 'Reading check',
      valueLabel: '3 / 4',
      assessment: { label: 'Reading Check', status: 'archived' },
      standards: [{ label: 'ELA.4.R.1 · Use details from text.', status: 'snapshot' }],
    });
    expect(JSON.stringify(report)).not.toMatch(/mastery|grade|rank|readiness/i);
  });

  it('returns no report until an explicit learner scope is selected', () => {
    const allLearners = { ...view(), selectedId: undefined, scopeLabel: 'All learner Evidence' };
    expect(
      buildLearnerEvidenceReport({
        view: allLearners,
        period: {
          preset: 'school-year',
          startsOn: '2026-07-01',
          endsOn: '2027-06-30',
          label: 'Jul 1–Jun 30',
          overlapsSchoolYear: true,
        },
        status: 'active',
        kind: 'all',
      }),
    ).toBeNull();
  });
});
