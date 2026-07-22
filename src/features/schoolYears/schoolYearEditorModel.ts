import { addYears, getYear } from 'date-fns';
import { z } from 'zod';

import type { SchoolYear } from '@/domain/models/entities';
import { parseLocalDate, toLocalDateString } from '@/shared/dates/localDate';

export const schoolYearEditorValuesSchema = z
  .object({
    label: z.string().trim().min(1, 'Enter a school year name.').max(120),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid start date.'),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid end date.'),
  })
  .superRefine((value, context) => {
    const start = parseLocalDate(value.startsOn);
    const end = parseLocalDate(value.endsOn);
    if (!start) {
      context.addIssue({
        code: 'custom',
        message: 'Choose a valid start date.',
        path: ['startsOn'],
      });
    }
    if (!end) {
      context.addIssue({ code: 'custom', message: 'Choose a valid end date.', path: ['endsOn'] });
    }
    if (start && end && value.startsOn > value.endsOn) {
      context.addIssue({
        code: 'custom',
        message: 'The end date must be on or after the start date.',
        path: ['endsOn'],
      });
    }
  });

export type SchoolYearEditorValues = z.input<typeof schoolYearEditorValuesSchema>;

export function createEmptySchoolYearValues(today = new Date()): SchoolYearEditorValues {
  const year = getYear(today);
  return {
    label: `${year}–${year + 1}`,
    startsOn: `${year}-07-01`,
    endsOn: `${year + 1}-06-30`,
  };
}

function shiftLocalDateByYear(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) throw new Error(`Invalid school year date: ${value}`);
  return toLocalDateString(addYears(parsed, 1));
}

export function buildNextSchoolYearValues(activeSchoolYear: SchoolYear): SchoolYearEditorValues {
  const nextStartsOn = shiftLocalDateByYear(activeSchoolYear.startsOn);
  const nextEndsOn = shiftLocalDateByYear(activeSchoolYear.endsOn);
  const startYear = Number(nextStartsOn.slice(0, 4));
  const endYear = Number(nextEndsOn.slice(0, 4));
  return {
    label: startYear === endYear ? `${startYear}` : `${startYear}–${endYear}`,
    startsOn: nextStartsOn,
    endsOn: nextEndsOn,
  };
}
