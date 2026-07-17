import { getISODay } from 'date-fns';

import type { ScheduleBlock, ScheduleException } from '@/domain/models/entities';
import { parseLocalDate } from '@/shared/dates/localDate';

export interface ScheduleOccurrenceResolveOptions {
  requireShowInWeek?: boolean;
}

export interface ResolvedScheduleOccurrence {
  block: ScheduleBlock;
  exception?: ScheduleException;
  adjusted: boolean;
}

function blockIsActiveOnDate(
  block: ScheduleBlock,
  date: string,
  requireShowInWeek: boolean,
): boolean {
  if (block.archivedAt) return false;
  if (requireShowInWeek && !block.showInWeek) return false;
  if (block.effectiveFrom && date < block.effectiveFrom) return false;
  if (block.effectiveTo && date > block.effectiveTo) return false;
  if (block.effectiveFrom && block.effectiveTo && block.effectiveFrom > block.effectiveTo) {
    return false;
  }
  return true;
}

function defaultOccursOnDate(
  block: ScheduleBlock,
  date: string,
  requireShowInWeek: boolean,
): boolean {
  if (!blockIsActiveOnDate(block, date, requireShowInWeek)) return false;
  const parsed = parseLocalDate(date);
  if (!parsed) throw new Error(`Invalid local date: ${date}`);
  return block.weekdays.includes(getISODay(parsed));
}

export function findScheduleException(
  blockId: string,
  date: string,
  exceptions: readonly ScheduleException[],
): ScheduleException | undefined {
  const matches = exceptions
    .filter((exception) => exception.scheduleBlockId === blockId && exception.date === date)
    .sort((first, second) => first.id.localeCompare(second.id));
  if (matches.length > 1) {
    throw new Error(`Multiple schedule exceptions exist for ${blockId} on ${date}.`);
  }
  return matches[0];
}

export function resolveScheduleOccurrence(
  block: ScheduleBlock,
  date: string,
  exceptions: readonly ScheduleException[],
  options: ScheduleOccurrenceResolveOptions = {},
): ResolvedScheduleOccurrence | null {
  const exception = findScheduleException(block.id, date, exceptions);
  const occursByDefault = defaultOccursOnDate(block, date, Boolean(options.requireShowInWeek));

  if (!exception) {
    return occursByDefault ? { block, adjusted: false } : null;
  }

  if (exception.action === 'cancel') return null;
  if (exception.action === 'modify' && !occursByDefault) return null;
  if (
    exception.action === 'add' &&
    !blockIsActiveOnDate(block, date, Boolean(options.requireShowInWeek))
  ) {
    return null;
  }

  const startMinute = exception.replacementStartMinute ?? block.startMinute;
  const endMinute = exception.replacementEndMinute ?? block.endMinute;
  if (endMinute <= startMinute) {
    throw new Error(`Invalid schedule exception time range: ${exception.id}`);
  }

  return {
    block: {
      ...block,
      title: exception.replacementTitle?.trim() || block.title,
      startMinute,
      endMinute,
    },
    exception,
    adjusted: true,
  };
}
