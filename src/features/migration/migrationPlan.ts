import {
  calendarEventSchema,
  contextMembershipSchema,
  learnerContextSchema,
  lessonPlanSchema,
  quarantineRecordSchema,
  scheduleBlockSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  taskSchema,
} from '@/domain/models/entities';

export type MigrationPlanAction = 'create' | 'review' | 'defer' | 'quarantine' | 'skip';

export interface MigrationPlanOperation {
  id: string;
  action: MigrationPlanAction;
  legacyStoreKey: string;
  legacyId?: string;
  targetTable: string;
  targetId?: string;
  reason: string;
  targetRecord?: Record<string, unknown>;
  preservedSourceJson?: string;
}

export interface MigrationRollbackOperation {
  id: string;
  action: 'delete';
  targetTable: string;
  targetId: string;
  sourceOperationId: string;
}

export interface MigrationPlanTableSummary {
  targetTable: string;
  createCount: number;
  reviewCount: number;
  deferredCount: number;
  quarantineCount: number;
  skippedCount: number;
  rollbackDeleteCount: number;
}

export interface MigrationPlanSummary {
  createRecords: number;
  reviewRecords: number;
  deferredRecords: number;
  quarantineRecords: number;
  skippedRecords: number;
  rollbackDeletes: number;
  sourceStoreCount: number;
  plannedWriteOperations: number;
}

export interface ReversibleMigrationPlan {
  schemaVersion: 'classroom-v20-migration-plan-v1';
  planId: string;
  status: 'draft';
  sourceFormat: string;
  sourceAppVersion?: string;
  sourceFingerprint: string;
  generatedAt: string;
  operations: MigrationPlanOperation[];
  rollbackOperations: MigrationRollbackOperation[];
  tableSummaries: MigrationPlanTableSummary[];
  summary: MigrationPlanSummary;
  warnings: string[];
  writeOperations: 0;
}

interface LegacyBackupEnvelope {
  format: string;
  appVersion?: string;
  exportedAt?: string;
  storageEncoding?: string;
  data: Record<string, string>;
}

interface PlanOptions {
  now?: string;
}

const supportedFormat = 'classroom-full-local-backup-v18';
const supportedEncoding = 'raw-localStorage-strings';
const academicYearPattern = /(20\d{2})\D+(20\d{2})/;
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T/;

const weekdayNumbers: Record<string, number> = {
  monday: 1,
  mon: 1,
  mo: 1,
  tuesday: 2,
  tue: 2,
  tu: 2,
  wednesday: 3,
  wed: 3,
  we: 3,
  thursday: 4,
  thu: 4,
  th: 4,
  friday: 5,
  fri: 5,
  fr: 5,
  saturday: 6,
  sat: 6,
  sa: 6,
  sunday: 7,
  sun: 7,
  su: 7,
};

function parseEnvelope(rawText: string): LegacyBackupEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!isRecord(parsed) || !isRecord(parsed.data) || typeof parsed.format !== 'string') {
    throw new Error('The selected JSON is not a supported Classroom full-backup envelope.');
  }

  const dataEntries = Object.entries(parsed.data);
  if (!dataEntries.every(([, value]) => typeof value === 'string')) {
    throw new Error('The selected JSON is not a supported Classroom full-backup envelope.');
  }

  return {
    format: parsed.format,
    appVersion: optionalString(parsed.appVersion),
    exportedAt: optionalString(parsed.exportedAt),
    storageEncoding: optionalString(parsed.storageEncoding),
    data: Object.fromEntries(dataEntries) as Record<string, string>,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function stringFrom(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function numberFrom(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function booleanFrom(record: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', 'active', '1'].includes(normalized)) return true;
      if (['false', 'no', 'inactive', '0'].includes(normalized)) return false;
    }
  }
  return fallback;
}

function getLegacyId(record: Record<string, unknown>): string | undefined {
  return stringFrom(record, ['id', 'recordId', 'templateId']);
}

function parseStoreRecords(encoded: string | undefined): {
  records: unknown[];
  malformed: boolean;
} {
  if (encoded === undefined) return { records: [], malformed: false };

  try {
    const decoded: unknown = JSON.parse(encoded);
    return { records: Array.isArray(decoded) ? decoded : [decoded], malformed: false };
  } catch {
    return { records: [], malformed: true };
  }
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !localDatePattern.test(value)) return false;
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

function parseTimestamp(value: unknown, fallback: string): string {
  if (typeof value === 'string' && timestampPattern.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return fallback;
}

function parseMinute(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1439) {
    return value;
  }

  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d{1,4}$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (numeric >= 0 && numeric <= 1439) return numeric;
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59 || hour > 23) return undefined;

  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    if (hour === 12) hour = 0;
    if (meridiem === 'PM') hour += 12;
  }

  return hour * 60 + minute;
}

function parseTimeRange(value: unknown): [number | undefined, number | undefined] {
  if (typeof value !== 'string') return [undefined, undefined];
  const parts = value.split(/\s*[–—-]\s*/);
  if (parts.length !== 2) return [undefined, undefined];
  return [parseMinute(parts[0]), parseMinute(parts[1])];
}

function resolveMinutes(record: Record<string, unknown>): [number | undefined, number | undefined] {
  const directStart = parseMinute(record.startMinute ?? record.start ?? record.startTime);
  const directEnd = parseMinute(record.endMinute ?? record.end ?? record.endTime);
  if (directStart !== undefined || directEnd !== undefined) return [directStart, directEnd];
  return parseTimeRange(record.time);
}

function parseWeekdays(record: Record<string, unknown>): number[] {
  const candidates: unknown[] = [];
  if (Array.isArray(record.days)) candidates.push(...record.days);
  if (Array.isArray(record.weekdays)) candidates.push(...record.weekdays);
  if (typeof record.day === 'string') candidates.push(record.day);
  if (typeof record.repeatDays === 'string') candidates.push(...record.repeatDays.split(/[\s,;]+/));

  const values = candidates
    .map((candidate) => {
      if (typeof candidate === 'number' && candidate >= 1 && candidate <= 7) return candidate;
      if (typeof candidate !== 'string') return undefined;
      return weekdayNumbers[candidate.trim().toLowerCase()];
    })
    .filter((value): value is number => value !== undefined);

  return [...new Set(values)].sort((a, b) => a - b);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return 'null';
  }
}

function normalizeSchoolYearLabel(value: string): string {
  return value.replace(/\s+/g, '').replace(/-/g, '–');
}

function findSchoolYearLabel(
  envelope: LegacyBackupEnvelope,
  recordCollections: unknown[][],
): string {
  const encodedCurrentYear = envelope.data['cos-current-school-year'];
  if (encodedCurrentYear) {
    try {
      const decoded: unknown = JSON.parse(encodedCurrentYear);
      if (typeof decoded === 'string' && academicYearPattern.test(decoded)) {
        return normalizeSchoolYearLabel(decoded);
      }
    } catch {
      // The fallback below checks record-level school-year labels.
    }
  }

  for (const records of recordCollections) {
    for (const record of records) {
      if (!isRecord(record)) continue;
      const label = stringFrom(record, ['schoolYear', 'schoolYearLabel']);
      if (label && academicYearPattern.test(label)) return normalizeSchoolYearLabel(label);
    }
  }

  return '2026–2027';
}

function createSchoolYear(label: string) {
  const match = label.match(academicYearPattern);
  const firstYear = Number(match?.[1] ?? 2026);
  const secondYear = Number(match?.[2] ?? firstYear + 1);
  return schoolYearSchema.parse({
    id: `school-year-${firstYear}-${secondYear}`,
    label,
    startsOn: `${firstYear}-07-01`,
    endsOn: `${secondYear}-06-30`,
    active: true,
  });
}

function createQuarantineTarget(
  planId: string,
  generatedAt: string,
  storeKey: string,
  record: unknown,
  legacyId: string | undefined,
  reason: string,
) {
  const suffix = legacyId ? stableHash(`${storeKey}:${legacyId}`) : stableHash(safeJson(record));
  return quarantineRecordSchema.parse({
    id: `${planId}-quarantine-${suffix}`,
    migrationRunId: planId,
    entityType: 'legacy-record',
    legacyStoreKey: storeKey,
    legacyId,
    reason,
    rawJson: safeJson(record),
    createdAt: generatedAt,
  });
}

export function createReversibleMigrationPlan(
  rawText: string,
  options: PlanOptions = {},
): ReversibleMigrationPlan {
  const envelope = parseEnvelope(rawText);
  const generatedAt = options.now ? new Date(options.now).toISOString() : new Date().toISOString();
  const sourceFingerprint = stableHash(rawText);
  const planId = `migration-plan-${sourceFingerprint}`;
  const warnings: string[] = [];
  const operations: MigrationPlanOperation[] = [];
  const seenTargets = new Map<string, Set<string>>();

  const calendarStore = parseStoreRecords(envelope.data['cos-calendar-events']);
  const scheduleStore = parseStoreRecords(envelope.data['cos-schedule-blocks']);
  const lessonStore = parseStoreRecords(envelope.data['cos-lessons']);
  const taskStore = parseStoreRecords(envelope.data['cos-tasks']);
  const studentStore = parseStoreRecords(envelope.data['cos-students']);
  const classStore = parseStoreRecords(envelope.data['cos-classes']);
  const groupStore = parseStoreRecords(envelope.data['cos-groups']);
  const toolkitStore = parseStoreRecords(envelope.data['cos-toolkit']);
  const standardsStore = parseStoreRecords(envelope.data['cos-standards']);
  const quarantineStore = parseStoreRecords(envelope.data['cos-calendar-quarantine-v19']);
  const templateStoreV19 = parseStoreRecords(envelope.data['cos-planning-templates-v19']);
  const templateStoreLegacy = parseStoreRecords(envelope.data['cos-planning-templates']);

  const usedStoreKeys = [
    'cos-calendar-events',
    'cos-schedule-blocks',
    'cos-lessons',
    'cos-tasks',
    'cos-students',
    'cos-classes',
    'cos-groups',
    'cos-toolkit',
    'cos-standards',
    'cos-calendar-quarantine-v19',
    'cos-planning-templates-v19',
    'cos-planning-templates',
  ].filter((storeKey) => storeKey in envelope.data);

  if (envelope.format !== supportedFormat) {
    warnings.push(`Expected ${supportedFormat}, but found ${envelope.format}.`);
  }
  if (envelope.storageEncoding !== supportedEncoding) {
    warnings.push('The source backup uses an unfamiliar storage encoding.');
  }

  const malformedStores: Array<[string, boolean]> = [
    ['cos-calendar-events', calendarStore.malformed],
    ['cos-schedule-blocks', scheduleStore.malformed],
    ['cos-lessons', lessonStore.malformed],
    ['cos-tasks', taskStore.malformed],
    ['cos-students', studentStore.malformed],
    ['cos-classes', classStore.malformed],
    ['cos-groups', groupStore.malformed],
    ['cos-toolkit', toolkitStore.malformed],
    ['cos-standards', standardsStore.malformed],
    ['cos-calendar-quarantine-v19', quarantineStore.malformed],
    ['cos-planning-templates-v19', templateStoreV19.malformed],
    ['cos-planning-templates', templateStoreLegacy.malformed],
  ];

  function addOperation(
    operation: Omit<MigrationPlanOperation, 'id'>,
    checkDuplicate = false,
  ): void {
    if (checkDuplicate && operation.targetId) {
      const tableIds = seenTargets.get(operation.targetTable) ?? new Set<string>();
      if (tableIds.has(operation.targetId)) {
        operations.push({
          id: `${planId}-operation-${operations.length + 1}`,
          action: 'skip',
          legacyStoreKey: operation.legacyStoreKey,
          legacyId: operation.legacyId,
          targetTable: operation.targetTable,
          targetId: operation.targetId,
          reason: 'Duplicate target identifier in this migration plan.',
        });
        return;
      }
      tableIds.add(operation.targetId);
      seenTargets.set(operation.targetTable, tableIds);
    }

    operations.push({
      id: `${planId}-operation-${operations.length + 1}`,
      ...operation,
    });
  }

  function addSkipped(storeKey: string, record: unknown, reason: string): void {
    addOperation({
      action: 'skip',
      legacyStoreKey: storeKey,
      legacyId: isRecord(record) ? getLegacyId(record) : undefined,
      targetTable: 'No target',
      reason,
    });
  }

  function addQuarantine(storeKey: string, record: unknown, reason: string): void {
    const legacyId = isRecord(record) ? getLegacyId(record) : undefined;
    const target = createQuarantineTarget(planId, generatedAt, storeKey, record, legacyId, reason);
    addOperation(
      {
        action: 'quarantine',
        legacyStoreKey: storeKey,
        legacyId,
        targetTable: 'quarantineRecords',
        targetId: target.id,
        targetRecord: target,
        reason,
      },
      true,
    );
  }

  for (const [storeKey, malformed] of malformedStores) {
    if (malformed) {
      addOperation({
        action: 'skip',
        legacyStoreKey: storeKey,
        targetTable: 'No target',
        reason: 'Stored value is not valid JSON.',
      });
    }
  }

  const schoolYearLabel = findSchoolYearLabel(envelope, [
    studentStore.records,
    classStore.records,
    groupStore.records,
    scheduleStore.records,
  ]);
  const schoolYear = createSchoolYear(schoolYearLabel);
  warnings.push(
    `School-year boundaries for ${schoolYear.label} are provisionally set to ${schoolYear.startsOn} through ${schoolYear.endsOn}; confirm them before commit.`,
  );
  addOperation(
    {
      action: 'create',
      legacyStoreKey: 'cos-current-school-year',
      legacyId: schoolYear.id,
      targetTable: 'schoolYears',
      targetId: schoolYear.id,
      targetRecord: schoolYear,
      reason: 'Create the active school-year record required by learner contexts.',
    },
    true,
  );

  const contextIds = new Set<string>();
  const contextIdByName = new Map<string, string>();

  function mapLearnerContexts(
    storeKey: string,
    records: unknown[],
    kind: 'class' | 'group' | 'individual',
  ): void {
    for (const record of records) {
      if (!isRecord(record)) {
        addSkipped(storeKey, record, 'Legacy record is not a JSON object.');
        continue;
      }

      const legacyId = getLegacyId(record);
      if (!legacyId) {
        addSkipped(storeKey, record, 'Legacy record has no stable identifier.');
        continue;
      }

      const name = stringFrom(record, ['name', 'title', 'groupName', 'className']);
      if (!name) {
        addQuarantine(storeKey, record, 'Learner context has no usable name.');
        continue;
      }

      const archived = booleanFrom(record, ['archived'], false);
      const statusText = stringFrom(record, ['status'])?.toLowerCase();
      const target = learnerContextSchema.safeParse({
        id: legacyId,
        kind,
        name,
        preferredName: stringFrom(record, ['preferredName']),
        schoolYearId: schoolYear.id,
        status: archived || statusText === 'archived' ? 'archived' : 'active',
        notes: stringFrom(record, ['notes', 'goals']),
      });

      if (!target.success) {
        addQuarantine(
          storeKey,
          record,
          'Learner context could not be converted to the v20 schema.',
        );
        continue;
      }

      contextIds.add(target.data.id);
      contextIdByName.set(target.data.name.trim().toLowerCase(), target.data.id);
      addOperation(
        {
          action: 'create',
          legacyStoreKey: storeKey,
          legacyId,
          targetTable: 'learnerContexts',
          targetId: target.data.id,
          targetRecord: target.data,
          reason: `Create a v20 ${kind} learner context.`,
        },
        true,
      );
    }
  }

  mapLearnerContexts('cos-students', studentStore.records, 'individual');
  mapLearnerContexts('cos-classes', classStore.records, 'class');
  mapLearnerContexts('cos-groups', groupStore.records, 'group');

  for (const record of groupStore.records) {
    if (!isRecord(record)) continue;
    const groupId = getLegacyId(record);
    if (!groupId || !contextIds.has(groupId)) continue;

    const rawMemberIds = [record.memberIds, record.studentIds, record.learnerIds, record.members]
      .flatMap((value) => (Array.isArray(value) ? value : []))
      .map((value) => {
        if (typeof value === 'string') return value;
        if (isRecord(value)) return getLegacyId(value);
        return undefined;
      })
      .filter((value): value is string => Boolean(value));

    for (const memberId of [...new Set(rawMemberIds)]) {
      if (!contextIds.has(memberId)) {
        addOperation({
          action: 'review',
          legacyStoreKey: 'cos-groups',
          legacyId: groupId,
          targetTable: 'contextMemberships',
          reason:
            'Group membership references a learner that is not in the current migration plan.',
          preservedSourceJson: safeJson({ groupId, memberId }),
        });
        continue;
      }

      const target = contextMembershipSchema.parse({
        id: `membership-${stableHash(`${groupId}:${memberId}`)}`,
        containerContextId: groupId,
        memberContextId: memberId,
      });
      addOperation(
        {
          action: 'create',
          legacyStoreKey: 'cos-groups',
          legacyId: groupId,
          targetTable: 'contextMemberships',
          targetId: target.id,
          targetRecord: target,
          reason: 'Create a v20 group membership.',
        },
        true,
      );
    }
  }

  const scheduleTimes = new Map<string, { startMinute: number; endMinute: number }>();

  for (const record of scheduleStore.records) {
    const storeKey = 'cos-schedule-blocks';
    if (!isRecord(record)) {
      addSkipped(storeKey, record, 'Legacy record is not a JSON object.');
      continue;
    }

    const legacyId = getLegacyId(record);
    if (!legacyId) {
      addSkipped(storeKey, record, 'Legacy record has no stable identifier.');
      continue;
    }

    const [startMinute, endMinute] = resolveMinutes(record);
    const weekdays = parseWeekdays(record);
    const title = stringFrom(record, ['block', 'title', 'name']);
    const hierarchy = stringFrom(record, ['hierarchyLevel'])?.toLowerCase();
    const category = stringFrom(record, ['category']) ?? 'Teaching';
    const categoryLower = category.toLowerCase();
    const contextName = stringFrom(record, ['contextName', 'className']);
    const explicitContextId = stringFrom(record, ['contextId', 'personId']);
    const contextId =
      explicitContextId ||
      (contextName ? contextIdByName.get(contextName.toLowerCase()) : undefined);
    const archived = stringFrom(record, ['status'])?.toLowerCase() === 'archived';

    const kind =
      hierarchy === 'parent'
        ? 'container'
        : categoryLower.includes('transition')
          ? 'transition'
          : ['routine', 'arrival', 'dismissal', 'lunch', 'recess', 'snack'].some((token) =>
                categoryLower.includes(token),
              )
            ? 'routine'
            : 'teachable';

    const target = scheduleBlockSchema.safeParse({
      id: legacyId,
      parentId: stringFrom(record, ['parentId']),
      contextId,
      title,
      subject: stringFrom(record, ['subject']) ?? '',
      category,
      kind,
      weekdays,
      startMinute,
      endMinute,
      effectiveFrom: isValidDate(record.effectiveStart) ? record.effectiveStart : undefined,
      effectiveTo: isValidDate(record.effectiveEnd) ? record.effectiveEnd : undefined,
      planningEnabled: booleanFrom(record, ['planningEnabled'], kind === 'teachable'),
      bumpEnabled: booleanFrom(record, ['bumpEnabled', 'participatesInBump'], false),
      showInWeek: booleanFrom(record, ['showInWeek'], kind === 'teachable'),
      sortOrder: Math.round(numberFrom(record, ['sortOrder']) ?? 0),
      archivedAt: archived ? generatedAt : undefined,
    });

    if (!target.success) {
      addQuarantine(storeKey, record, 'Schedule block could not be converted to the v20 schema.');
      continue;
    }

    scheduleTimes.set(target.data.id, {
      startMinute: target.data.startMinute,
      endMinute: target.data.endMinute,
    });
    addOperation(
      {
        action: 'create',
        legacyStoreKey: storeKey,
        legacyId,
        targetTable: 'scheduleBlocks',
        targetId: target.data.id,
        targetRecord: target.data,
        reason: 'Create a separate v20 schedule definition.',
      },
      true,
    );
  }

  for (const record of calendarStore.records) {
    const storeKey = 'cos-calendar-events';
    if (!isRecord(record)) {
      addSkipped(storeKey, record, 'Legacy record is not a JSON object.');
      continue;
    }

    const legacyId = getLegacyId(record);
    if (!legacyId) {
      addSkipped(storeKey, record, 'Legacy record has no stable identifier.');
      continue;
    }

    if (!isValidDate(record.date)) {
      addQuarantine(storeKey, record, 'Active calendar record has an invalid date.');
      continue;
    }

    const [startMinute, endMinute] = resolveMinutes(record);
    const endDate = isValidDate(record.endDate) ? record.endDate : undefined;
    const target = calendarEventSchema.safeParse({
      id: legacyId,
      title: stringFrom(record, ['title', 'name']),
      startDate: record.date,
      endDate,
      startMinute,
      endMinute,
      category: stringFrom(record, ['category']) ?? 'Calendar',
      details: stringFrom(record, ['detail', 'details', 'notes']),
      contextId: stringFrom(record, ['contextId', 'learnerId', 'personId']),
      source: stringFrom(record, ['source']),
    });

    if (!target.success) {
      addQuarantine(storeKey, record, 'Calendar event could not be converted to the v20 schema.');
      continue;
    }

    addOperation(
      {
        action: 'create',
        legacyStoreKey: storeKey,
        legacyId,
        targetTable: 'calendarEvents',
        targetId: target.data.id,
        targetRecord: target.data,
        reason: 'Create an active v20 calendar event.',
      },
      true,
    );
  }

  for (const record of taskStore.records) {
    const storeKey = 'cos-tasks';
    if (!isRecord(record)) {
      addSkipped(storeKey, record, 'Legacy record is not a JSON object.');
      continue;
    }

    const legacyId = getLegacyId(record);
    if (!legacyId) {
      addSkipped(storeKey, record, 'Legacy record has no stable identifier.');
      continue;
    }

    const statusText = stringFrom(record, ['status'])?.toLowerCase();
    const completed = statusText === 'completed' || Boolean(record.completedAt);
    const cancelled = statusText === 'cancelled' || statusText === 'canceled';
    const waiting = statusText === 'waiting';
    const status = completed
      ? 'completed'
      : cancelled
        ? 'cancelled'
        : waiting
          ? 'waiting'
          : 'active';
    const scheduledDate = isValidDate(record.scheduledDate)
      ? String(record.scheduledDate)
      : undefined;
    const dueDateValue = record.dueDate ?? record.date;
    const dueDate = isValidDate(dueDateValue) ? String(dueDateValue) : undefined;
    const target = taskSchema.safeParse({
      id: legacyId,
      title: stringFrom(record, ['title', 'task', 'name']),
      notes: stringFrom(record, ['notes', 'details', 'detail']),
      status,
      scheduledDate,
      scheduledMinute: scheduledDate
        ? parseMinute(record.scheduledMinute ?? record.scheduledTime)
        : undefined,
      dueDate,
      dueMinute: dueDate ? parseMinute(record.dueMinute ?? record.dueTime) : undefined,
      contextId: stringFrom(record, ['contextId', 'learnerId', 'personId']),
      linkedEntityType: stringFrom(record, ['linkedEntityType']),
      linkedEntityId: stringFrom(record, ['linkedEntityId']),
      order: Math.round(numberFrom(record, ['order', 'sortOrder']) ?? 0),
      createdAt: parseTimestamp(record.createdAt, generatedAt),
      updatedAt: parseTimestamp(record.updatedAt, generatedAt),
      waitingAt: waiting ? parseTimestamp(record.waitingAt, generatedAt) : undefined,
      completedAt: completed ? parseTimestamp(record.completedAt, generatedAt) : undefined,
      cancelledAt: cancelled
        ? parseTimestamp(record.cancelledAt ?? record.canceledAt, generatedAt)
        : undefined,
    });

    if (!target.success) {
      addQuarantine(storeKey, record, 'Task could not be converted to the v20 schema.');
      continue;
    }

    addOperation(
      {
        action: 'create',
        legacyStoreKey: storeKey,
        legacyId,
        targetTable: 'tasks',
        targetId: target.data.id,
        targetRecord: target.data,
        reason: 'Create the shared v20 task used by Today and Tasks.',
      },
      true,
    );
  }

  for (const record of lessonStore.records) {
    const storeKey = 'cos-lessons';
    if (!isRecord(record)) {
      addSkipped(storeKey, record, 'Legacy record is not a JSON object.');
      continue;
    }

    const legacyId = getLegacyId(record);
    if (!legacyId) {
      addSkipped(storeKey, record, 'Legacy record has no stable identifier.');
      continue;
    }

    const contextName = stringFrom(record, ['contextName', 'personName']);
    const contextId =
      stringFrom(record, ['contextId', 'learnerId', 'personId']) ||
      (contextName ? contextIdByName.get(contextName.toLowerCase()) : undefined);
    const title = stringFrom(record, ['title', 'name']);

    if (!contextId || !title) {
      addOperation({
        action: 'review',
        legacyStoreKey: storeKey,
        legacyId,
        targetTable: 'lessonPlans + sessionOccurrences',
        reason: 'Lesson needs a confirmed teaching context and title before conversion.',
        preservedSourceJson: safeJson(record),
      });
      continue;
    }

    const statusText = stringFrom(record, ['status', 'workflowState'])?.toLowerCase();
    const lessonPlan = lessonPlanSchema.safeParse({
      id: legacyId,
      contextId,
      title,
      subject: stringFrom(record, ['subject']) ?? '',
      workflowState:
        statusText === 'ready' ? 'ready' : statusText === 'archived' ? 'archived' : 'draft',
      seriesId: stringFrom(record, ['seriesId']),
      sequence: numberFrom(record, ['sequence']),
      preferredScheduleBlockId: stringFrom(record, ['scheduleBlockId', 'preferredScheduleBlockId']),
      durationMinutes: numberFrom(record, ['durationMinutes', 'duration']),
      learningTarget: stringFrom(record, ['learningTarget', 'objective', 'goal']),
      notes: stringFrom(record, ['notes']),
      createdAt: parseTimestamp(record.createdAt, generatedAt),
      updatedAt: parseTimestamp(record.updatedAt, generatedAt),
    });

    if (!lessonPlan.success) {
      addOperation({
        action: 'review',
        legacyStoreKey: storeKey,
        legacyId,
        targetTable: 'lessonPlans + sessionOccurrences',
        reason: 'Lesson fields need review before they satisfy the v20 planning schema.',
        preservedSourceJson: safeJson(record),
      });
      continue;
    }

    addOperation(
      {
        action: 'create',
        legacyStoreKey: storeKey,
        legacyId,
        targetTable: 'lessonPlans',
        targetId: lessonPlan.data.id,
        targetRecord: lessonPlan.data,
        reason: 'Create a v20 lesson plan.',
      },
      true,
    );

    if (isValidDate(record.date)) {
      const scheduleBlockId = stringFrom(record, ['scheduleBlockId', 'preferredScheduleBlockId']);
      const inheritedTimes = scheduleBlockId ? scheduleTimes.get(scheduleBlockId) : undefined;
      let [startMinute, endMinute] = resolveMinutes(record);
      startMinute ??= inheritedTimes?.startMinute;
      endMinute ??= inheritedTimes?.endMinute;

      const session = sessionOccurrenceSchema.safeParse({
        id: `${legacyId}-session`,
        lessonPlanId: lessonPlan.data.id,
        contextId,
        scheduleBlockId,
        date: record.date,
        startMinute,
        endMinute,
        deliveryState:
          statusText === 'completed'
            ? 'completed'
            : statusText === 'cancelled'
              ? 'cancelled'
              : 'scheduled',
        completedAt:
          statusText === 'completed' ? parseTimestamp(record.completedAt, generatedAt) : undefined,
      });

      if (session.success) {
        addOperation(
          {
            action: 'create',
            legacyStoreKey: storeKey,
            legacyId,
            targetTable: 'sessionOccurrences',
            targetId: session.data.id,
            targetRecord: session.data,
            reason: 'Create the dated session occurrence linked to the lesson plan.',
          },
          true,
        );
      } else {
        addOperation({
          action: 'review',
          legacyStoreKey: storeKey,
          legacyId,
          targetTable: 'sessionOccurrences',
          reason: 'Dated lesson needs confirmed start and end times before becoming a session.',
          preservedSourceJson: safeJson(record),
        });
      }
    }
  }

  for (const [storeKey, records, targetTable, reason] of [
    [
      'cos-toolkit',
      toolkitStore.records,
      'Library tables (future phase)',
      'Preserve this activity until the Library schema exists.',
    ],
    [
      'cos-standards',
      standardsStore.records,
      'Standards tables (future phase)',
      'Preserve this standard until the Standards schema exists.',
    ],
  ] as const) {
    for (const record of records) {
      if (!isRecord(record)) {
        addSkipped(storeKey, record, 'Legacy record is not a JSON object.');
        continue;
      }
      const legacyId = getLegacyId(record);
      if (!legacyId) {
        addSkipped(storeKey, record, 'Legacy record has no stable identifier.');
        continue;
      }
      addOperation({
        action: 'defer',
        legacyStoreKey: storeKey,
        legacyId,
        targetTable,
        reason,
        preservedSourceJson: safeJson(record),
      });
    }
  }

  for (const [storeKey, records] of [
    ['cos-planning-templates-v19', templateStoreV19.records],
    ['cos-planning-templates', templateStoreLegacy.records],
  ] as const) {
    for (const record of records) {
      if (!isRecord(record)) {
        addSkipped(storeKey, record, 'Legacy record is not a JSON object.');
        continue;
      }
      const legacyId = getLegacyId(record);
      if (!legacyId) {
        addSkipped(storeKey, record, 'Legacy record has no stable identifier.');
        continue;
      }
      addOperation({
        action: 'review',
        legacyStoreKey: storeKey,
        legacyId,
        targetTable: 'lessonSeries + lessonPlans + Lesson Flow',
        reason: 'Template requires Lesson Flow and reusable-template schema review before commit.',
        preservedSourceJson: safeJson(record),
      });
    }
  }

  for (const record of quarantineStore.records) {
    const storeKey = 'cos-calendar-quarantine-v19';
    if (!isRecord(record)) {
      addSkipped(storeKey, record, 'Legacy quarantine record is not a JSON object.');
      continue;
    }
    addQuarantine(
      storeKey,
      record,
      stringFrom(record, ['quarantineReason']) ??
        'Preserve the legacy calendar record outside the active calendar.',
    );
  }

  const rollbackOperations: MigrationRollbackOperation[] = operations
    .filter(
      (operation): operation is MigrationPlanOperation & { targetId: string } =>
        (operation.action === 'create' || operation.action === 'quarantine') &&
        typeof operation.targetId === 'string',
    )
    .map((operation, index) => ({
      id: `${planId}-rollback-${index + 1}`,
      action: 'delete',
      targetTable: operation.targetTable,
      targetId: operation.targetId,
      sourceOperationId: operation.id,
    }));

  const targetTables = [...new Set(operations.map((operation) => operation.targetTable))].sort();
  const tableSummaries = targetTables.map((targetTable) => {
    const tableOperations = operations.filter((operation) => operation.targetTable === targetTable);
    return {
      targetTable,
      createCount: tableOperations.filter((operation) => operation.action === 'create').length,
      reviewCount: tableOperations.filter((operation) => operation.action === 'review').length,
      deferredCount: tableOperations.filter((operation) => operation.action === 'defer').length,
      quarantineCount: tableOperations.filter((operation) => operation.action === 'quarantine')
        .length,
      skippedCount: tableOperations.filter((operation) => operation.action === 'skip').length,
      rollbackDeleteCount: rollbackOperations.filter(
        (operation) => operation.targetTable === targetTable,
      ).length,
    };
  });

  const summary: MigrationPlanSummary = {
    createRecords: operations.filter((operation) => operation.action === 'create').length,
    reviewRecords: operations.filter((operation) => operation.action === 'review').length,
    deferredRecords: operations.filter((operation) => operation.action === 'defer').length,
    quarantineRecords: operations.filter((operation) => operation.action === 'quarantine').length,
    skippedRecords: operations.filter((operation) => operation.action === 'skip').length,
    rollbackDeletes: rollbackOperations.length,
    sourceStoreCount: usedStoreKeys.length,
    plannedWriteOperations: operations.filter(
      (operation) => operation.action === 'create' || operation.action === 'quarantine',
    ).length,
  };

  return {
    schemaVersion: 'classroom-v20-migration-plan-v1',
    planId,
    status: 'draft',
    sourceFormat: envelope.format,
    sourceAppVersion: envelope.appVersion,
    sourceFingerprint,
    generatedAt,
    operations,
    rollbackOperations,
    tableSummaries,
    summary,
    warnings,
    writeOperations: 0,
  };
}
