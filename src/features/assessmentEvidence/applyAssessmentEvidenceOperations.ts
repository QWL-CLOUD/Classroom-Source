import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import type { AssessmentEvidenceOperation } from './assessmentEvidenceCommands';

export async function applyAssessmentEvidenceOperations(
  db: ClassroomDatabase,
  operations: readonly AssessmentEvidenceOperation[],
): Promise<void> {
  for (const operation of operations) {
    if (operation.action === 'put') await db.assessmentEvidence.put(operation.record);
    else await db.assessmentEvidence.delete(operation.id);
  }
}
