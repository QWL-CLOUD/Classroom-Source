import type { ZodType } from 'zod';

import {
  appSettingSchema,
  assessmentEvidenceRecordSchema,
  calendarEventSchema,
  categoryAssignmentSchema,
  categoryValueSchema,
  classificationMappingPresetSchema,
  changeLogSchema,
  contextMembershipSchema,
  importRunSchema,
  learnerContextSchema,
  rosterMembershipSchema,
  learnerNoticeSchema,
  learnerServiceOccurrenceSchema,
  lessonPlanSchema,
  lessonSeriesSchema,
  lessonTemplateSchema,
  libraryCatalogItemSchema,
  migrationRunSchema,
  quarantineRecordSchema,
  quickCaptureSchema,
  reminderSchema,
  scheduleBlockSchema,
  scheduleExceptionSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  standardAlignmentSchema,
  standardImportBatchSchema,
  standardSchema,
  studentRecordSchema,
  taskSchema,
} from '@/domain/models/entities';

export const CLASSROOM_BACKUP_FORMAT = 'classroom-v20-backup-v1' as const;
export const CLASSROOM_DATABASE_SCHEMA_VERSION = 15;
const LEGACY_ROSTERLESS_SCHEMA_VERSION = 10;
const LEGACY_EVIDENCELESS_SCHEMA_VERSION = 11;
const LEGACY_IMPORTLESS_SCHEMA_VERSION = 12;
const LEGACY_PRESETLESS_SCHEMA_VERSION = 13;
const LEGACY_CALENDAR_IDENTITYLESS_SCHEMA_VERSION = 14;
export const CLASSROOM_APP_VERSION = '20.0.0-alpha.0';
export const MAX_BACKUP_FILE_BYTES = 100 * 1024 * 1024;

export const BACKUP_TABLE_NAMES = [
  'schoolYears',
  'learnerContexts',
  'learnerNotices',
  'learnerServiceOccurrences',
  'contextMemberships',
  'studentRecords',
  'rosterMemberships',
  'assessmentEvidence',
  'scheduleBlocks',
  'scheduleExceptions',
  'calendarEvents',
  'categoryValues',
  'categoryAssignments',
  'classificationMappingPresets',
  'libraryItems',
  'importRuns',
  'lessonSeries',
  'lessonPlans',
  'lessonTemplates',
  'standards',
  'standardAlignments',
  'standardImportBatches',
  'sessionOccurrences',
  'tasks',
  'quickCaptures',
  'reminders',
  'migrationRuns',
  'quarantineRecords',
  'changeLog',
  'appSettings',
] as const;

export type BackupTableName = (typeof BACKUP_TABLE_NAMES)[number];
export type BackupTableData = Record<BackupTableName, unknown[]>;

const backupSchemas: Record<BackupTableName, ZodType> = {
  schoolYears: schoolYearSchema,
  learnerContexts: learnerContextSchema,
  learnerNotices: learnerNoticeSchema,
  learnerServiceOccurrences: learnerServiceOccurrenceSchema,
  contextMemberships: contextMembershipSchema,
  studentRecords: studentRecordSchema,
  rosterMemberships: rosterMembershipSchema,
  assessmentEvidence: assessmentEvidenceRecordSchema,
  scheduleBlocks: scheduleBlockSchema,
  scheduleExceptions: scheduleExceptionSchema,
  calendarEvents: calendarEventSchema,
  categoryValues: categoryValueSchema,
  categoryAssignments: categoryAssignmentSchema,
  classificationMappingPresets: classificationMappingPresetSchema,
  libraryItems: libraryCatalogItemSchema,
  importRuns: importRunSchema,
  lessonSeries: lessonSeriesSchema,
  lessonPlans: lessonPlanSchema,
  lessonTemplates: lessonTemplateSchema,
  standards: standardSchema,
  standardAlignments: standardAlignmentSchema,
  standardImportBatches: standardImportBatchSchema,
  sessionOccurrences: sessionOccurrenceSchema,
  tasks: taskSchema,
  quickCaptures: quickCaptureSchema,
  reminders: reminderSchema,
  migrationRuns: migrationRunSchema,
  quarantineRecords: quarantineRecordSchema,
  changeLog: changeLogSchema,
  appSettings: appSettingSchema,
};

export interface ClassroomBackupPrivacy {
  localOnly: true;
  containsUserContent: true;
  containsFilePaths: false;
  includesRecoveryInternals: false;
}

export interface ClassroomBackupEnvelope {
  format: typeof CLASSROOM_BACKUP_FORMAT;
  databaseSchemaVersion: number;
  appVersion: string;
  backupId: string;
  exportedAt: string;
  privacy: ClassroomBackupPrivacy;
  tableCounts: Record<BackupTableName, number>;
  tables: BackupTableData;
  integrityHash: string;
}

export interface RestoreQuarantineItem {
  tableName: string;
  recordKey?: string;
  reason: string;
  rawJson: string;
}

export interface RestoreTablePreview {
  tableName: BackupTableName;
  sourceCount: number;
  validCount: number;
  quarantinedCount: number;
}

export interface RestorePreview {
  format: typeof CLASSROOM_BACKUP_FORMAT;
  databaseSchemaVersion: number;
  appVersion: string;
  backupId: string;
  exportedAt: string;
  integrityHash: string;
  validTables: BackupTableData;
  tableSummaries: RestoreTablePreview[];
  quarantined: RestoreQuarantineItem[];
  validRecordCount: number;
  quarantineCount: number;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function jsonString(value: unknown, indentation?: number): string {
  const result = JSON.stringify(value, null, indentation);
  if (result === undefined)
    throw new Error('The backup contains a value that cannot be serialized.');
  return result;
}

function canonicalJson(value: unknown): string {
  return jsonString(canonicalize(value));
}

export function stableIntegrityHash(value: unknown): string {
  const text = typeof value === 'string' ? value : canonicalJson(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function envelopeContent(value: Omit<ClassroomBackupEnvelope, 'integrityHash'>): unknown {
  return value;
}

function tableCounts(tables: BackupTableData): Record<BackupTableName, number> {
  return Object.fromEntries(
    BACKUP_TABLE_NAMES.map((tableName) => [tableName, tables[tableName].length]),
  ) as Record<BackupTableName, number>;
}

export function emptyBackupTables(): BackupTableData {
  return Object.fromEntries(
    BACKUP_TABLE_NAMES.map((tableName) => [tableName, []]),
  ) as unknown as BackupTableData;
}

export function createBackupEnvelope(
  tables: BackupTableData,
  options: { backupId?: string; exportedAt?: string; appVersion?: string } = {},
): ClassroomBackupEnvelope {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const withoutHash: Omit<ClassroomBackupEnvelope, 'integrityHash'> = {
    format: CLASSROOM_BACKUP_FORMAT,
    databaseSchemaVersion: CLASSROOM_DATABASE_SCHEMA_VERSION,
    appVersion: options.appVersion ?? CLASSROOM_APP_VERSION,
    backupId: options.backupId ?? globalThis.crypto.randomUUID(),
    exportedAt,
    privacy: {
      localOnly: true,
      containsUserContent: true,
      containsFilePaths: false,
      includesRecoveryInternals: false,
    },
    tableCounts: tableCounts(tables),
    tables,
  };
  return {
    ...withoutHash,
    integrityHash: stableIntegrityHash(envelopeContent(withoutHash)),
  };
}

export function serializeBackupEnvelope(envelope: ClassroomBackupEnvelope): string {
  return `${jsonString(envelope, 2)}\n`;
}

function recordKey(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.id === 'string' && value.id) return value.id;
  if (typeof value.key === 'string' && value.key) return value.key;
  return undefined;
}

function readableIssue(error: {
  issues?: Array<{ path?: PropertyKey[]; message?: string }>;
}): string {
  const issue = error.issues?.[0];
  if (!issue) return 'The record does not match the current Classroom schema.';
  const path = issue.path?.length ? `${issue.path.map(String).join('.')}: ` : '';
  return `${path}${issue.message ?? 'The record is invalid.'}`;
}

export function buildRestorePreview(rawText: string): RestorePreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  if (!isRecord(parsed)) throw new Error('The selected JSON is not a Classroom backup.');
  if (parsed.format !== CLASSROOM_BACKUP_FORMAT) {
    throw new Error('The selected file is not a supported Classroom v20 backup.');
  }
  if (
    parsed.databaseSchemaVersion !== CLASSROOM_DATABASE_SCHEMA_VERSION &&
    parsed.databaseSchemaVersion !== LEGACY_CALENDAR_IDENTITYLESS_SCHEMA_VERSION &&
    parsed.databaseSchemaVersion !== LEGACY_PRESETLESS_SCHEMA_VERSION &&
    parsed.databaseSchemaVersion !== LEGACY_IMPORTLESS_SCHEMA_VERSION &&
    parsed.databaseSchemaVersion !== LEGACY_EVIDENCELESS_SCHEMA_VERSION &&
    parsed.databaseSchemaVersion !== LEGACY_ROSTERLESS_SCHEMA_VERSION
  ) {
    throw new Error(
      `This backup uses database schema ${String(parsed.databaseSchemaVersion)}. Classroom supports schemas ${LEGACY_ROSTERLESS_SCHEMA_VERSION}, ${LEGACY_EVIDENCELESS_SCHEMA_VERSION}, ${LEGACY_IMPORTLESS_SCHEMA_VERSION}, ${LEGACY_PRESETLESS_SCHEMA_VERSION}, ${LEGACY_CALENDAR_IDENTITYLESS_SCHEMA_VERSION}, and ${CLASSROOM_DATABASE_SCHEMA_VERSION}.`,
    );
  }
  if (
    typeof parsed.appVersion !== 'string' ||
    typeof parsed.backupId !== 'string' ||
    typeof parsed.exportedAt !== 'string' ||
    typeof parsed.integrityHash !== 'string' ||
    !isRecord(parsed.privacy) ||
    !isRecord(parsed.tableCounts) ||
    !isRecord(parsed.tables)
  ) {
    throw new Error('The selected backup is missing required metadata.');
  }

  const content = {
    format: parsed.format,
    databaseSchemaVersion: parsed.databaseSchemaVersion,
    appVersion: parsed.appVersion,
    backupId: parsed.backupId,
    exportedAt: parsed.exportedAt,
    privacy: parsed.privacy,
    tableCounts: parsed.tableCounts,
    tables: parsed.tables,
  };
  if (
    stableIntegrityHash(
      envelopeContent(content as unknown as Omit<ClassroomBackupEnvelope, 'integrityHash'>),
    ) !== parsed.integrityHash
  ) {
    throw new Error('The backup integrity check failed. The file may be incomplete or modified.');
  }

  const validTables = emptyBackupTables();
  const quarantined: RestoreQuarantineItem[] = [];
  const tableSummaries: RestoreTablePreview[] = [];
  const knownNames = new Set<string>(BACKUP_TABLE_NAMES);

  for (const [unknownName, unknownValue] of Object.entries(parsed.tables)) {
    if (knownNames.has(unknownName)) continue;
    const values = Array.isArray(unknownValue) ? unknownValue : [unknownValue];
    for (const value of values) {
      quarantined.push({
        tableName: unknownName,
        recordKey: recordKey(value),
        reason: 'This table is not recognized by the current Classroom version.',
        rawJson: jsonString(value),
      });
    }
  }

  const legacyMissingTables = new Set<BackupTableName>(
    parsed.databaseSchemaVersion === LEGACY_ROSTERLESS_SCHEMA_VERSION
      ? [
          'studentRecords',
          'rosterMemberships',
          'assessmentEvidence',
          'importRuns',
          'classificationMappingPresets',
        ]
      : parsed.databaseSchemaVersion === LEGACY_EVIDENCELESS_SCHEMA_VERSION
        ? ['assessmentEvidence', 'importRuns', 'classificationMappingPresets']
        : parsed.databaseSchemaVersion === LEGACY_IMPORTLESS_SCHEMA_VERSION
          ? ['importRuns', 'classificationMappingPresets']
          : parsed.databaseSchemaVersion === LEGACY_PRESETLESS_SCHEMA_VERSION
            ? ['classificationMappingPresets']
            : [],
  );
  for (const tableName of BACKUP_TABLE_NAMES) {
    const source = parsed.tables[tableName];
    if (!Array.isArray(source)) {
      if (legacyMissingTables.has(tableName)) {
        tableSummaries.push({
          tableName,
          sourceCount: 0,
          validCount: 0,
          quarantinedCount: 0,
        });
        continue;
      }
      throw new Error(`The backup is missing the required ${tableName} table.`);
    }
    const expectedCount = parsed.tableCounts[tableName];
    if (expectedCount !== source.length) {
      throw new Error(`The ${tableName} table count does not match the backup metadata.`);
    }

    const keys = new Set<string>();
    let invalidCount = 0;
    for (const value of source) {
      const result = backupSchemas[tableName].safeParse(value);
      const key = recordKey(value);
      if (!result.success) {
        invalidCount += 1;
        quarantined.push({
          tableName,
          recordKey: key,
          reason: readableIssue(result.error),
          rawJson: jsonString(value),
        });
        continue;
      }
      const parsedKey = recordKey(result.data);
      if (!parsedKey) {
        invalidCount += 1;
        quarantined.push({
          tableName,
          reason: 'The record has no stable primary key.',
          rawJson: jsonString(value),
        });
        continue;
      }
      if (keys.has(parsedKey)) {
        invalidCount += 1;
        quarantined.push({
          tableName,
          recordKey: parsedKey,
          reason: 'The backup contains a duplicate primary key in this table.',
          rawJson: jsonString(value),
        });
        continue;
      }
      keys.add(parsedKey);
      validTables[tableName].push(result.data);
    }
    tableSummaries.push({
      tableName,
      sourceCount: source.length,
      validCount: validTables[tableName].length,
      quarantinedCount: invalidCount,
    });
  }

  const warnings: string[] = [];
  if (parsed.databaseSchemaVersion === LEGACY_ROSTERLESS_SCHEMA_VERSION) {
    warnings.push(
      'This backup predates independent Student, roster, Assessment Evidence, canonical Import Center history, and classification mapping presets. Those newer tables will be restored empty.',
    );
  } else if (parsed.databaseSchemaVersion === LEGACY_EVIDENCELESS_SCHEMA_VERSION) {
    warnings.push(
      'This backup predates Assessment Evidence, canonical Import Center history, and classification mapping presets. Those newer tables will be restored empty.',
    );
  } else if (parsed.databaseSchemaVersion === LEGACY_IMPORTLESS_SCHEMA_VERSION) {
    warnings.push(
      'This backup predates canonical Import Center history and classification mapping presets. Those newer tables will be restored empty.',
    );
  } else if (parsed.databaseSchemaVersion === LEGACY_PRESETLESS_SCHEMA_VERSION) {
    warnings.push(
      'This backup predates classification mapping presets. The classificationMappingPresets table will be restored empty.',
    );
  }
  if (parsed.databaseSchemaVersion <= LEGACY_CALENDAR_IDENTITYLESS_SCHEMA_VERSION) {
    warnings.push(
      'This backup predates Calendar Event School Year ownership and stable import identity. Existing Calendar events will remain valid without guessed ownership or provenance.',
    );
  }
  if (quarantined.length > 0) {
    warnings.push(
      `${quarantined.length} record${quarantined.length === 1 ? '' : 's'} will be isolated instead of restored into active tables.`,
    );
  }
  if (parsed.appVersion !== CLASSROOM_APP_VERSION) {
    warnings.push(`The backup was created by Classroom ${parsed.appVersion}.`);
  }

  return {
    format: CLASSROOM_BACKUP_FORMAT,
    databaseSchemaVersion: CLASSROOM_DATABASE_SCHEMA_VERSION,
    appVersion: parsed.appVersion,
    backupId: parsed.backupId,
    exportedAt: parsed.exportedAt,
    integrityHash: parsed.integrityHash,
    validTables,
    tableSummaries,
    quarantined,
    validRecordCount: BACKUP_TABLE_NAMES.reduce(
      (total, tableName) => total + validTables[tableName].length,
      0,
    ),
    quarantineCount: quarantined.length,
    warnings,
  };
}

export function backupFileName(exportedAt: string): string {
  const safeTimestamp = exportedAt.replace(/[:.]/g, '-');
  return `classroom-v20-backup-${safeTimestamp}.json`;
}
