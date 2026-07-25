import { z } from 'zod';

import { standardSchema, type Standard, type StandardStatus } from '@/domain/models/entities';

import { buildStandardFrameworkKey, normalizeStandardCode } from './standardIdentity';

const optionalSortOrderSchema = z.string().refine((value) => {
  if (!value.trim()) return true;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000;
}, 'Sort order must be a whole number from 0 to 1,000,000.');

export interface StandardEditorValues {
  issuingOrganization: string;
  frameworkTitle: string;
  jurisdiction: string;
  subject: string;
  gradeBand: string;
  version: string;
  code: string;
  statement: string;
  parentStandardId: string;
  sortOrder: string;
}

export const standardEditorValuesSchema = z.object({
  issuingOrganization: z.string().trim().min(1, 'Enter the issuing organization.').max(240),
  frameworkTitle: z.string().trim().min(1, 'Enter the framework title.').max(500),
  jurisdiction: z.string().trim().max(240),
  subject: z.string().trim().max(240),
  gradeBand: z.string().trim().max(120),
  version: z.string().trim().max(120),
  code: z.string().trim().min(1, 'Enter the Standard code.').max(160),
  statement: z.string().trim().min(1, 'Enter the Standard statement.').max(10_000),
  parentStandardId: z.string(),
  sortOrder: optionalSortOrderSchema,
});

export type StandardEditableFields = Pick<
  Standard,
  | 'issuingOrganization'
  | 'frameworkTitle'
  | 'jurisdiction'
  | 'subject'
  | 'gradeBand'
  | 'version'
  | 'code'
  | 'statement'
  | 'parentStandardId'
  | 'sortOrder'
  | 'frameworkKey'
  | 'normalizedCode'
>;

function optionalText(value: string): string | undefined {
  return value.trim() || undefined;
}

export function createStandardEditorValues(standard?: Standard): StandardEditorValues {
  return {
    issuingOrganization: standard?.issuingOrganization ?? '',
    frameworkTitle: standard?.frameworkTitle ?? '',
    jurisdiction: standard?.jurisdiction ?? '',
    subject: standard?.subject ?? '',
    gradeBand: standard?.gradeBand ?? '',
    version: standard?.version ?? '',
    code: standard?.code ?? '',
    statement: standard?.statement ?? '',
    parentStandardId: standard?.parentStandardId ?? '',
    sortOrder: standard?.sortOrder?.toString() ?? '',
  };
}

export function parseStandardEditorValues(input: StandardEditorValues): StandardEditableFields {
  const values = standardEditorValuesSchema.parse(input);
  const identity = {
    issuingOrganization: values.issuingOrganization,
    frameworkTitle: values.frameworkTitle,
    jurisdiction: optionalText(values.jurisdiction),
    version: optionalText(values.version),
  };
  return {
    issuingOrganization: identity.issuingOrganization,
    frameworkTitle: identity.frameworkTitle,
    jurisdiction: identity.jurisdiction,
    subject: optionalText(values.subject),
    gradeBand: optionalText(values.gradeBand),
    version: identity.version,
    code: values.code.trim(),
    statement: values.statement.trim(),
    parentStandardId: values.parentStandardId || undefined,
    sortOrder: values.sortOrder ? Number(values.sortOrder) : 0,
    frameworkKey: buildStandardFrameworkKey(identity),
    normalizedCode: normalizeStandardCode(values.code),
  };
}

export function parseStandardWithStatus(
  value: StandardEditableFields & {
    id: string;
    status: StandardStatus;
    createdAt: string;
    updatedAt: string;
    archivedAt?: string;
  },
): Standard {
  return standardSchema.parse(value);
}
