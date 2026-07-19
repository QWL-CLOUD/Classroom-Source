import type {
  LearnerNotice,
  LearnerNoticeKind,
  LearnerNoticeStatus,
} from '@/domain/models/entities';

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
): LearnerNotice[] {
  return notices
    .filter((notice) => {
      if (notice.status !== 'active') return false;
      if (notice.kind === 'date-specific-notice') return notice.noticeDate === selectedDate;
      return true;
    })
    .sort(
      (first, second) =>
        first.kind.localeCompare(second.kind) ||
        second.updatedAt.localeCompare(first.updatedAt) ||
        first.title.localeCompare(second.title) ||
        first.id.localeCompare(second.id),
    );
}
