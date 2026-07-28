import { z } from 'zod';

import {
  assessmentEvidenceRecordSchema,
  type AssessmentEvidenceRecord,
} from '@/domain/models/entities';

export const ASSESSMENT_EVIDENCE_COMMAND_PREFIX = 'assessment-evidence.';

const putAssessmentEvidenceOperationSchema = z.object({
  table: z.literal('assessmentEvidence'),
  action: z.literal('put'),
  record: assessmentEvidenceRecordSchema,
});

const deleteAssessmentEvidenceOperationSchema = z.object({
  table: z.literal('assessmentEvidence'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const assessmentEvidenceOperationSchema = z.union([
  putAssessmentEvidenceOperationSchema,
  deleteAssessmentEvidenceOperationSchema,
]);

export const assessmentEvidenceCommandSchema = z.object({
  operations: z.array(assessmentEvidenceOperationSchema).min(1),
});

export type AssessmentEvidenceOperation = z.infer<typeof assessmentEvidenceOperationSchema>;
export type AssessmentEvidenceCommand = z.infer<typeof assessmentEvidenceCommandSchema>;

export interface AssessmentEvidenceCommandPair {
  forward: AssessmentEvidenceCommand;
  inverse: AssessmentEvidenceCommand;
}

export function putAssessmentEvidenceOperation(
  record: AssessmentEvidenceRecord,
): AssessmentEvidenceOperation {
  return assessmentEvidenceOperationSchema.parse({
    table: 'assessmentEvidence',
    action: 'put',
    record,
  });
}

export function deleteAssessmentEvidenceOperation(id: string): AssessmentEvidenceOperation {
  return assessmentEvidenceOperationSchema.parse({
    table: 'assessmentEvidence',
    action: 'delete',
    id,
  });
}

export function createAssessmentEvidenceCommand(
  operations: readonly AssessmentEvidenceOperation[],
): AssessmentEvidenceCommand {
  return assessmentEvidenceCommandSchema.parse({ operations });
}

export function serializeAssessmentEvidenceCommand(command: AssessmentEvidenceCommand): string {
  return JSON.stringify(assessmentEvidenceCommandSchema.parse(command));
}

export function parseAssessmentEvidenceCommand(json: string): AssessmentEvidenceCommand {
  return assessmentEvidenceCommandSchema.parse(JSON.parse(json) as unknown);
}
