import type { TeachingInsightsReadResult } from '@/features/insights/teachingInsightsReadService';
import { formatShortDate, getMonday, parseLocalDate, shiftDays } from '@/shared/dates/localDate';

import type { TeachingReviewView } from './teachingReviewReadModel';

export const teachingReviewPeriodPresets = [
  'school-year',
  'this-week',
  'last-week',
  'custom',
] as const;

export type TeachingReviewPeriodPreset = (typeof teachingReviewPeriodPresets)[number];

export interface TeachingReviewPeriodState {
  preset: TeachingReviewPeriodPreset;
  from?: string;
  to?: string;
}

export interface TeachingReviewResolvedPeriod {
  preset: TeachingReviewPeriodPreset;
  startsOn?: string;
  endsOn?: string;
  label: string;
  overlapsSchoolYear: boolean;
}

const defaultPeriod: TeachingReviewPeriodState = { preset: 'school-year' };

function clean(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function isPreset(value: string | null): value is TeachingReviewPeriodPreset {
  return teachingReviewPeriodPresets.includes(value as TeachingReviewPeriodPreset);
}

function validRange(from: string | undefined, to: string | undefined): boolean {
  return Boolean(from && to && parseLocalDate(from) && parseLocalDate(to) && from <= to);
}

export function parseTeachingReviewPeriodState(
  search: URLSearchParams,
  prefix: '' | 'review' = '',
): TeachingReviewPeriodState {
  const periodKey = prefix ? `${prefix}Period` : 'period';
  const fromKey = prefix ? `${prefix}From` : 'from';
  const toKey = prefix ? `${prefix}To` : 'to';
  const rawPreset = search.get(periodKey);
  const preset = isPreset(rawPreset) ? rawPreset : 'school-year';

  if (preset !== 'custom') return { preset };

  const from = clean(search.get(fromKey));
  const to = clean(search.get(toKey));
  return validRange(from, to) ? { preset, from, to } : defaultPeriod;
}

export function appendTeachingReviewPeriodParams(
  params: URLSearchParams,
  period: TeachingReviewPeriodState | undefined,
  prefix: '' | 'review' = '',
): URLSearchParams {
  const periodKey = prefix ? `${prefix}Period` : 'period';
  const fromKey = prefix ? `${prefix}From` : 'from';
  const toKey = prefix ? `${prefix}To` : 'to';

  params.delete(periodKey);
  params.delete(fromKey);
  params.delete(toKey);

  if (!period || period.preset === 'school-year') return params;
  if (period.preset === 'custom' && !validRange(period.from, period.to)) return params;

  params.set(periodKey, period.preset);
  if (period.preset === 'custom') {
    params.set(fromKey, period.from!);
    params.set(toKey, period.to!);
  }
  return params;
}

export function clampTeachingReviewPeriodToSchoolYear(
  period: TeachingReviewPeriodState,
  schoolYear: { startsOn: string; endsOn: string },
): TeachingReviewPeriodState {
  if (period.preset !== 'custom' || !validRange(period.from, period.to)) return period;

  const from = period.from! < schoolYear.startsOn ? schoolYear.startsOn : period.from!;
  const to = period.to! > schoolYear.endsOn ? schoolYear.endsOn : period.to!;
  return from <= to ? { preset: 'custom', from, to } : defaultPeriod;
}

function clipRange(
  startsOn: string,
  endsOn: string,
  schoolYear: TeachingReviewView['schoolYear'],
): Pick<TeachingReviewResolvedPeriod, 'startsOn' | 'endsOn' | 'overlapsSchoolYear'> {
  const clippedStart = startsOn < schoolYear.startsOn ? schoolYear.startsOn : startsOn;
  const clippedEnd = endsOn > schoolYear.endsOn ? schoolYear.endsOn : endsOn;
  if (clippedStart > clippedEnd) return { overlapsSchoolYear: false };
  return { startsOn: clippedStart, endsOn: clippedEnd, overlapsSchoolYear: true };
}

function rangeLabel(startsOn: string | undefined, endsOn: string | undefined): string {
  if (!startsOn || !endsOn) return 'Outside selected School Year';
  return startsOn === endsOn
    ? formatShortDate(startsOn)
    : `${formatShortDate(startsOn)}–${formatShortDate(endsOn)}`;
}

export function resolveTeachingReviewPeriod(
  period: TeachingReviewPeriodState,
  schoolYear: TeachingReviewView['schoolYear'],
): TeachingReviewResolvedPeriod {
  if (period.preset === 'school-year') {
    return {
      preset: period.preset,
      startsOn: schoolYear.startsOn,
      endsOn: schoolYear.endsOn,
      label: `${formatShortDate(schoolYear.startsOn)}–${formatShortDate(schoolYear.endsOn)}`,
      overlapsSchoolYear: true,
    };
  }

  let startsOn: string;
  let endsOn: string;
  if (period.preset === 'this-week') {
    startsOn = getMonday(schoolYear.asOfDate);
    endsOn = shiftDays(startsOn, 6);
  } else if (period.preset === 'last-week') {
    const thisMonday = getMonday(schoolYear.asOfDate);
    startsOn = shiftDays(thisMonday, -7);
    endsOn = shiftDays(thisMonday, -1);
  } else if (validRange(period.from, period.to)) {
    startsOn = period.from!;
    endsOn = period.to!;
  } else {
    return resolveTeachingReviewPeriod(defaultPeriod, schoolYear);
  }

  const clipped = clipRange(startsOn, endsOn, schoolYear);
  return {
    preset: period.preset,
    ...clipped,
    label: rangeLabel(clipped.startsOn, clipped.endsOn),
  };
}

function insidePeriod(date: string, period: TeachingReviewResolvedPeriod): boolean {
  return Boolean(
    period.overlapsSchoolYear &&
    period.startsOn &&
    period.endsOn &&
    date >= period.startsOn &&
    date <= period.endsOn,
  );
}

export function filterTeachingReviewViewByPeriod(
  view: TeachingReviewView,
  sessionDatesById: TeachingInsightsReadResult['sessionDatesById'],
  period: TeachingReviewResolvedPeriod,
): TeachingReviewView {
  const awaitingRows = view.awaitingReflection.rows.filter((row) => insidePeriod(row.date, period));
  const pastRows = view.pastStillScheduled.rows.filter((row) => {
    const date = sessionDatesById[row.sessionOccurrenceId];
    return date ? insidePeriod(date, period) : true;
  });
  const nextStepRows = view.openNextSteps.rows.filter((row) =>
    insidePeriod(row.occurredOn, period),
  );

  return {
    ...view,
    awaitingReflection: {
      count: awaitingRows.length,
      rows: awaitingRows,
    },
    pastStillScheduled: {
      count: pastRows.length,
      rows: pastRows,
    },
    openNextSteps: {
      reflectionCount: nextStepRows.length,
      taskCount: nextStepRows.reduce((total, row) => total + row.openNextStepCount, 0),
      rows: nextStepRows,
    },
  };
}
