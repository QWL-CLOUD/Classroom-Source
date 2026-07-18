import type {
  LearnerContext,
  LessonPlan,
  LessonSeries,
  SessionOccurrence,
} from '@/domain/models/entities';
import type { LearnersReadSnapshot } from '@/domain/readModels/learnerReadModels';
import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
import {
  lessonFlowDurationMinutes,
  resolveSessionLessonContent,
} from '@/features/planning/planningEditorModel';
import { buildWeekHref } from '@/features/week/weekNavigation';
import { formatLongDate } from '@/shared/dates/localDate';

export interface LearnerContextGroup {
  kind: LearnerContext['kind'];
  label: string;
  contexts: LearnerContext[];
}

export type LearnerPlanningItemSource = 'lesson-plan' | 'session';

export interface LearnerPlanningItem {
  id: string;
  sourceType: LearnerPlanningItemSource;
  title: string;
  subject: string;
  stateLabel: string;
  date?: string;
  dateLabel?: string;
  timeLabel?: string;
  weekHref?: string;
  editHref?: string;
  scheduleHref?: string;
  sessionHref?: string;
  calendarHref?: string;
  contentSummary?: string;
  contentSourceLabel?: string;
  seriesTitle?: string;
  seriesPositionLabel?: string;
}

export interface LearnersPageReadModel {
  contextGroups: LearnerContextGroup[];
  selectedContext: LearnerContext | null;
  activeSchoolYearLabel: string;
  upcomingItems: LearnerPlanningItem[];
  unscheduledItems: LearnerPlanningItem[];
  completedItems: LearnerPlanningItem[];
  contextCounts: Record<LearnerContext['kind'], number>;
}

const contextKindLabels: Record<LearnerContext['kind'], string> = {
  class: 'Classes',
  group: 'Groups',
  individual: 'Individuals',
};

const workflowOrder: Record<LessonPlan['workflowState'], number> = {
  ready: 0,
  draft: 1,
  archived: 2,
};

export function getLearnerKindLabel(kind: LearnerContext['kind']): string {
  return kind === 'class' ? 'Class' : kind === 'group' ? 'Group' : 'Individual';
}

function compareText(first: string, second: string): number {
  return first.localeCompare(second, 'en', { sensitivity: 'base' }) || first.localeCompare(second);
}

function formatSessionTime(session: SessionOccurrence): string {
  return `${formatCalendarMinute(session.startMinute)}–${formatCalendarMinute(session.endMinute)}`;
}

function planningEditHref(planId: string): string {
  return `#/planning/edit?plan=${encodeURIComponent(planId)}`;
}

function planningScheduleHref(planId: string): string {
  return `#/planning/session?plan=${encodeURIComponent(planId)}`;
}

function sessionEditHref(sessionId: string): string {
  return `#/planning/session?session=${encodeURIComponent(sessionId)}`;
}

function contentSummary(stepCount: number, durationMinutes: number): string | undefined {
  if (stepCount === 0) return undefined;
  return `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}${
    durationMinutes > 0 ? ` · ${durationMinutes} min` : ''
  }`;
}

interface LessonSeriesMetadata {
  title: string;
  positionLabel: string;
}

function buildLessonSeriesMetadata(
  lessonSeries: readonly LessonSeries[],
  lessonPlans: readonly LessonPlan[],
): ReadonlyMap<string, LessonSeriesMetadata> {
  const seriesById = new Map(lessonSeries.map((series) => [series.id, series] as const));
  const plansBySeries = new Map<string, LessonPlan[]>();
  for (const plan of lessonPlans) {
    if (!plan.seriesId || plan.workflowState === 'archived' || !seriesById.has(plan.seriesId))
      continue;
    const plans = plansBySeries.get(plan.seriesId) ?? [];
    plans.push(plan);
    plansBySeries.set(plan.seriesId, plans);
  }

  const metadata = new Map<string, LessonSeriesMetadata>();
  for (const [seriesId, plans] of plansBySeries) {
    const series = seriesById.get(seriesId);
    if (!series) continue;
    plans.sort(
      (first, second) =>
        (first.sequence ?? Number.MAX_SAFE_INTEGER) -
          (second.sequence ?? Number.MAX_SAFE_INTEGER) ||
        first.createdAt.localeCompare(second.createdAt) ||
        first.id.localeCompare(second.id),
    );
    plans.forEach((plan, index) => {
      metadata.set(plan.id, {
        title: series.title,
        positionLabel: `Lesson ${index + 1} of ${plans.length}`,
      });
    });
  }
  return metadata;
}

function sessionToPlanningItem(
  session: SessionOccurrence,
  lessonPlanById: ReadonlyMap<string, LessonPlan>,
  seriesMetadataByPlanId: ReadonlyMap<string, LessonSeriesMetadata>,
): LearnerPlanningItem {
  const plan = lessonPlanById.get(session.lessonPlanId);
  const resolvedContent = plan ? resolveSessionLessonContent(plan, session) : null;
  const seriesMetadata = plan ? seriesMetadataByPlanId.get(plan.id) : undefined;

  return {
    id: session.id,
    sourceType: 'session',
    title: plan?.title ?? 'Plan unavailable',
    subject: plan?.subject ?? '',
    stateLabel: session.deliveryState === 'completed' ? 'Completed' : 'Scheduled',
    date: session.date,
    dateLabel: formatLongDate(session.date),
    timeLabel: formatSessionTime(session),
    weekHref: buildWeekHref({
      date: session.date,
      view: 'everything',
      focus: `session-occurrence:${session.id}`,
    }),
    editHref: plan ? planningEditHref(plan.id) : undefined,
    sessionHref: sessionEditHref(session.id),
    calendarHref: `#/calendar?date=${session.date}`,
    contentSummary: resolvedContent
      ? contentSummary(
          resolvedContent.content.lessonFlow.length,
          lessonFlowDurationMinutes(resolvedContent.content.lessonFlow),
        )
      : undefined,
    contentSourceLabel: resolvedContent?.source === 'session' ? 'Customized session' : undefined,
    seriesTitle: seriesMetadata?.title,
    seriesPositionLabel: seriesMetadata?.positionLabel,
  };
}

function compareUpcomingSessions(first: SessionOccurrence, second: SessionOccurrence): number {
  return (
    first.date.localeCompare(second.date) ||
    first.startMinute - second.startMinute ||
    first.endMinute - second.endMinute ||
    first.id.localeCompare(second.id)
  );
}

function compareCompletedSessions(first: SessionOccurrence, second: SessionOccurrence): number {
  return (
    second.date.localeCompare(first.date) ||
    second.startMinute - first.startMinute ||
    second.endMinute - first.endMinute ||
    first.id.localeCompare(second.id)
  );
}

function compareUnscheduled(
  first: LessonPlan,
  second: LessonPlan,
  seriesById: ReadonlyMap<string, LessonSeries>,
): number {
  if (first.seriesId && first.seriesId === second.seriesId) {
    return (
      (first.sequence ?? Number.MAX_SAFE_INTEGER) - (second.sequence ?? Number.MAX_SAFE_INTEGER) ||
      first.createdAt.localeCompare(second.createdAt) ||
      first.id.localeCompare(second.id)
    );
  }
  const firstSeries = first.seriesId ? seriesById.get(first.seriesId) : undefined;
  const secondSeries = second.seriesId ? seriesById.get(second.seriesId) : undefined;
  if (firstSeries || secondSeries) {
    if (!firstSeries) return 1;
    if (!secondSeries) return -1;
    const seriesOrder = compareText(firstSeries.title, secondSeries.title);
    if (seriesOrder) return seriesOrder;
  }
  return (
    workflowOrder[first.workflowState] - workflowOrder[second.workflowState] ||
    second.updatedAt.localeCompare(first.updatedAt) ||
    compareText(first.title, second.title) ||
    first.id.localeCompare(second.id)
  );
}

export function buildLearnersPageReadModel(
  snapshot: LearnersReadSnapshot,
  anchorDate: string,
): LearnersPageReadModel {
  const contextGroups = (['class', 'group', 'individual'] as const).map((kind) => ({
    kind,
    label: contextKindLabels[kind],
    contexts: snapshot.contexts.filter((context) => context.kind === kind),
  }));
  const contextCounts = {
    class: snapshot.contexts.filter((context) => context.kind === 'class').length,
    group: snapshot.contexts.filter((context) => context.kind === 'group').length,
    individual: snapshot.contexts.filter((context) => context.kind === 'individual').length,
  };
  const lessonPlanById = new Map(snapshot.lessonPlans.map((plan) => [plan.id, plan] as const));
  const seriesById = new Map(snapshot.lessonSeries.map((series) => [series.id, series] as const));
  const seriesMetadataByPlanId = buildLessonSeriesMetadata(
    snapshot.lessonSeries,
    snapshot.lessonPlans,
  );
  const scheduledOrCompletedPlanIds = new Set(
    snapshot.sessions
      .filter(
        (session) => session.deliveryState === 'scheduled' || session.deliveryState === 'completed',
      )
      .map((session) => session.lessonPlanId),
  );
  const scheduledSessions = snapshot.sessions.filter(
    (session) => session.deliveryState === 'scheduled',
  );
  const visibleSeriesIds = new Set(
    scheduledSessions
      .filter((session) => session.date >= anchorDate)
      .map((session) => lessonPlanById.get(session.lessonPlanId)?.seriesId)
      .filter((seriesId): seriesId is string => Boolean(seriesId)),
  );
  const upcomingItems = scheduledSessions
    .filter((session) => {
      if (session.date >= anchorDate) return true;
      const seriesId = lessonPlanById.get(session.lessonPlanId)?.seriesId;
      return Boolean(seriesId && visibleSeriesIds.has(seriesId));
    })
    .sort(compareUpcomingSessions)
    .map((session) => sessionToPlanningItem(session, lessonPlanById, seriesMetadataByPlanId));
  const completedItems = snapshot.sessions
    .filter((session) => session.deliveryState === 'completed')
    .sort(compareCompletedSessions)
    .map((session) => sessionToPlanningItem(session, lessonPlanById, seriesMetadataByPlanId));
  const unscheduledItems = snapshot.lessonPlans
    .filter(
      (plan) => plan.workflowState !== 'archived' && !scheduledOrCompletedPlanIds.has(plan.id),
    )
    .sort((first, second) => compareUnscheduled(first, second, seriesById))
    .map((plan) => {
      const seriesMetadata = seriesMetadataByPlanId.get(plan.id);
      return {
        id: plan.id,
        sourceType: 'lesson-plan' as const,
        title: plan.title,
        subject: plan.subject,
        stateLabel: plan.workflowState === 'ready' ? 'Ready' : 'Draft',
        editHref: planningEditHref(plan.id),
        scheduleHref: planningScheduleHref(plan.id),
        contentSummary: contentSummary(
          plan.lessonFlow?.length ?? 0,
          lessonFlowDurationMinutes(plan.lessonFlow ?? []),
        ),
        seriesTitle: seriesMetadata?.title,
        seriesPositionLabel: seriesMetadata?.positionLabel,
      };
    });

  return {
    contextGroups,
    selectedContext: snapshot.selectedContext,
    activeSchoolYearLabel: snapshot.activeSchoolYear?.label ?? 'No active school year',
    upcomingItems,
    unscheduledItems,
    completedItems,
    contextCounts,
  };
}
