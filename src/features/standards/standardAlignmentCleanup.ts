import type { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  standardAlignmentSchema,
  type StandardAlignment,
  type StandardAlignmentTargetType,
} from '@/domain/models/entities';

export async function listStandardAlignmentsForTarget(
  db: ClassroomDatabase,
  targetType: StandardAlignmentTargetType,
  targetId: string,
): Promise<StandardAlignment[]> {
  return (
    await db.standardAlignments
      .where('[targetType+targetId]')
      .equals([targetType, targetId])
      .toArray()
  ).map((value) => standardAlignmentSchema.parse(value));
}

export async function listOrphanedStepAlignments(
  db: ClassroomDatabase,
  targetType: StandardAlignmentTargetType,
  targetId: string,
  validStepIds: ReadonlySet<string>,
): Promise<StandardAlignment[]> {
  return (await listStandardAlignmentsForTarget(db, targetType, targetId)).filter(
    (alignment) =>
      Boolean(alignment.lessonFlowStepId) && !validStepIds.has(alignment.lessonFlowStepId!),
  );
}
