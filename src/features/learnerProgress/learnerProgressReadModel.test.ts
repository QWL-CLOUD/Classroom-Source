import { describe, expect, it } from 'vitest';

import type { LearnerProgressSnapshot } from './learnerProgressReadModel';
import { buildLearnerProgressView } from './learnerProgressReadModel';
import { resolveLearnerProgressPeriod } from './learnerProgressPeriod';

const timestamp = '2026-08-07T12:00:00.000Z';

function snapshot(): LearnerProgressSnapshot {
  return {
    schoolYear: {
      id: 'year-1',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
      lifecycleState: 'active',
    },
    asOfDate: '2026-08-07',
    students: [
      {
        id: 'student-alice',
        name: 'Alice Chen',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'student-ben',
        name: 'Ben Lee',
        status: 'archived',
        archivedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    contexts: [
      {
        id: 'class-a',
        kind: 'class',
        name: 'Class A',
        schoolYearId: 'year-1',
        status: 'active',
      },
    ],
    standards: [
      {
        id: 'standard-1',
        issuingOrganization: 'Synthetic',
        frameworkTitle: 'ELA',
        frameworkKey: 'ela',
        code: 'ELA.1',
        normalizedCode: 'ela.1',
        statement: 'Use details from a text.',
        sortOrder: 0,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    lessonPlans: [
      {
        id: 'plan-1',
        contextId: 'class-a',
        title: 'Reading Workshop',
        subject: 'ELA',
        workflowState: 'ready',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    sessions: [
      {
        id: 'session-1',
        lessonPlanId: 'plan-1',
        contextId: 'class-a',
        date: '2026-08-04',
        startMinute: 540,
        endMinute: 600,
        deliveryState: 'completed',
        completedAt: timestamp,
      },
    ],
    libraryItems: [
      {
        id: 'assessment-1',
        catalogType: 'assessment',
        title: 'Reading Check',
        tags: [],
        typedFields: { catalogType: 'assessment', assessmentKind: 'formative' },
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    evidence: [
      {
        id: 'evidence-score',
        studentId: 'student-alice',
        schoolYearId: 'year-1',
        occurredOn: '2026-08-04',
        title: 'Reading check score',
        kind: 'score',
        score: { value: 3, maximum: 4 },
        contextId: 'class-a',
        lessonPlanId: 'plan-1',
        sessionOccurrenceId: 'session-1',
        assessmentId: 'assessment-1',
        standardIds: ['standard-1'],
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'evidence-observation',
        studentId: 'student-alice',
        schoolYearId: 'year-1',
        occurredOn: '2026-08-01',
        title: 'Conference note',
        kind: 'observation',
        observation: { text: 'Used context clues independently.' },
        contextId: 'deleted-group',
        standardIds: ['deleted-standard'],
        sourceSnapshots: {
          context: { kind: 'group', name: 'Historical vocabulary group' },
          standards: [
            {
              standardId: 'deleted-standard',
              code: 'VOC.2',
              statement: 'Use vocabulary in context.',
            },
          ],
        },
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'evidence-archived',
        studentId: 'student-ben',
        schoolYearId: 'year-1',
        occurredOn: '2026-08-03',
        title: 'Archived proficiency',
        kind: 'proficiency',
        proficiency: { label: 'Developing', scaleKey: 'reading', scaleLabel: 'Reading continuum' },
        standardIds: [],
        status: 'archived',
        archivedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

describe('Learner Progress read model', () => {
  it('keeps Score, Proficiency, and Observation as recorded Evidence rather than deriving mastery', () => {
    const input = snapshot();
    const period = resolveLearnerProgressPeriod(
      { preset: 'school-year' },
      input.schoolYear,
      input.asOfDate,
    );
    const view = buildLearnerProgressView(input, {
      mode: 'learners',
      status: 'all',
      kind: 'all',
      period,
    });

    expect(view.contractVersion).toBe(1);
    expect(view.summary).toEqual({
      evidenceCount: 3,
      learnerCount: 2,
      scoreCount: 1,
      proficiencyCount: 1,
      observationCount: 1,
    });
    expect(view.evidence.find((item) => item.id === 'evidence-score')?.valueLabel).toBe('3 / 4');
    expect(view.evidence.find((item) => item.id === 'evidence-observation')?.valueLabel).toBe(
      'Teacher observation',
    );
  });

  it('uses explicit context links and retained snapshots without reconstructing roster history', () => {
    const input = snapshot();
    const period = resolveLearnerProgressPeriod(
      { preset: 'school-year' },
      input.schoolYear,
      input.asOfDate,
    );
    const view = buildLearnerProgressView(input, {
      mode: 'contexts',
      selectedId: 'deleted-group',
      status: 'active',
      kind: 'all',
      period,
    });

    expect(view.evidence.map((item) => item.id)).toEqual(['evidence-observation']);
    expect(view.scopeRows.find((row) => row.id === 'deleted-group')).toMatchObject({
      sourceStatus: 'snapshot',
      evidenceCount: 1,
    });
    expect(view.evidence[0]?.context).toMatchObject({
      status: 'snapshot',
      label: 'Group · Historical vocabulary group',
    });
    expect(view.evidence[0]?.context).not.toHaveProperty('href');
  });

  it('filters the timeline by period, lifecycle, kind, and exact Standard while retaining exact Evidence detail', () => {
    const input = snapshot();
    const period = resolveLearnerProgressPeriod(
      { preset: 'this-week' },
      input.schoolYear,
      input.asOfDate,
    );
    const view = buildLearnerProgressView(input, {
      mode: 'standards',
      selectedId: 'standard-1',
      evidenceId: 'evidence-observation',
      status: 'active',
      kind: 'score',
      period,
    });

    expect(view.evidence.map((item) => item.id)).toEqual(['evidence-score']);
    expect(view.selectedEvidence?.id).toBe('evidence-observation');
    expect(view.selectedEvidence?.standards[0]).toMatchObject({
      entityId: 'deleted-standard',
      status: 'snapshot',
    });
  });
});
