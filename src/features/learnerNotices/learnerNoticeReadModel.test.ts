import { describe, expect, it } from 'vitest';

import type { LearnerNotice, LearnerServiceOccurrence } from '@/domain/models/entities';

import { selectLearnerNoticeView, selectTodayLearnerNotices } from './learnerNoticeReadModel';

function notice(
  overrides: Partial<LearnerNotice> & Pick<LearnerNotice, 'id' | 'kind' | 'title'>,
): LearnerNotice {
  return {
    contextId: 'context-1',
    status: 'active',
    createdAt: '2026-07-18T12:00:00.000Z',
    updatedAt: '2026-07-18T12:00:00.000Z',
    ...overrides,
  };
}

describe('learner notice read models', () => {
  it('keeps Active and History as stable views', () => {
    const values = [
      notice({ id: 'active', kind: 'ongoing-support', title: 'Active' }),
      notice({
        id: 'resolved',
        kind: 'learner-service',
        title: 'Resolved',
        status: 'resolved',
      }),
      notice({
        id: 'archived',
        kind: 'ongoing-support',
        title: 'Archived',
        status: 'archived',
      }),
    ];
    expect(selectLearnerNoticeView(values, 'active').map((item) => item.id)).toEqual(['active']);
    expect(selectLearnerNoticeView(values, 'history').map((item) => item.id)).toEqual([
      'archived',
      'resolved',
    ]);
  });

  it('keeps legacy open-ended services visible every day', () => {
    const values = [
      notice({ id: 'support', kind: 'ongoing-support', title: 'Support' }),
      notice({ id: 'service', kind: 'learner-service', title: 'Service' }),
      notice({
        id: 'today',
        kind: 'date-specific-notice',
        title: 'Today',
        noticeDate: '2026-07-20',
      }),
      notice({
        id: 'tomorrow',
        kind: 'date-specific-notice',
        title: 'Tomorrow',
        noticeDate: '2026-07-21',
      }),
    ];
    expect(
      selectTodayLearnerNotices(values, '2026-07-20')
        .map((item) => item.id)
        .sort(),
    ).toEqual(['service', 'support', 'today']);
  });

  it('shows a recurring service only on matching dates', () => {
    const recurring = notice({
      id: 'weekly-service',
      kind: 'learner-service',
      title: 'Weekly service',
      serviceRecurrence: {
        frequency: 'weekly',
        weekdays: [2],
        startsOn: '2026-07-01',
        endsOn: '2026-07-31',
        startMinute: 600,
        endMinute: 630,
      },
    });
    expect(selectTodayLearnerNotices([recurring], '2026-07-20')).toEqual([]);
    expect(selectTodayLearnerNotices([recurring], '2026-07-21').map((item) => item.id)).toEqual([
      'weekly-service',
    ]);
  });

  it('hides a completed or cancelled occurrence without closing future dates', () => {
    const recurring = notice({
      id: 'weekly-service',
      kind: 'learner-service',
      title: 'Weekly service',
      serviceRecurrence: {
        frequency: 'weekly',
        weekdays: [2],
        startsOn: '2026-07-01',
        startMinute: 600,
        endMinute: 630,
      },
    });
    const occurrences: LearnerServiceOccurrence[] = [
      {
        id: 'weekly-service:2026-07-21',
        learnerNoticeId: 'weekly-service',
        date: '2026-07-21',
        status: 'completed',
        createdAt: '2026-07-21T14:00:00.000Z',
        updatedAt: '2026-07-21T14:00:00.000Z',
        completedAt: '2026-07-21T14:00:00.000Z',
      },
    ];
    expect(selectTodayLearnerNotices([recurring], '2026-07-21', occurrences)).toEqual([]);
    expect(
      selectTodayLearnerNotices([recurring], '2026-07-28', occurrences).map((item) => item.id),
    ).toEqual(['weekly-service']);
  });

  it('orders timed learner services before untimed support records', () => {
    const values = [
      notice({ id: 'support', kind: 'ongoing-support', title: 'Support' }),
      notice({
        id: 'late',
        kind: 'learner-service',
        title: 'Late',
        serviceRecurrence: {
          frequency: 'weekly',
          weekdays: [2],
          startsOn: '2026-07-01',
          startMinute: 660,
          endMinute: 690,
        },
      }),
      notice({
        id: 'early',
        kind: 'learner-service',
        title: 'Early',
        serviceRecurrence: {
          frequency: 'weekly',
          weekdays: [2],
          startsOn: '2026-07-01',
          startMinute: 600,
          endMinute: 630,
        },
      }),
    ];
    expect(selectTodayLearnerNotices(values, '2026-07-21').map((item) => item.id)).toEqual([
      'early',
      'late',
      'support',
    ]);
  });
});
