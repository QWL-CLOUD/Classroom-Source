import { z } from 'zod';

import type {
  LessonPlan,
  LessonSeries,
  ScheduleBlock,
  ScheduleException,
  SessionOccurrence,
} from '@/domain/models/entities';
import { resolveScheduleOccurrence } from '@/features/scheduleExceptions/scheduleOccurrenceResolver';
import { shiftDays } from '@/shared/dates/localDate';

const MAX_OCCURRENCE_SEARCH_DAYS = 730;

export const seriesBumpRequestSchema = z.object({
  sessionId: z.string().min(1),
  expectedPreviewToken: z.string().min(1).optional(),
});

export interface SeriesBumpPreviewItem {
  sessionId: string;
  lessonPlanId: string;
  planTitle: string;
  seriesPosition: number;
  fromDate: string;
  toDate: string;
  fromStartMinute: number;
  fromEndMinute: number;
  toStartMinute: number;
  toEndMinute: number;
  adjustedOccurrence: boolean;
}

export interface SeriesBumpPreview {
  selectedSessionId: string;
  selectedPlanTitle: string;
  contextId: string;
  seriesId: string;
  seriesTitle: string;
  scheduleBlockId: string;
  scheduleBlockTitle: string;
  items: SeriesBumpPreviewItem[];
  blockingIssues: string[];
  canCommit: boolean;
  previewToken: string;
}

export interface SeriesBumpPlannerInput {
  selectedSession: SessionOccurrence;
  selectedPlan: LessonPlan;
  series: LessonSeries;
  seriesPlans: readonly LessonPlan[];
  sessions: readonly SessionOccurrence[];
  scheduleBlock: ScheduleBlock;
  scheduleExceptions: readonly ScheduleException[];
}

function compareSeriesPlans(first: LessonPlan, second: LessonPlan): number {
  return (
    (first.sequence ?? Number.MAX_SAFE_INTEGER) - (second.sequence ?? Number.MAX_SAFE_INTEGER) ||
    first.createdAt.localeCompare(second.createdAt) ||
    first.id.localeCompare(second.id)
  );
}

function nextValidOccurrence(
  block: ScheduleBlock,
  afterDate: string,
  exceptions: readonly ScheduleException[],
): { date: string; startMinute: number; endMinute: number; adjusted: boolean } | null {
  for (let offset = 1; offset <= MAX_OCCURRENCE_SEARCH_DAYS; offset += 1) {
    const date = shiftDays(afterDate, offset);
    const occurrence = resolveScheduleOccurrence(block, date, exceptions);
    if (!occurrence) continue;
    return {
      date,
      startMinute: occurrence.block.startMinute,
      endMinute: occurrence.block.endMinute,
      adjusted: occurrence.adjusted,
    };
  }
  return null;
}

function previewToken(items: readonly SeriesBumpPreviewItem[]): string {
  return JSON.stringify(
    items.map((item) => [
      item.sessionId,
      item.fromDate,
      item.fromStartMinute,
      item.fromEndMinute,
      item.toDate,
      item.toStartMinute,
      item.toEndMinute,
    ]),
  );
}

export function buildSeriesBumpPreview(input: SeriesBumpPlannerInput): SeriesBumpPreview {
  const {
    selectedSession,
    selectedPlan,
    series,
    seriesPlans,
    sessions,
    scheduleBlock,
    scheduleExceptions,
  } = input;
  const blockingIssues: string[] = [];

  if (selectedSession.deliveryState !== 'scheduled') {
    blockingIssues.push('Only a scheduled session can start a bump.');
  }
  if (!selectedPlan.seriesId || selectedPlan.seriesId !== series.id) {
    blockingIssues.push('The selected lesson is not assigned to this lesson series.');
  }
  if (series.contextId !== selectedPlan.contextId) {
    blockingIssues.push('The lesson series belongs to another learner context.');
  }
  if (selectedSession.contextId !== selectedPlan.contextId) {
    blockingIssues.push('The selected session belongs to another learner context.');
  }
  if (!selectedSession.scheduleBlockId || selectedSession.scheduleBlockId !== scheduleBlock.id) {
    blockingIssues.push('The selected session is not attached to this Schedule Block.');
  }
  if (!scheduleBlock.bumpEnabled) {
    blockingIssues.push('Bump is not enabled for this Schedule Block.');
  }
  if (scheduleBlock.contextId && scheduleBlock.contextId !== selectedPlan.contextId) {
    blockingIssues.push('The Schedule Block belongs to another learner context.');
  }

  const orderedPlans = seriesPlans
    .filter(
      (plan) =>
        plan.seriesId === series.id &&
        plan.contextId === selectedPlan.contextId &&
        plan.workflowState !== 'archived',
    )
    .sort(compareSeriesPlans);
  const selectedIndex = orderedPlans.findIndex((plan) => plan.id === selectedPlan.id);
  if (selectedIndex < 0) blockingIssues.push('The selected lesson is not in the ordered series.');

  const sessionsByPlan = new Map<string, SessionOccurrence[]>();
  for (const session of sessions) {
    const entries = sessionsByPlan.get(session.lessonPlanId) ?? [];
    entries.push(session);
    sessionsByPlan.set(session.lessonPlanId, entries);
  }

  const affectedSessions: Array<{
    plan: LessonPlan;
    session: SessionOccurrence;
    position: number;
  }> = [];
  if (selectedIndex >= 0) {
    orderedPlans.slice(selectedIndex).forEach((plan, relativeIndex) => {
      const active = (sessionsByPlan.get(plan.id) ?? []).filter(
        (session) => session.deliveryState === 'scheduled' || session.deliveryState === 'completed',
      );
      if (active.length > 1) {
        blockingIssues.push(`“${plan.title}” has more than one active session.`);
        return;
      }
      const session = active[0];
      if (!session) return;
      if (session.deliveryState !== 'scheduled') {
        blockingIssues.push(`“${plan.title}” is completed and cannot be bumped.`);
        return;
      }
      if (session.contextId !== selectedPlan.contextId) {
        blockingIssues.push(`“${plan.title}” belongs to another learner context.`);
        return;
      }
      if (session.scheduleBlockId !== scheduleBlock.id) {
        blockingIssues.push(`“${plan.title}” uses another Schedule Block.`);
        return;
      }
      affectedSessions.push({ plan, session, position: selectedIndex + relativeIndex + 1 });
    });
  }

  if (!affectedSessions.some(({ session }) => session.id === selectedSession.id)) {
    blockingIssues.push('The selected session is not part of the bumpable series range.');
  }

  const items: SeriesBumpPreviewItem[] = [];
  for (const affected of affectedSessions) {
    try {
      const next = nextValidOccurrence(scheduleBlock, affected.session.date, scheduleExceptions);
      if (!next) {
        blockingIssues.push(
          `No later occurrence is available for “${affected.plan.title}” within the supported range.`,
        );
        continue;
      }
      items.push({
        sessionId: affected.session.id,
        lessonPlanId: affected.plan.id,
        planTitle: affected.plan.title,
        seriesPosition: affected.position,
        fromDate: affected.session.date,
        toDate: next.date,
        fromStartMinute: affected.session.startMinute,
        fromEndMinute: affected.session.endMinute,
        toStartMinute: next.startMinute,
        toEndMinute: next.endMinute,
        adjustedOccurrence: next.adjusted,
      });
    } catch (cause) {
      blockingIssues.push(
        cause instanceof Error ? cause.message : 'A schedule occurrence is invalid.',
      );
    }
  }

  for (let index = 1; index < items.length; index += 1) {
    if (items[index]!.toDate <= items[index - 1]!.toDate) {
      blockingIssues.push('The proposed dates would not preserve lesson-series order.');
      break;
    }
  }

  const affectedIds = new Set(items.map((item) => item.sessionId));
  const targetDates = new Map<string, SeriesBumpPreviewItem>();
  for (const item of items) {
    const existingTarget = targetDates.get(item.toDate);
    if (existingTarget) {
      blockingIssues.push(
        `“${existingTarget.planTitle}” and “${item.planTitle}” would share ${item.toDate}.`,
      );
    } else {
      targetDates.set(item.toDate, item);
    }

    const collision = sessions.find(
      (session) =>
        !affectedIds.has(session.id) &&
        (session.deliveryState === 'scheduled' || session.deliveryState === 'completed') &&
        session.contextId === selectedPlan.contextId &&
        session.scheduleBlockId === scheduleBlock.id &&
        session.date === item.toDate,
    );
    if (collision) {
      blockingIssues.push(
        `${item.toDate} is already occupied by another session in ${scheduleBlock.title}.`,
      );
    }
  }

  const uniqueIssues = [...new Set(blockingIssues)];
  const token = previewToken(items);
  return {
    selectedSessionId: selectedSession.id,
    selectedPlanTitle: selectedPlan.title,
    contextId: selectedPlan.contextId,
    seriesId: series.id,
    seriesTitle: series.title,
    scheduleBlockId: scheduleBlock.id,
    scheduleBlockTitle: scheduleBlock.title,
    items,
    blockingIssues: uniqueIssues,
    canCommit: items.length > 0 && uniqueIssues.length === 0,
    previewToken: token,
  };
}
