import type { LearnersReadSnapshot } from '@/domain/readModels/learnerReadModels';
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';

export async function loadLearnersReadSnapshot(
  repository: ClassroomRepository,
  requestedContextId?: string,
): Promise<LearnersReadSnapshot> {
  const activeSchoolYear = await repository.getActiveSchoolYear();
  const contexts = await repository.listLearnerContexts(
    activeSchoolYear ? { schoolYearId: activeSchoolYear.id } : {},
  );
  const selectedContext =
    contexts.find((context) => context.id === requestedContextId) ?? contexts[0] ?? null;

  if (!selectedContext) {
    return {
      activeSchoolYear,
      contexts,
      selectedContext: null,
      lessonPlans: [],
      sessions: [],
    };
  }

  const [lessonPlans, sessions] = await Promise.all([
    repository.listLessonPlans({ contextId: selectedContext.id }),
    repository.listSessionOccurrences({ contextId: selectedContext.id }),
  ]);

  return {
    activeSchoolYear,
    contexts,
    selectedContext,
    lessonPlans,
    sessions,
  };
}
