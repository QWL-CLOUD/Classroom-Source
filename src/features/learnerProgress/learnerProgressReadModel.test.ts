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
    rosterMemberships: [
      {
        id: 'membership-alice',
        contextId: 'class-a',
        studentId: 'student-alice',
        createdAt: timestamp,
      },
      {
        id: 'membership-ben',
        contextId: 'class-a',
        studentId: 'student-ben',
        createdAt: timestamp,
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
      order: 'newest',
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
      order: 'newest',
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
      order: 'newest',
      period,
    });

    expect(view.evidence.map((item) => item.id)).toEqual(['evidence-score']);
    expect(view.selectedEvidence?.id).toBe('evidence-observation');
    expect(view.selectedEvidence?.standards[0]).toMatchObject({
      entityId: 'deleted-standard',
      status: 'snapshot',
    });
  });

  it('filters by explicit Assessment, Standard, and Session sources and can order history oldest first', () => {
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
      assessmentId: 'assessment-1',
      standardFilterId: 'standard-1',
      sessionId: 'session-1',
      order: 'oldest',
      period,
    });

    expect(view.evidence.map((item) => item.id)).toEqual(['evidence-score']);
    expect(view.assessmentOptions.map((option) => option.id)).toContain('assessment-1');
    expect(view.standardOptions.map((option) => option.id)).toContain('standard-1');
    expect(view.sessionOptions.map((option) => option.id)).toContain('session-1');
  });

  it('reports current retained roster coverage only as a present roster comparison', () => {
    const input = snapshot();
    const period = resolveLearnerProgressPeriod(
      { preset: 'school-year' },
      input.schoolYear,
      input.asOfDate,
    );
    const view = buildLearnerProgressView(input, {
      mode: 'contexts',
      selectedId: 'class-a',
      status: 'active',
      kind: 'all',
      order: 'newest',
      period,
    });

    expect(view.rosterCoverage).toMatchObject({
      status: 'available',
      currentRetainedRosterLearnerCount: 2,
      coveredRosterLearnerCount: 1,
      contextCount: 1,
    });
    expect(view.rosterCoverage?.note).toContain('current retained roster');
    expect(view.rosterCoverage?.note).toContain('historical membership');
    expect(view.rosterCoverage?.note).toContain('not a mastery or gap judgment');
  });

  it('treats Individual as a one-on-one planning context rather than a roster', () => {
    const input = snapshot();
    input.contexts = [
      ...input.contexts,
      {
        id: 'individual-alice',
        kind: 'individual',
        name: 'Alice Individual',
        schoolYearId: 'year-1',
        linkedStudentId: 'student-alice',
        status: 'active',
      },
    ];

    const period = resolveLearnerProgressPeriod(
      { preset: 'school-year' },
      input.schoolYear,
      input.asOfDate,
    );
    const view = buildLearnerProgressView(input, {
      mode: 'contexts',
      selectedId: 'individual-alice',
      status: 'active',
      kind: 'all',
      order: 'newest',
      period,
    });

    expect(view.rosterCoverage).toMatchObject({
      status: 'not-applicable',
      currentRetainedRosterLearnerCount: 0,
      coveredRosterLearnerCount: 0,
    });
    expect(view.rosterCoverage?.note).toContain('not a roster');
  });

  it('does not count Evidence from unrelated or historical Context sources toward all-context roster coverage', () => {
    const input = snapshot();
    input.evidence = [
      ...input.evidence,
      {
        id: 'ben-historical-context-evidence',
        studentId: 'student-ben',
        schoolYearId: 'year-1',
        occurredOn: '2026-08-06',
        title: 'Ben historical context note',
        kind: 'observation',
        observation: { text: 'Recorded against a retained historical Context snapshot.' },
        contextId: 'deleted-group',
        standardIds: [],
        sourceSnapshots: { context: { kind: 'group', name: 'Historical vocabulary group' } },
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    const period = resolveLearnerProgressPeriod(
      { preset: 'school-year' },
      input.schoolYear,
      input.asOfDate,
    );
    const view = buildLearnerProgressView(input, {
      mode: 'contexts',
      status: 'active',
      kind: 'all',
      order: 'newest',
      period,
    });

    expect(view.rosterCoverage).toMatchObject({
      status: 'available',
      currentRetainedRosterLearnerCount: 2,
      coveredRosterLearnerCount: 1,
      contextCount: 1,
    });
  });

  it('does not present a retained-roster denominator for a historical School Year', () => {
    const input = snapshot();
    input.schoolYear = {
      ...input.schoolYear,
      id: 'history-year',
      label: '2024–2025',
      startsOn: '2024-07-01',
      endsOn: '2025-06-30',
      active: false,
      lifecycleState: 'archived',
      archivedAt: timestamp,
    };
    input.contexts = [
      {
        id: 'history-class',
        kind: 'class',
        name: 'Historical Class',
        schoolYearId: 'history-year',
        status: 'archived',
      },
    ];
    input.rosterMemberships = [
      {
        id: 'history-membership',
        contextId: 'history-class',
        studentId: 'student-alice',
        createdAt: timestamp,
      },
    ];
    input.evidence = [
      {
        id: 'history-evidence',
        studentId: 'student-alice',
        schoolYearId: 'history-year',
        occurredOn: '2025-05-15',
        title: 'Historical check',
        kind: 'score',
        score: { value: 2, maximum: 4 },
        contextId: 'history-class',
        standardIds: [],
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    const period = resolveLearnerProgressPeriod(
      { preset: 'school-year' },
      input.schoolYear,
      input.asOfDate,
    );
    const view = buildLearnerProgressView(input, {
      mode: 'contexts',
      selectedId: 'history-class',
      status: 'active',
      kind: 'all',
      order: 'newest',
      period,
    });

    expect(view.schoolYearState).toBe('historical');
    expect(view.rosterCoverage).toMatchObject({
      status: 'unavailable',
      currentRetainedRosterLearnerCount: 0,
      coveredRosterLearnerCount: 0,
    });
    expect(view.rosterCoverage?.note).toContain('does not reconstruct past roster membership');
  });

  it('shows same-scale proficiency history only when the selected record has an explicit scale key', () => {
    const input = snapshot();
    input.evidence = [
      ...input.evidence,
      {
        id: 'alice-proficiency-1',
        studentId: 'student-alice',
        schoolYearId: 'year-1',
        occurredOn: '2026-07-15',
        title: 'Reading continuum July',
        kind: 'proficiency',
        proficiency: {
          label: 'Emerging',
          rank: 1,
          scaleKey: 'reading',
          scaleLabel: 'Reading continuum',
        },
        standardIds: [],
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'alice-proficiency-2',
        studentId: 'student-alice',
        schoolYearId: 'year-1',
        occurredOn: '2026-08-06',
        title: 'Reading continuum August',
        kind: 'proficiency',
        proficiency: {
          label: 'Developing',
          rank: 2,
          scaleKey: 'reading',
          scaleLabel: 'Reading continuum',
        },
        standardIds: [],
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'alice-unkeyed-proficiency',
        studentId: 'student-alice',
        schoolYearId: 'year-1',
        occurredOn: '2026-08-07',
        title: 'Unkeyed proficiency',
        kind: 'proficiency',
        proficiency: { label: 'Teacher label only' },
        standardIds: [],
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    const period = resolveLearnerProgressPeriod(
      { preset: 'school-year' },
      input.schoolYear,
      input.asOfDate,
    );
    const keyed = buildLearnerProgressView(input, {
      mode: 'learners',
      selectedId: 'student-alice',
      evidenceId: 'alice-proficiency-2',
      status: 'all',
      kind: 'all',
      order: 'newest',
      period,
    });
    expect(keyed.proficiencyHistory?.entries.map((entry) => entry.id)).toEqual([
      'alice-proficiency-1',
      'alice-proficiency-2',
    ]);

    const unkeyed = buildLearnerProgressView(input, {
      mode: 'learners',
      selectedId: 'student-alice',
      evidenceId: 'alice-unkeyed-proficiency',
      status: 'all',
      kind: 'all',
      order: 'newest',
      period,
    });
    expect(unkeyed.proficiencyHistory).toBeUndefined();
  });
});
