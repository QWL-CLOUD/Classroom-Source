import type { SchoolYear } from '@/domain/models/entities';
import type { ActiveSchoolYearState } from './useActiveSchoolYear';

export type SchoolYearContextTone = 'ready' | 'missing' | 'loading' | 'error';

export interface SchoolYearContextPresentation {
  label: string;
  detail: string;
  tone: SchoolYearContextTone;
}

function formatDateRange(schoolYear: SchoolYear): string {
  return `${schoolYear.startsOn} through ${schoolYear.endsOn}`;
}

export function presentActiveSchoolYear(
  state: ActiveSchoolYearState,
): SchoolYearContextPresentation {
  if (state.status === 'loading') {
    return {
      label: 'Loading school year…',
      detail: 'Reading the active school year from Classroom data.',
      tone: 'loading',
    };
  }

  if (state.status === 'error') {
    return {
      label: 'School year unavailable',
      detail: state.message,
      tone: 'error',
    };
  }

  if (!state.data) {
    return {
      label: 'No active school year',
      detail: 'Learner and planning work is not scoped to an active school year.',
      tone: 'missing',
    };
  }

  return {
    label: state.data.label,
    detail: formatDateRange(state.data),
    tone: 'ready',
  };
}
