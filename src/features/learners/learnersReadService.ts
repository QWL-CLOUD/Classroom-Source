import type { LearnerContext } from '@/domain/models/entities';
import type { LearnersReadSnapshot } from '@/domain/readModels/learnerReadModels';
import type { ClassroomRepository } from '@/domain/repositories/ClassroomRepository';

export async function loadLearnersReadSnapshot(
  repository: ClassroomRepository,
  requestedContextId?: string,
  preferredStatus: LearnerContext['status'] = 'active',
): Promise<LearnersReadSnapshot> {
  const activeSchoolYear = await repository.getActiveSchoolYear();
  const schoolYearQuery = activeSchoolYear ? { schoolYearId: activeSchoolYear.id } : {};
  const [activeContexts, archivedContexts] = await Promise.all([
    repository.listLearnerContexts({ ...schoolYearQuery, status: 'active' }),
    repository.listLearnerContexts({ ...schoolYearQuery, status: 'archived' }),
  ]);
  const contexts = [...activeContexts, ...archivedContexts];
  const preferredContexts = preferredStatus === 'active' ? activeContexts : archivedContexts;
  const fallbackContexts = preferredStatus === 'active' ? archivedContexts : activeContexts;
  const selectedContext =
    contexts.find((context) => context.id === requestedContextId) ??
    preferredContexts[0] ??
    fallbackContexts[0] ??
    null;

  if (!selectedContext) {
    return {
      activeSchoolYear,
      contexts,
      selectedContext: null,
      lessonSeries: [],
      lessonPlans: [],
      sessions: [],
    };
  }

  const [lessonSeries, lessonPlans, sessions] = await Promise.all([
    repository.listLessonSeries({ contextId: selectedContext.id }),
    repository.listLessonPlans({ contextId: selectedContext.id }),
    repository.listSessionOccurrences({ contextId: selectedContext.id }),
  ]);

  return {
    activeSchoolYear,
    contexts,
    selectedContext,
    lessonSeries,
    lessonPlans,
    sessions,
  };
}
