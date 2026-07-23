import { describe, expect, it } from 'vitest';

import type { LearnerNotice, LearnerServiceOccurrence } from '@/domain/models/entities';

import {
  formatLearnerServiceRecurrence,
  learnerServiceOccurrenceIsClosed,
  learnerServiceOccursOnDate,
  localDateWeekday,
} from './learnerServiceRecurrence';

const service: LearnerNotice = {
  id: 'service-1',
  contextId: 'learner-1',
  kind: 'learner-service',
  title: 'Speech support',
  status: 'active',
  serviceRecurrence: {
    frequency: 'weekly',
    weekdays: [2],
    startsOn: '2026-08-18',
    endsOn: '2026-12-15',
    startMinute: 600,
    endMinute: 630,
  },
  createdAt: '2026-07-23T12:00:00.000Z',
  updatedAt: '2026-07-23T12:00:00.000Z',
};

describe('learner service recurrence', () => {
  it('maps local dates to Monday-through-Sunday numbers', () => {
    expect(localDateWeekday('2026-07-20')).toBe(1);
    expect(localDateWeekday('2026-07-21')).toBe(2);
    expect(localDateWeekday('2026-07-26')).toBe(7);
  });

  it('matches only configured weekdays inside the inclusive date range', () => {
    expect(learnerServiceOccursOnDate(service, '2026-08-18')).toBe(true);
    expect(learnerServiceOccursOnDate(service, '2026-08-19')).toBe(false);
    expect(learnerServiceOccursOnDate(service, '2026-12-15')).toBe(true);
    expect(learnerServiceOccursOnDate(service, '2026-12-22')).toBe(false);
  });

  it('keeps legacy learner services without recurrence out of recurrence matching', () => {
    expect(
      learnerServiceOccursOnDate(
        { kind: 'learner-service', serviceRecurrence: undefined },
        '2026-08-18',
      ),
    ).toBe(false);
  });

  it('recognizes persisted completed or cancelled occurrences', () => {
    const occurrences: LearnerServiceOccurrence[] = [
      {
        id: 'service-1:2026-08-18',
        learnerNoticeId: 'service-1',
        date: '2026-08-18',
        status: 'completed',
        createdAt: '2026-08-18T14:00:00.000Z',
        updatedAt: '2026-08-18T14:00:00.000Z',
        completedAt: '2026-08-18T14:00:00.000Z',
      },
    ];
    expect(learnerServiceOccurrenceIsClosed(occurrences, 'service-1', '2026-08-18')).toBe(true);
    expect(learnerServiceOccurrenceIsClosed(occurrences, 'service-1', '2026-08-25')).toBe(false);
  });

  it('formats the weekly service for the learner record', () => {
    expect(formatLearnerServiceRecurrence(service.serviceRecurrence!)).toBe(
      'Every Tuesday · 10:00 AM–10:30 AM · Aug 18–Dec 15',
    );
  });
});
