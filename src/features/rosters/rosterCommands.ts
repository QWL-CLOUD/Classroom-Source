import { z } from 'zod';

import {
  learnerContextSchema,
  rosterMembershipSchema,
  studentRecordSchema,
  type LearnerContext,
  type RosterMembership,
  type StudentRecord,
} from '@/domain/models/entities';

export const ROSTER_COMMAND_PREFIX = 'roster.';

const putStudentRecordOperationSchema = z.object({
  table: z.literal('studentRecords'),
  action: z.literal('put'),
  record: studentRecordSchema,
});

const deleteStudentRecordOperationSchema = z.object({
  table: z.literal('studentRecords'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

const putRosterMembershipOperationSchema = z.object({
  table: z.literal('rosterMemberships'),
  action: z.literal('put'),
  record: rosterMembershipSchema,
});

const deleteRosterMembershipOperationSchema = z.object({
  table: z.literal('rosterMemberships'),
  action: z.literal('delete'),
  id: z.string().min(1),
});

const putLinkedIndividualContextOperationSchema = z.object({
  table: z.literal('learnerContexts'),
  action: z.literal('put'),
  record: learnerContextSchema,
});

export const rosterOperationSchema = z.union([
  putStudentRecordOperationSchema,
  deleteStudentRecordOperationSchema,
  putRosterMembershipOperationSchema,
  deleteRosterMembershipOperationSchema,
  putLinkedIndividualContextOperationSchema,
]);

export const rosterCommandSchema = z.object({
  operations: z.array(rosterOperationSchema).min(1),
});

export type RosterOperation = z.infer<typeof rosterOperationSchema>;
export type RosterCommand = z.infer<typeof rosterCommandSchema>;

export interface RosterCommandPair {
  forward: RosterCommand;
  inverse: RosterCommand;
}

export function putStudentRecordOperation(record: StudentRecord): RosterOperation {
  return rosterOperationSchema.parse({
    table: 'studentRecords',
    action: 'put',
    record,
  });
}

export function deleteStudentRecordOperation(id: string): RosterOperation {
  return rosterOperationSchema.parse({
    table: 'studentRecords',
    action: 'delete',
    id,
  });
}

export function putRosterMembershipOperation(record: RosterMembership): RosterOperation {
  return rosterOperationSchema.parse({
    table: 'rosterMemberships',
    action: 'put',
    record,
  });
}

export function deleteRosterMembershipOperation(id: string): RosterOperation {
  return rosterOperationSchema.parse({
    table: 'rosterMemberships',
    action: 'delete',
    id,
  });
}

export function putLinkedIndividualContextOperation(record: LearnerContext): RosterOperation {
  return rosterOperationSchema.parse({
    table: 'learnerContexts',
    action: 'put',
    record,
  });
}

export function createRosterCommand(operations: readonly RosterOperation[]): RosterCommand {
  return rosterCommandSchema.parse({ operations });
}

export function serializeRosterCommand(command: RosterCommand): string {
  return JSON.stringify(rosterCommandSchema.parse(command));
}

export function parseRosterCommand(json: string): RosterCommand {
  return rosterCommandSchema.parse(JSON.parse(json) as unknown);
}
