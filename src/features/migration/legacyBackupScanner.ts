import { z } from 'zod';

const legacyBackupEnvelopeSchema = z.object({
  format: z.string().min(1),
  appVersion: z.string().optional(),
  exportedAt: z.string().optional(),
  storageEncoding: z.string().optional(),
  data: z.record(z.string(), z.string()),
});

type LegacyBackupEnvelope = z.infer<typeof legacyBackupEnvelopeSchema>;

export type MigrationDecision = 'ready' | 'review' | 'deferred' | 'quarantine' | 'invalid';

interface LegacyStoreDefinition {
  storeName: string;
  label: string;
  target: string;
  decision: Exclude<MigrationDecision, 'invalid'>;
  note: string;
  validateCalendarDates?: boolean;
}

export interface LegacyStoreReport {
  storeName: string;
  label: string;
  target: string;
  decision: MigrationDecision;
  note: string;
  rawRecordCount: number;
  parsedRecordCount: number;
  validRecordCount: number;
  skippedRecordCount: number;
  duplicateIdCount: number;
  missingIdCount: number;
  warnings: string[];
}

export interface LegacyBackupSummary {
  readyRecords: number;
  reviewRecords: number;
  deferredRecords: number;
  quarantinedRecords: number;
  skippedRecords: number;
  invalidStores: number;
  duplicateIds: number;
  missingIds: number;
}

export interface LegacyBackupScan {
  format: string;
  appVersion?: string;
  exportedAt?: string;
  storageEncoding?: string;
  storeCount: number;
  recognizedStores: string[];
  unrecognizedStoreCount: number;
  storeReports: LegacyStoreReport[];
  summary: LegacyBackupSummary;
  warnings: string[];
  writeOperations: 0;
}

const expectedFormat = 'classroom-full-local-backup-v18';
const expectedStorageEncoding = 'raw-localStorage-strings';

const legacyStoreDefinitions: LegacyStoreDefinition[] = [
  {
    storeName: 'cos-calendar-events',
    label: 'Calendar events',
    target: 'calendarEvents',
    decision: 'ready',
    note: 'Active events with valid ISO dates can be mapped to the v20 calendar.',
    validateCalendarDates: true,
  },
  {
    storeName: 'cos-schedule-blocks',
    label: 'Schedule blocks',
    target: 'scheduleBlocks',
    decision: 'ready',
    note: 'Fixed schedule definitions remain separate from lesson plans and sessions.',
  },
  {
    storeName: 'cos-lessons',
    label: 'Lessons and planning',
    target: 'lessonPlans + sessionOccurrences',
    decision: 'review',
    note: 'Each record must be classified as an unscheduled plan, dated session, or series member.',
  },
  {
    storeName: 'cos-tasks',
    label: 'Tasks',
    target: 'tasks',
    decision: 'ready',
    note: 'Today and Tasks will continue to use the same v20 task records.',
  },
  {
    storeName: 'cos-students',
    label: 'Individual learners',
    target: 'learnerContexts',
    decision: 'ready',
    note: 'Records will become learner contexts with kind “individual”.',
  },
  {
    storeName: 'cos-classes',
    label: 'Classes',
    target: 'learnerContexts',
    decision: 'ready',
    note: 'Records will become learner contexts with kind “class”.',
  },
  {
    storeName: 'cos-groups',
    label: 'Groups',
    target: 'learnerContexts + contextMemberships',
    decision: 'ready',
    note: 'Records will become group contexts; memberships will be resolved during commit preview.',
  },
  {
    storeName: 'cos-toolkit',
    label: 'Toolkit activities',
    target: 'Library tables (future phase)',
    decision: 'deferred',
    note: 'Records are counted and preserved, but will not be imported until the Library schema exists.',
  },
  {
    storeName: 'cos-standards',
    label: 'Local standards',
    target: 'Standards tables (future phase)',
    decision: 'deferred',
    note: 'Records are counted and preserved, but will not be imported until the Standards schema exists.',
  },
  {
    storeName: 'cos-planning-templates-v19',
    label: 'Planning templates',
    target: 'lessonPlans + lessonSeries + Lesson Flow',
    decision: 'review',
    note: 'Templates require a separate classification pass before becoming reusable v20 planning records.',
  },
  {
    storeName: 'cos-planning-templates',
    label: 'Planning templates (legacy alias)',
    target: 'lessonPlans + lessonSeries + Lesson Flow',
    decision: 'review',
    note: 'Older template keys remain supported and require the same classification pass.',
  },
  {
    storeName: 'cos-calendar-quarantine-v19',
    label: 'Calendar quarantine',
    target: 'quarantineRecords',
    decision: 'quarantine',
    note: 'These records will remain isolated and will never re-enter the active calendar automatically.',
  },
];

function parseEnvelope(rawText: string): LegacyBackupEnvelope {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  const result = legacyBackupEnvelopeSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error('The selected JSON is not a supported Classroom full-backup envelope.');
  }

  return result.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecordIdentifier(record: Record<string, unknown>): string | null {
  const candidates = [record.id, record.recordId, record.templateId];
  const identifier = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  );
  return identifier?.trim() ?? null;
}

function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function scanLegacyStore(
  definition: LegacyStoreDefinition,
  encodedStore: string,
): LegacyStoreReport {
  let decoded: unknown;

  try {
    decoded = JSON.parse(encodedStore);
  } catch {
    return {
      ...definition,
      decision: 'invalid',
      rawRecordCount: 0,
      parsedRecordCount: 0,
      validRecordCount: 0,
      skippedRecordCount: 0,
      duplicateIdCount: 0,
      missingIdCount: 0,
      warnings: ['Stored value is not valid JSON.'],
    };
  }

  const warnings: string[] = [];
  const rawRecords = Array.isArray(decoded) ? decoded : [decoded];
  if (!Array.isArray(decoded)) {
    warnings.push('Stored value is not an array; it was inspected as one record.');
  }

  const objectRecords = rawRecords.filter(isRecord);
  const seenIds = new Set<string>();
  let missingIdCount = 0;
  let duplicateIdCount = 0;
  let invalidCalendarDateCount = 0;
  let validRecordCount = 0;

  for (const record of objectRecords) {
    const identifier = getRecordIdentifier(record);
    if (!identifier) {
      missingIdCount += 1;
      continue;
    }

    if (seenIds.has(identifier)) {
      duplicateIdCount += 1;
      continue;
    }

    if (definition.validateCalendarDates && !isValidIsoDate(record.date)) {
      invalidCalendarDateCount += 1;
      continue;
    }

    seenIds.add(identifier);
    validRecordCount += 1;
  }

  const primitiveRecordCount = rawRecords.length - objectRecords.length;
  const skippedRecordCount = rawRecords.length - validRecordCount;

  if (primitiveRecordCount > 0) {
    warnings.push(`${primitiveRecordCount} record(s) are not JSON objects.`);
  }
  if (missingIdCount > 0) {
    warnings.push(`${missingIdCount} record(s) do not have a stable identifier.`);
  }
  if (duplicateIdCount > 0) {
    warnings.push(`${duplicateIdCount} duplicate identifier(s) require review.`);
  }
  if (invalidCalendarDateCount > 0) {
    warnings.push(`${invalidCalendarDateCount} active calendar record(s) have invalid ISO dates.`);
  }

  return {
    ...definition,
    rawRecordCount: rawRecords.length,
    parsedRecordCount: objectRecords.length,
    validRecordCount,
    skippedRecordCount,
    duplicateIdCount,
    missingIdCount,
    warnings,
  };
}

function summarizeStoreReports(storeReports: LegacyStoreReport[]): LegacyBackupSummary {
  const totalForDecision = (decision: MigrationDecision) =>
    storeReports
      .filter((report) => report.decision === decision)
      .reduce((total, report) => total + report.validRecordCount, 0);

  return {
    readyRecords: totalForDecision('ready'),
    reviewRecords: totalForDecision('review'),
    deferredRecords: totalForDecision('deferred'),
    quarantinedRecords: totalForDecision('quarantine'),
    skippedRecords: storeReports.reduce((total, report) => total + report.skippedRecordCount, 0),
    invalidStores: storeReports.filter((report) => report.decision === 'invalid').length,
    duplicateIds: storeReports.reduce((total, report) => total + report.duplicateIdCount, 0),
    missingIds: storeReports.reduce((total, report) => total + report.missingIdCount, 0),
  };
}

export function scanLegacyBackupJson(rawText: string): LegacyBackupScan {
  const envelope = parseEnvelope(rawText);
  const storeNames = Object.keys(envelope.data);
  const storeReports = legacyStoreDefinitions
    .filter((definition) => storeNames.includes(definition.storeName))
    .map((definition) => scanLegacyStore(definition, envelope.data[definition.storeName] ?? ''));
  const recognizedStores = storeReports.map((report) => report.storeName);
  const unrecognizedStoreCount = Math.max(0, storeNames.length - recognizedStores.length);
  const warnings: string[] = [];

  if (envelope.format !== expectedFormat) {
    warnings.push(`Expected ${expectedFormat}, but found ${envelope.format}.`);
  }
  if (envelope.storageEncoding !== expectedStorageEncoding) {
    warnings.push('This backup uses an unfamiliar storage encoding.');
  }
  if (recognizedStores.length === 0) {
    warnings.push('No known Classroom legacy stores were found.');
  }
  if (unrecognizedStoreCount > 0) {
    warnings.push(
      `${unrecognizedStoreCount} additional store key(s) are outside this preview and will remain untouched.`,
    );
  }

  return {
    format: envelope.format,
    appVersion: envelope.appVersion,
    exportedAt: envelope.exportedAt,
    storageEncoding: envelope.storageEncoding,
    storeCount: storeNames.length,
    recognizedStores,
    unrecognizedStoreCount,
    storeReports,
    summary: summarizeStoreReports(storeReports),
    warnings,
    writeOperations: 0,
  };
}
