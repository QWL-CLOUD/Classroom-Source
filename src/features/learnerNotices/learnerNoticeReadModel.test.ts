import { describe, expect, it } from 'vitest';

import type { LearnerNotice } from '@/domain/models/entities';

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
      notice({ id: 'resolved', kind: 'learner-service', title: 'Resolved', status: 'resolved' }),
      notice({ id: 'archived', kind: 'ongoing-support', title: 'Archived', status: 'archived' }),
    ];

    expect(selectLearnerNoticeView(values, 'active').map((item) => item.id)).toEqual(['active']);
    expect(selectLearnerNoticeView(values, 'history').map((item) => item.id)).toEqual([
      'archived',
      'resolved',
    ]);
  });

  it('shows ongoing support and services every day but date-specific notices only on their date', () => {
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
      notice({
        id: 'resolved',
        kind: 'ongoing-support',
        title: 'Resolved',
        status: 'resolved',
      }),
    ];

    expect(
      selectTodayLearnerNotices(values, '2026-07-20')
        .map((item) => item.id)
        .sort(),
    ).toEqual(['service', 'support', 'today']);
  });
});
