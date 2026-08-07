import type {
  TeachingInsightsNeedsReviewIssue,
  TeachingInsightsSourceTrace,
} from '@/features/insights/teachingInsightsContract';
import type {
  TeachingInsightsReflectionSessionState,
  TeachingInsightsView,
} from '@/features/insights/teachingInsightsReadModel';

export const TEACHING_REVIEW_CONTRACT_VERSION = 1 as const;

export type TeachingReviewReflectionState = 'missing' | 'archived';

export interface TeachingReviewAwaitingReflectionRow {
  sessionOccurrenceId: string;
  title: string;
  date: string;
  contextName: string;
  reflectionState: TeachingReviewReflectionState;
  sessionSource: TeachingInsightsSourceTrace;
  reflectionHref: string;
}

export interface TeachingReviewPastScheduledRow {
  sessionOccurrenceId: string;
  title: string;
  message: string;
  source: TeachingInsightsSourceTrace;
}

export interface TeachingReviewOpenNextStepsRow {
  reflectionId: string;
  sessionOccurrenceId: string;
  lessonPlanTitle: string;
  contextName: string;
  occurredOn: string;
  reflectionStatus: 'active' | 'archived';
  sessionState: TeachingInsightsReflectionSessionState;
  openNextStepCount: number;
  source: TeachingInsightsSourceTrace;
}

export interface TeachingReviewView {
  contractVersion: 1;
  schoolYear: TeachingInsightsView['schoolYear'];
  awaitingReflection: {
    count: number;
    rows: TeachingReviewAwaitingReflectionRow[];
  };
  pastStillScheduled: {
    count: number;
    rows: TeachingReviewPastScheduledRow[];
  };
  openNextSteps: {
    reflectionCount: number;
    taskCount: number;
    rows: TeachingReviewOpenNextStepsRow[];
  };
  recordIssues: {
    affectedRecordCount: number;
    issueCount: number;
    issues: TeachingInsightsNeedsReviewIssue[];
  };
}

function reflectionHref(sessionOccurrenceId: string): string {
  return `#/planning/session/reflection?session=${encodeURIComponent(sessionOccurrenceId)}`;
}

function compareAwaiting(
  first: TeachingReviewAwaitingReflectionRow,
  second: TeachingReviewAwaitingReflectionRow,
): number {
  return (
    second.date.localeCompare(first.date) ||
    first.contextName.localeCompare(second.contextName, 'en', { sensitivity: 'base' }) ||
    first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
    first.sessionOccurrenceId.localeCompare(second.sessionOccurrenceId)
  );
}

function compareNextSteps(
  first: TeachingReviewOpenNextStepsRow,
  second: TeachingReviewOpenNextStepsRow,
): number {
  return (
    second.occurredOn.localeCompare(first.occurredOn) ||
    first.contextName.localeCompare(second.contextName, 'en', { sensitivity: 'base' }) ||
    first.lessonPlanTitle.localeCompare(second.lessonPlanTitle, 'en', {
      sensitivity: 'base',
    }) ||
    first.reflectionId.localeCompare(second.reflectionId)
  );
}

export function buildTeachingReviewView(insights: TeachingInsightsView): TeachingReviewView {
  const reflectionsBySessionId = new Map(
    insights.reflectionAndNextSteps.reflections.map((reflection) => [
      reflection.sessionOccurrenceId,
      reflection,
    ]),
  );
  const activeReflectionSessionIds = new Set(
    insights.reflectionAndNextSteps.reflections
      .filter((reflection) => reflection.status === 'active')
      .map((reflection) => reflection.sessionOccurrenceId),
  );

  const awaitingRows = insights.teachingActivity.sessions
    .filter((session) => !activeReflectionSessionIds.has(session.id))
    .map((session): TeachingReviewAwaitingReflectionRow => {
      const retainedReflection = reflectionsBySessionId.get(session.id);
      return {
        sessionOccurrenceId: session.id,
        title: session.title,
        date: session.date,
        contextName: session.contextName,
        reflectionState: retainedReflection?.status === 'archived' ? 'archived' : 'missing',
        sessionSource: session.source,
        reflectionHref: reflectionHref(session.id),
      };
    })
    .sort(compareAwaiting);

  const pastStillScheduledRows = insights.needsReview.issues
    .filter((issue) => issue.code === 'past-session-still-scheduled')
    .map((issue): TeachingReviewPastScheduledRow => ({
      sessionOccurrenceId: issue.entityId,
      title: issue.source.label,
      message: issue.message,
      source: issue.source,
    }))
    .sort(
      (first, second) =>
        first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
        first.sessionOccurrenceId.localeCompare(second.sessionOccurrenceId),
    );

  const openNextStepRows = insights.reflectionAndNextSteps.reflections
    .filter((reflection) => reflection.openNextStepCount > 0)
    .map((reflection): TeachingReviewOpenNextStepsRow => ({
      reflectionId: reflection.id,
      sessionOccurrenceId: reflection.sessionOccurrenceId,
      lessonPlanTitle: reflection.lessonPlanTitle,
      contextName: reflection.contextName,
      occurredOn: reflection.occurredOn,
      reflectionStatus: reflection.status,
      sessionState: reflection.sessionState,
      openNextStepCount: reflection.openNextStepCount,
      source: reflection.source,
    }))
    .sort(compareNextSteps);

  const recordIssues = insights.needsReview.issues.filter(
    (issue) => issue.code !== 'past-session-still-scheduled',
  );
  const affectedRecordCount = new Set(
    recordIssues.map((issue) => `${issue.entityType}:${issue.entityId}`),
  ).size;

  return {
    contractVersion: TEACHING_REVIEW_CONTRACT_VERSION,
    schoolYear: insights.schoolYear,
    awaitingReflection: {
      count: awaitingRows.length,
      rows: awaitingRows,
    },
    pastStillScheduled: {
      count: pastStillScheduledRows.length,
      rows: pastStillScheduledRows,
    },
    openNextSteps: {
      reflectionCount: openNextStepRows.length,
      taskCount: openNextStepRows.reduce((total, row) => total + row.openNextStepCount, 0),
      rows: openNextStepRows,
    },
    recordIssues: {
      affectedRecordCount,
      issueCount: recordIssues.length,
      issues: recordIssues,
    },
  };
}
