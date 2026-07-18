import type {
  LearnerContext,
  LessonPlan,
  LessonSeries,
  SchoolYear,
  SessionOccurrence,
} from '@/domain/models/entities';

export interface LessonSeriesQuery {
  contextId?: string;
}

export interface LessonPlanQuery {
  contextId?: string;
  workflowStates?: readonly LessonPlan['workflowState'][];
}

export interface SessionOccurrenceQuery {
  contextId?: string;
  deliveryStates?: readonly SessionOccurrence['deliveryState'][];
  startDate?: string;
  endDate?: string;
}

export interface LearnersReadSnapshot {
  activeSchoolYear: SchoolYear | null;
  contexts: LearnerContext[];
  selectedContext: LearnerContext | null;
  lessonSeries: LessonSeries[];
  lessonPlans: LessonPlan[];
  sessions: SessionOccurrence[];
}

export type LearnerPlanningView = 'upcoming' | 'unscheduled' | 'completed';
