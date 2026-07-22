import { z } from 'zod';

import { schoolYearSchema, type ChangeLog, type SchoolYear } from '@/domain/models/entities';

export const SCHOOL_YEAR_COMMAND_PREFIX = 'school-year.';

const putSchoolYearOperationSchema = z.object({
  table: z.literal('schoolYears'),
  action: z.literal('put'),
  record: schoolYearSchema,
});

const deleteSchoolYearOperationSchema = z.object({
  table: z.literal('schoolYears'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

export const schoolYearOperationSchema = z.union([
  putSchoolYearOperationSchema,
  deleteSchoolYearOperationSchema,
]);

export const schoolYearCommandSchema = z.object({
  operations: z.array(schoolYearOperationSchema).min(1),
});

export type SchoolYearOperation = z.infer<typeof schoolYearOperationSchema>;
export type SchoolYearCommand = z.infer<typeof schoolYearCommandSchema>;

export interface SchoolYearCommandPair {
  forward: SchoolYearCommand;
  inverse: SchoolYearCommand;
}

export function putSchoolYearOperation(record: SchoolYear): SchoolYearOperation {
  return schoolYearOperationSchema.parse({ table: 'schoolYears', action: 'put', record });
}

export function deleteSchoolYearOperation(id: string): SchoolYearOperation {
  return schoolYearOperationSchema.parse({ table: 'schoolYears', action: 'delete', id });
}

export function createSchoolYearCommand(
  operations: readonly SchoolYearOperation[],
): SchoolYearCommand {
  return schoolYearCommandSchema.parse({ operations });
}

export function serializeSchoolYearCommand(command: SchoolYearCommand): string {
  return JSON.stringify(schoolYearCommandSchema.parse(command));
}

export function parseSchoolYearCommand(json: string): SchoolYearCommand {
  return schoolYearCommandSchema.parse(JSON.parse(json) as unknown);
}

export function isSchoolYearChangeLog(log: ChangeLog): boolean {
  return log.commandType.startsWith(SCHOOL_YEAR_COMMAND_PREFIX);
}
