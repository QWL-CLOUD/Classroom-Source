import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { schoolYearSchema, type SchoolYear } from '@/domain/models/entities';
import { subDays } from 'date-fns';

import { parseLocalDate, todayLocalDate, toLocalDateString } from '@/shared/dates/localDate';

export interface SchoolYearListItem {
  schoolYear: SchoolYear;
  learnerContextCount: number;
}

export interface SchoolYearReadModel {
  items: SchoolYearListItem[];
  activeSchoolYear: SchoolYear | null;
  activeSchoolYearCount: number;
  archivedCount: number;
  currentDate: string;
  rolloverTone: 'ready' | 'upcoming' | 'overdue' | 'missing';
  rolloverMessage: string;
}

function compareSchoolYears(first: SchoolYear, second: SchoolYear): number {
  return (
    Number(second.active) - Number(first.active) ||
    Number(first.lifecycleState === 'archived') - Number(second.lifecycleState === 'archived') ||
    second.startsOn.localeCompare(first.startsOn) ||
    first.label.localeCompare(second.label)
  );
}

export function deriveRolloverStatus(
  activeSchoolYear: SchoolYear | null,
  currentDate: string,
): Pick<SchoolYearReadModel, 'rolloverTone' | 'rolloverMessage'> {
  if (!activeSchoolYear) {
    return {
      rolloverTone: 'missing',
      rolloverMessage: 'Create or activate a school year before adding new learner contexts.',
    };
  }

  if (currentDate > activeSchoolYear.endsOn) {
    return {
      rolloverTone: 'overdue',
      rolloverMessage: `${activeSchoolYear.label} ended on ${activeSchoolYear.endsOn}. Prepare and activate the next school year.`,
    };
  }

  const endDate = parseLocalDate(activeSchoolYear.endsOn);
  if (!endDate) throw new Error(`Invalid school year end date: ${activeSchoolYear.endsOn}`);
  const warningDateString = toLocalDateString(subDays(endDate, 60));
  if (currentDate >= warningDateString) {
    return {
      rolloverTone: 'upcoming',
      rolloverMessage: `${activeSchoolYear.label} ends on ${activeSchoolYear.endsOn}. You can prepare the next school year now.`,
    };
  }

  return {
    rolloverTone: 'ready',
    rolloverMessage: `${activeSchoolYear.label} is active through ${activeSchoolYear.endsOn}.`,
  };
}

export class SchoolYearReadService {
  constructor(private readonly db: ClassroomDatabase = classroomDb) {}

  async load(currentDate = todayLocalDate()): Promise<SchoolYearReadModel> {
    const [schoolYearValues, contexts] = await Promise.all([
      this.db.schoolYears.toArray(),
      this.db.learnerContexts.toArray(),
    ]);
    const schoolYears = schoolYearValues.map((value) => schoolYearSchema.parse(value));
    const contextCounts = new Map<string, number>();
    for (const context of contexts) {
      contextCounts.set(context.schoolYearId, (contextCounts.get(context.schoolYearId) ?? 0) + 1);
    }
    const activeYears = schoolYears.filter((schoolYear) => schoolYear.active);
    const activeSchoolYear = activeYears.sort(compareSchoolYears)[0] ?? null;
    const rollover = deriveRolloverStatus(activeSchoolYear, currentDate);

    return {
      items: schoolYears.sort(compareSchoolYears).map((schoolYear) => ({
        schoolYear,
        learnerContextCount: contextCounts.get(schoolYear.id) ?? 0,
      })),
      activeSchoolYear,
      activeSchoolYearCount: activeYears.length,
      archivedCount: schoolYears.filter((schoolYear) => schoolYear.lifecycleState === 'archived')
        .length,
      currentDate,
      ...rollover,
    };
  }
}

export const schoolYearReadService = new SchoolYearReadService();
