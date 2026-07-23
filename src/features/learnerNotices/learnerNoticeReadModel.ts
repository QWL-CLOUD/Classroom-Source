import type {
  LearnerNotice,
  LearnerNoticeKind,
  LearnerNoticeStatus,
  LearnerServiceOccurrence,
} from '@/domain/models/entities';

import {
  learnerServiceOccurrenceIsClosed,
  learnerServiceOccursOnDate,
} from './learnerServiceRecurrence';

export type LearnerNoticeView = 'active' | 'history';

const kindLabels: Record<LearnerNoticeKind, string> = {
  'ongoing-support': 'Ongoing Support',
  'date-specific-notice': 'Date-specific Notice',
  'learner-service': 'Learner Service',
};

const statusLabels: Record<LearnerNoticeStatus, string> = {
  active: 'Active',
  resolved: 'Resolved',
  archived: 'Archived',
};

export function learnerNoticeKindLabel(kind: LearnerNoticeKind): string {
  return kindLabels[kind];
}

export function learnerNoticeStatusLabel(status: LearnerNoticeStatus): string {
  return statusLabels[status];
}

export function selectLearnerNoticeView(
  notices: readonly LearnerNotice[],
  view: LearnerNoticeView,
): LearnerNotice[] {
  return notices
    .filter((notice) =>
      view === 'active' ? notice.status === 'active' : notice.status !== 'active',
    )
    .sort((first, second) => {
      if (view === 'active') {
        return (
          (first.noticeDate ?? '9999-12-31').localeCompare(second.noticeDate ?? '9999-12-31') ||
          second.updatedAt.localeCompare(first.updatedAt) ||
          first.title.localeCompare(second.title) ||
          first.id.localeCompare(second.id)
        );
      }
      return (
        second.updatedAt.localeCompare(first.updatedAt) ||
        first.title.localeCompare(second.title) ||
        first.id.localeCompare(second.id)
      );
    });
}

export function selectTodayLearnerNotices(
  notices: readonly LearnerNotice[],
  selectedDate: string,
  occurrences: readonly LearnerServiceOccurrence[] = [],
): LearnerNotice[] {
  return notices
    .filter((notice) => {
      if (notice.status !== 'active') return false;
      if (notice.kind === 'date-specific-notice') {
        return notice.noticeDate === selectedDate;
      }
      if (notice.kind === 'learner-service' && notice.serviceRecurrence) {
        return (
          learnerServiceOccursOnDate(notice, selectedDate) &&
          !learnerServiceOccurrenceIsClosed(occurrences, notice.id, selectedDate)
        );
      }
      return true;
    })
    .sort((first, second) => {
      const firstMinute = first.serviceRecurrence?.startMinute ?? 1440;
      const secondMinute = second.serviceRecurrence?.startMinute ?? 1440;
      return (
        firstMinute - secondMinute ||
        first.kind.localeCompare(second.kind) ||
        second.updatedAt.localeCompare(first.updatedAt) ||
        first.title.localeCompare(second.title) ||
        first.id.localeCompare(second.id)
      );
    });
}
