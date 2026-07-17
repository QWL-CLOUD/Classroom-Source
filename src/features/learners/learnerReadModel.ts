import type { LearnerContext, LessonPlan, SessionOccurrence } from '@/domain/models/entities';
import type { LearnersReadSnapshot } from '@/domain/readModels/learnerReadModels';
import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
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

function sessionToPlanningItem(
  session: SessionOccurrence,
  lessonPlanById: ReadonlyMap<string, LessonPlan>,
): LearnerPlanningItem {
  const plan = lessonPlanById.get(session.lessonPlanId);

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

function compareUnscheduled(first: LessonPlan, second: LessonPlan): number {
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
  const scheduledOrCompletedPlanIds = new Set(
    snapshot.sessions
      .filter(
        (session) => session.deliveryState === 'scheduled' || session.deliveryState === 'completed',
      )
      .map((session) => session.lessonPlanId),
  );
  const upcomingItems = snapshot.sessions
    .filter((session) => session.deliveryState === 'scheduled' && session.date >= anchorDate)
    .sort(compareUpcomingSessions)
    .map((session) => sessionToPlanningItem(session, lessonPlanById));
  const completedItems = snapshot.sessions
    .filter((session) => session.deliveryState === 'completed')
    .sort(compareCompletedSessions)
    .map((session) => sessionToPlanningItem(session, lessonPlanById));
  const unscheduledItems = snapshot.lessonPlans
    .filter(
      (plan) => plan.workflowState !== 'archived' && !scheduledOrCompletedPlanIds.has(plan.id),
    )
    .sort(compareUnscheduled)
    .map((plan) => ({
      id: plan.id,
      sourceType: 'lesson-plan' as const,
      title: plan.title,
      subject: plan.subject,
      stateLabel: plan.workflowState === 'ready' ? 'Ready' : 'Draft',
      editHref: planningEditHref(plan.id),
      scheduleHref: planningScheduleHref(plan.id),
    }));

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
