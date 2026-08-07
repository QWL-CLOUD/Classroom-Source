import type { SchoolYear } from '@/domain/models/entities';
import { formatShortDate, getMonday, parseLocalDate, shiftDays } from '@/shared/dates/localDate';

export const learnerProgressPeriodPresets = [
  'school-year',
  'this-week',
  'last-week',
  'custom',
] as const;

export type LearnerProgressPeriodPreset = (typeof learnerProgressPeriodPresets)[number];

export interface LearnerProgressPeriodState {
  preset: LearnerProgressPeriodPreset;
  from?: string;
  to?: string;
}

export interface LearnerProgressResolvedPeriod {
  preset: LearnerProgressPeriodPreset;
  startsOn?: string;
  endsOn?: string;
  label: string;
  overlapsSchoolYear: boolean;
}

const defaultPeriod: LearnerProgressPeriodState = { preset: 'school-year' };

function clean(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function isPreset(value: string | null): value is LearnerProgressPeriodPreset {
  return learnerProgressPeriodPresets.includes(value as LearnerProgressPeriodPreset);
}

function validRange(from: string | undefined, to: string | undefined): boolean {
  return Boolean(from && to && parseLocalDate(from) && parseLocalDate(to) && from <= to);
}

export function parseLearnerProgressPeriodState(
  search: URLSearchParams,
): LearnerProgressPeriodState {
  const rawPreset = search.get('period');
  const preset = isPreset(rawPreset) ? rawPreset : 'school-year';
  if (preset !== 'custom') return { preset };

  const from = clean(search.get('from'));
  const to = clean(search.get('to'));
  return validRange(from, to) ? { preset, from, to } : defaultPeriod;
}

export function appendLearnerProgressPeriodParams(
  params: URLSearchParams,
  period: LearnerProgressPeriodState | undefined,
): URLSearchParams {
  params.delete('period');
  params.delete('from');
  params.delete('to');

  if (!period || period.preset === 'school-year') return params;
  if (period.preset === 'custom' && !validRange(period.from, period.to)) return params;

  params.set('period', period.preset);
  if (period.preset === 'custom') {
    params.set('from', period.from!);
    params.set('to', period.to!);
  }
  return params;
}

export function clampLearnerProgressPeriodToSchoolYear(
  period: LearnerProgressPeriodState,
  schoolYear: Pick<SchoolYear, 'startsOn' | 'endsOn'>,
): LearnerProgressPeriodState {
  if (period.preset !== 'custom' || !validRange(period.from, period.to)) return period;

  const from = period.from! < schoolYear.startsOn ? schoolYear.startsOn : period.from!;
  const to = period.to! > schoolYear.endsOn ? schoolYear.endsOn : period.to!;
  return from <= to ? { preset: 'custom', from, to } : defaultPeriod;
}

function clipRange(
  startsOn: string,
  endsOn: string,
  schoolYear: Pick<SchoolYear, 'startsOn' | 'endsOn'>,
): Pick<LearnerProgressResolvedPeriod, 'startsOn' | 'endsOn' | 'overlapsSchoolYear'> {
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

export function resolveLearnerProgressPeriod(
  period: LearnerProgressPeriodState,
  schoolYear: Pick<SchoolYear, 'startsOn' | 'endsOn'>,
  asOfDate: string,
): LearnerProgressResolvedPeriod {
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
    startsOn = getMonday(asOfDate);
    endsOn = shiftDays(startsOn, 6);
  } else if (period.preset === 'last-week') {
    const thisMonday = getMonday(asOfDate);
    startsOn = shiftDays(thisMonday, -7);
    endsOn = shiftDays(thisMonday, -1);
  } else if (validRange(period.from, period.to)) {
    startsOn = period.from!;
    endsOn = period.to!;
  } else {
    return resolveLearnerProgressPeriod(defaultPeriod, schoolYear, asOfDate);
  }

  const clipped = clipRange(startsOn, endsOn, schoolYear);
  return {
    preset: period.preset,
    ...clipped,
    label: rangeLabel(clipped.startsOn, clipped.endsOn),
  };
}

export function dateInsideLearnerProgressPeriod(
  date: string,
  period: LearnerProgressResolvedPeriod,
): boolean {
  return Boolean(
    period.overlapsSchoolYear &&
    period.startsOn &&
    period.endsOn &&
    date >= period.startsOn &&
    date <= period.endsOn,
  );
}
