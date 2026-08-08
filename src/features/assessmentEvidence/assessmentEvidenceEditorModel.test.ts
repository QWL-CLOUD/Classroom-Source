import { describe, expect, it } from 'vitest';

import {
  assessmentEvidenceDraftToValues,
  createAssessmentEvidenceEditorDraft,
} from './assessmentEvidenceEditorModel';

describe('Assessment Evidence editor model', () => {
  const schoolYear = { startsOn: '2026-08-24', endsOn: '2027-06-18' };

  it('prefills a new observation from the selected learner/context/Standard scope', () => {
    expect(
      createAssessmentEvidenceEditorDraft(schoolYear, undefined, {
        studentId: 'student-1',
        contextId: 'context-1',
        sessionOccurrenceId: 'session-1',
        assessmentId: 'assessment-1',
        standardId: 'standard-1',
        occurredOn: '2026-09-01',
      }),
    ).toMatchObject({
      studentId: 'student-1',
      contextId: 'context-1',
      sessionOccurrenceId: 'session-1',
      assessmentId: 'assessment-1',
      standardIds: ['standard-1'],
      occurredOn: '2026-09-01',
      kind: 'observation',
    });
  });

  it('converts score fields without deriving a grade or percentage', () => {
    const draft = createAssessmentEvidenceEditorDraft(schoolYear);
    draft.studentId = 'student-1';
    draft.title = 'Reading check';
    draft.kind = 'score';
    draft.scoreValue = '8';
    draft.scoreMaximum = '10';
    const values = assessmentEvidenceDraftToValues(draft, 'year-1');
    expect(values).toMatchObject({
      kind: 'score',
      score: { value: 8, maximum: 10 },
    });
    expect(values).not.toHaveProperty('grade');
    expect(values).not.toHaveProperty('percentage');
  });
});
