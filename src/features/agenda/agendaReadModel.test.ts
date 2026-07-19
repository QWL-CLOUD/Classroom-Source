import { describe, expect, it } from 'vitest';

import type {
  CalendarEvent,
  LearnerContext,
  LearnerNotice,
  Reminder,
  Task,
} from '@/domain/models/entities';

import { buildAgendaReadModel, isPersonalCalendarEvent } from './agendaReadModel';

const now = '2026-07-18T12:00:00.000Z';

function task(values: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    status: 'active',
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...values,
    id: values.id,
    title: values.title,
  };
}

function event(
  values: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'title'>,
): CalendarEvent {
  return {
    startDate: '2026-07-20',
    category: 'Personal',
    ...values,
    id: values.id,
    title: values.title,
  };
}

function notice(
  values: Partial<LearnerNotice> & Pick<LearnerNotice, 'id' | 'title'>,
): LearnerNotice {
  return {
    contextId: 'context-1',
    kind: 'ongoing-support',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...values,
    id: values.id,
    title: values.title,
  };
}

function reminder(values: Partial<Reminder> & Pick<Reminder, 'id' | 'sourceId'>): Reminder {
  return {
    sourceType: 'task',
    remindDate: '2026-07-20',
    remindMinute: 480,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...values,
    id: values.id,
    sourceId: values.sourceId,
  };
}

const context: LearnerContext = {
  id: 'context-1',
  kind: 'individual',
  name: 'Agenda Learner',
  schoolYearId: 'year-1',
  status: 'active',
};

function build(values: {
  tasks?: Task[];
  reminders?: Reminder[];
  events?: CalendarEvent[];
  notices?: LearnerNotice[];
}) {
  return buildAgendaReadModel(
    {
      tasks: values.tasks ?? [],
      reminders: values.reminders ?? [],
      calendarEvents: values.events ?? [],
      learnerNotices: values.notices ?? [],
      learnerContexts: [context],
      sessions: [],
      lessonPlans: [],
    },
    '2026-07-20',
  );
}

function section(model: ReturnType<typeof build>, id: string) {
  return model.sections.find((value) => value.id === id)!.items;
}

describe('Personal Agenda read model', () => {
  it('shows a scheduled-and-due task once in Today', () => {
    const model = build({
      tasks: [
        task({
          id: 'today-task',
          title: 'One shared task',
          scheduledDate: '2026-07-20',
          scheduledMinute: 540,
          dueDate: '2026-07-20',
          dueMinute: 1020,
        }),
      ],
    });

    expect(section(model, 'today').map((item) => item.title)).toEqual(['One shared task']);
    expect(model.summary.today).toBe(1);
    expect(model.summary.total).toBe(1);
  });

  it('uses the deadline to classify overdue work', () => {
    const model = build({
      tasks: [
        task({
          id: 'overdue-task',
          title: 'Past deadline',
          scheduledDate: '2026-07-25',
          dueDate: '2026-07-19',
        }),
      ],
    });

    expect(section(model, 'overdue')[0]?.title).toBe('Past deadline');
    expect(section(model, 'upcoming')).toHaveLength(0);
  });

  it('keeps Waiting and unscheduled learner follow-up Tasks in separate sections', () => {
    const model = build({
      notices: [notice({ id: 'notice-1', title: 'Reading follow-up' })],
      tasks: [
        task({ id: 'waiting-task', title: 'Await family reply', status: 'waiting' }),
        task({
          id: 'follow-up',
          title: 'Follow up: Reading',
          linkedEntityType: 'learner-notice',
          linkedEntityId: 'notice-1',
        }),
      ],
    });

    expect(section(model, 'waiting').map((item) => item.title)).toEqual(['Await family reply']);
    expect(section(model, 'unscheduled-follow-up').map((item) => item.title)).toEqual([
      'Follow up: Reading',
    ]);
    expect(section(model, 'unscheduled-follow-up')[0]?.detailLabel).toContain('Reading follow-up');
  });

  it('includes only personal calendar events and keeps a spanning event in Today', () => {
    const personal = event({
      id: 'personal',
      title: 'Home appointment',
      startDate: '2026-07-19',
      endDate: '2026-07-21',
      category: 'Private',
    });
    const school = event({ id: 'school', title: 'Staff meeting', category: 'Meeting' });
    const model = build({ events: [school, personal] });

    expect(isPersonalCalendarEvent(personal)).toBe(true);
    expect(isPersonalCalendarEvent(school)).toBe(false);
    expect(section(model, 'today').map((item) => item.title)).toEqual(['Home appointment']);
  });

  it('places active learner support today and date-specific notices by date', () => {
    const model = build({
      notices: [
        notice({ id: 'ongoing', title: 'Ongoing support' }),
        notice({
          id: 'past',
          title: 'Past notice',
          kind: 'date-specific-notice',
          noticeDate: '2026-07-19',
        }),
        notice({
          id: 'future',
          title: 'Future notice',
          kind: 'date-specific-notice',
          noticeDate: '2026-07-22',
        }),
        notice({ id: 'resolved', title: 'Resolved notice', status: 'resolved' }),
      ],
    });

    expect(section(model, 'today').map((item) => item.title)).toEqual(['Ongoing support']);
    expect(section(model, 'overdue').map((item) => item.title)).toEqual(['Past notice']);
    expect(section(model, 'upcoming').map((item) => item.title)).toEqual(['Future notice']);
    expect(model.summary.total).toBe(3);
  });

  it('aggregates only active reminders while preserving their source title', () => {
    const source = task({ id: 'source-task', title: 'Reminder source' });
    const model = build({
      tasks: [source],
      reminders: [
        reminder({ id: 'active-reminder', sourceId: source.id, note: 'Check now' }),
        reminder({
          id: 'dismissed-reminder',
          sourceId: source.id,
          status: 'dismissed',
        }),
      ],
    });

    const reminders = section(model, 'today').filter((item) => item.sourceType === 'reminder');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ title: 'Reminder source', detailLabel: 'Check now' });
  });

  it('sorts Today items by time before source label and title', () => {
    const model = build({
      tasks: [
        task({
          id: 'later',
          title: 'Later task',
          scheduledDate: '2026-07-20',
          scheduledMinute: 600,
        }),
        task({
          id: 'earlier',
          title: 'Earlier task',
          scheduledDate: '2026-07-20',
          scheduledMinute: 480,
        }),
      ],
    });

    expect(section(model, 'today').map((item) => item.title)).toEqual([
      'Earlier task',
      'Later task',
    ]);
  });

  it('reports a stable summary across all five Agenda sections', () => {
    const model = build({
      notices: [notice({ id: 'notice', title: 'Notice source' })],
      tasks: [
        task({ id: 'overdue', title: 'Overdue', dueDate: '2026-07-19' }),
        task({ id: 'today', title: 'Today', scheduledDate: '2026-07-20' }),
        task({ id: 'upcoming', title: 'Upcoming', dueDate: '2026-07-21' }),
        task({ id: 'waiting', title: 'Waiting', status: 'waiting' }),
        task({
          id: 'follow-up',
          title: 'Follow-up',
          linkedEntityType: 'learner-notice',
          linkedEntityId: 'notice',
        }),
      ],
    });

    expect(model.summary).toEqual({
      overdue: 1,
      today: 2,
      upcoming: 1,
      waiting: 1,
      unscheduledFollowUp: 1,
      total: 6,
    });
  });
});
