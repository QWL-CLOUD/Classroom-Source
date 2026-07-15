import type { Table } from 'dexie';
import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { appSettingSchema } from '@/domain/models/entities';
import type { LegacyBackupScan } from './legacyBackupScanner';
import type {
  MigrationExecutionManifest,
  MigrationExecutionResult,
  WritableMigrationTable,
} from './migrationExecutor';
import type { ReversibleMigrationPlan } from './migrationPlan';

export type MigrationAcceptanceStatus = 'passed' | 'passed-with-follow-up' | 'failed';
export type MigrationAcceptanceCheckStatus = 'pass' | 'follow-up' | 'fail';

export interface LegacyStorageSnapshot {
  keyCount: number;
  fingerprint: string;
}

export interface MigrationAcceptanceCheck {
  id: string;
  label: string;
  status: MigrationAcceptanceCheckStatus;
  detail: string;
}

export interface MigrationAcceptanceTableResult {
  targetTable: string;
  plannedWrites: number;
  inserted: number;
  reused: number;
  verified: number;
  currentTableCount?: number;
  status: MigrationAcceptanceCheckStatus;
}

export interface MigrationAcceptanceSummary {
  sourceStoreKeys: number;
  recognizedStores: number;
  outsidePreview: number;
  plannedCreates: number;
  plannedReviews: number;
  deferredRecords: number;
  quarantinedRecords: number;
  skippedRecords: number;
  plannedWrites: number;
  insertedRecords: number;
  reusedRecords: number;
  verifiedRecords: number;
  restorePointEntries: number;
  rollbackDeletes: number;
  followUpItems: number;
  legacyStorageKeyCount: number;
}

export interface MigrationAcceptancePrivacy {
  containsRecordNames: false;
  containsRecordContent: false;
  storesSourceFile: false;
}

export interface MigrationAcceptanceReport {
  schemaVersion: 'classroom-v20-migration-acceptance-v1';
  reportId: string;
  runId: string;
  planId: string;
  sourceFingerprint: string;
  sourceFormat: string;
  sourceAppVersion?: string;
  generatedAt: string;
  status: MigrationAcceptanceStatus;
  summary: MigrationAcceptanceSummary;
  checks: MigrationAcceptanceCheck[];
  tables: MigrationAcceptanceTableResult[];
  followUp: string[];
  privacy: MigrationAcceptancePrivacy;
  integrityHash: string;
}

interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

interface AcceptanceOptions {
  now?: string;
  legacyStorageBefore?: LegacyStorageSnapshot;
  legacyStorageAfter?: LegacyStorageSnapshot;
}

const acceptanceSettingPrefix = 'migrationAcceptance:';
const acceptanceLatestSettingKey = 'migrationAcceptance:latest';

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

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function asTimestamp(value: string | undefined): string {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) throw new Error('Migration acceptance time is invalid.');
  return parsed.toISOString();
}

function parseExecutionManifest(summaryJson: string): MigrationExecutionManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(summaryJson);
  } catch {
    throw new Error('The migration recovery manifest is not readable.');
  }

  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 'classroom-v20-migration-execution-v1' ||
    typeof parsed.runId !== 'string' ||
    typeof parsed.planId !== 'string' ||
    typeof parsed.sourceFingerprint !== 'string' ||
    !Array.isArray(parsed.inserted) ||
    !Array.isArray(parsed.reused) ||
    !Array.isArray(parsed.restorePoint) ||
    !isRecord(parsed.tableCounts)
  ) {
    throw new Error('The migration recovery manifest is not supported.');
  }

  return parsed as unknown as MigrationExecutionManifest;
}

function tableFor(
  db: ClassroomDatabase,
  tableName: WritableMigrationTable,
): Table<Record<string, unknown>, string> {
  return db.table(tableName) as Table<Record<string, unknown>, string>;
}

function resultStatus(
  checks: MigrationAcceptanceCheck[],
  followUp: string[],
): MigrationAcceptanceStatus {
  if (checks.some((check) => check.status === 'fail')) return 'failed';
  if (followUp.length > 0 || checks.some((check) => check.status === 'follow-up')) {
    return 'passed-with-follow-up';
  }
  return 'passed';
}

function followUpItems(scan: LegacyBackupScan, plan: ReversibleMigrationPlan): string[] {
  const items: string[] = [];

  if (plan.summary.reviewRecords > 0) {
    items.push(`${plan.summary.reviewRecords} planning record(s) still require classification.`);
  }
  if (plan.summary.deferredRecords > 0) {
    items.push(`${plan.summary.deferredRecords} record(s) are preserved for future v20 schemas.`);
  }
  if (plan.summary.quarantineRecords > 0) {
    items.push(`${plan.summary.quarantineRecords} quarantined record(s) require manual review.`);
  }
  if (plan.summary.skippedRecords > 0) {
    items.push(
      `${plan.summary.skippedRecords} record(s) were skipped and remain in the source backup.`,
    );
  }
  if (scan.summary.invalidStores > 0) {
    items.push(`${scan.summary.invalidStores} recognized store(s) contain unreadable JSON.`);
  }
  if (scan.unrecognizedStoreCount > 0) {
    items.push(
      `${scan.unrecognizedStoreCount} legacy store key(s) remain outside this migration phase.`,
    );
  }
  if (plan.warnings.length > 0) {
    items.push(...plan.warnings.map((warning) => `Plan warning: ${warning}`));
  }

  return [...new Set(items)];
}

export function captureLegacyStorageSnapshot(storage?: StorageLike): LegacyStorageSnapshot {
  const activeStorage =
    storage ?? (typeof window !== 'undefined' ? (window.localStorage as StorageLike) : undefined);
  if (!activeStorage) {
    return { keyCount: 0, fingerprint: stableHash('[]') };
  }

  const entries: Array<[string, string]> = [];
  for (let index = 0; index < activeStorage.length; index += 1) {
    const key = activeStorage.key(index);
    if (!key?.startsWith('cos-')) continue;
    entries.push([key, activeStorage.getItem(key) ?? '']);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));

  return {
    keyCount: entries.length,
    fingerprint: stableHash(JSON.stringify(entries)),
  };
}

export async function generateMigrationAcceptanceReport(
  scan: LegacyBackupScan,
  plan: ReversibleMigrationPlan,
  execution: MigrationExecutionResult,
  db: ClassroomDatabase = classroomDb,
  options: AcceptanceOptions = {},
): Promise<MigrationAcceptanceReport> {
  if (execution.status !== 'committed') {
    throw new Error('Only a committed migration can receive a completion report.');
  }

  const run = await db.migrationRuns.get(execution.runId);
  if (!run || run.status !== 'committed') {
    throw new Error('The committed migration run could not be found.');
  }

  const manifest = parseExecutionManifest(run.summaryJson);
  const generatedAt = asTimestamp(options.now);
  const allTargets = [...manifest.inserted, ...manifest.reused];
  const verificationByTable = new Map<string, number>();
  let verifiedRecords = 0;

  for (const target of allTargets) {
    const stored = await tableFor(db, target.targetTable).get(target.targetId);
    if (stored !== undefined && canonicalJson(stored) === target.recordJson) {
      verifiedRecords += 1;
      verificationByTable.set(
        target.targetTable,
        (verificationByTable.get(target.targetTable) ?? 0) + 1,
      );
    }
  }

  const insertedByTable = new Map<string, number>();
  const reusedByTable = new Map<string, number>();
  for (const target of manifest.inserted) {
    insertedByTable.set(target.targetTable, (insertedByTable.get(target.targetTable) ?? 0) + 1);
  }
  for (const target of manifest.reused) {
    reusedByTable.set(target.targetTable, (reusedByTable.get(target.targetTable) ?? 0) + 1);
  }

  const sourceMatches =
    plan.sourceFingerprint === execution.sourceFingerprint &&
    manifest.sourceFingerprint === execution.sourceFingerprint &&
    manifest.planId === plan.planId;
  const plannedWritesMatch = allTargets.length === plan.summary.plannedWriteOperations;
  const rollbackCoverage =
    plan.summary.rollbackDeletes === plan.summary.plannedWriteOperations &&
    manifest.restorePoint.length === plan.summary.plannedWriteOperations;
  const recordsVerified = verifiedRecords === allTargets.length;
  const legacyStorageChecked = Boolean(options.legacyStorageBefore && options.legacyStorageAfter);
  const legacyStorageUnchanged =
    !legacyStorageChecked ||
    (options.legacyStorageBefore?.fingerprint === options.legacyStorageAfter?.fingerprint &&
      options.legacyStorageBefore?.keyCount === options.legacyStorageAfter?.keyCount);
  const nonActiveRecordsExcluded =
    plan.summary.plannedWriteOperations ===
    plan.summary.createRecords + plan.summary.quarantineRecords;
  const quarantineTargets = allTargets.filter(
    (target) => target.targetTable === 'quarantineRecords',
  );
  const quarantineIsolated =
    quarantineTargets.length === plan.summary.quarantineRecords &&
    (verificationByTable.get('quarantineRecords') ?? 0) === quarantineTargets.length;

  const checks: MigrationAcceptanceCheck[] = [
    {
      id: 'source-fingerprint',
      label: 'Source fingerprint matches',
      status: sourceMatches ? 'pass' : 'fail',
      detail: sourceMatches
        ? 'The scan, plan, execution run, and recovery manifest reference the same private backup.'
        : 'The source fingerprint or plan identifier does not match the committed run.',
    },
    {
      id: 'planned-write-count',
      label: 'Planned writes match committed targets',
      status: plannedWritesMatch ? 'pass' : 'fail',
      detail: `${allTargets.length} committed or reused target(s) were compared with ${plan.summary.plannedWriteOperations} planned write(s).`,
    },
    {
      id: 'post-commit-verification',
      label: 'Post-commit records verified',
      status: recordsVerified ? 'pass' : 'fail',
      detail: `${verifiedRecords} of ${allTargets.length} committed or reused record(s) match the recovery manifest.`,
    },
    {
      id: 'restore-point',
      label: 'Restore point and rollback coverage complete',
      status: rollbackCoverage ? 'pass' : 'fail',
      detail: `${manifest.restorePoint.length} restore-point entry or entries cover ${plan.summary.plannedWriteOperations} planned write(s).`,
    },
    {
      id: 'legacy-storage',
      label: 'Legacy browser storage unchanged',
      status: legacyStorageUnchanged ? (legacyStorageChecked ? 'pass' : 'follow-up') : 'fail',
      detail: legacyStorageChecked
        ? legacyStorageUnchanged
          ? `${options.legacyStorageAfter?.keyCount ?? 0} legacy cos-* key(s) have the same fingerprint as before commit.`
          : 'One or more legacy cos-* keys changed after the migration commit.'
        : 'No before-and-after legacy storage snapshot was available; reload the same backup to repeat this check.',
    },
    {
      id: 'non-active-excluded',
      label: 'Review and deferred records stayed inactive',
      status: nonActiveRecordsExcluded ? 'pass' : 'fail',
      detail: nonActiveRecordsExcluded
        ? 'Only create and quarantine operations were eligible for active database writes.'
        : 'The plan contains an unexpected write outside create or quarantine operations.',
    },
    {
      id: 'quarantine-isolation',
      label: 'Quarantine remained isolated',
      status: quarantineIsolated ? 'pass' : 'fail',
      detail: `${plan.summary.quarantineRecords} quarantine operation(s) remain outside active calendar collections.`,
    },
    {
      id: 'privacy',
      label: 'Completion report is privacy-safe',
      status: 'pass',
      detail:
        'The report contains counts, table names, timestamps, and fingerprints only; it stores no record names or source content.',
    },
  ];

  const tables: MigrationAcceptanceTableResult[] = plan.tableSummaries.map((summary) => {
    const inserted = insertedByTable.get(summary.targetTable) ?? 0;
    const reused = reusedByTable.get(summary.targetTable) ?? 0;
    const verified = verificationByTable.get(summary.targetTable) ?? 0;
    const plannedWrites = summary.createCount + summary.quarantineCount;
    const activeTable = manifest.tableCounts[summary.targetTable];
    const status: MigrationAcceptanceCheckStatus =
      plannedWrites === 0
        ? summary.reviewCount + summary.deferredCount + summary.skippedCount > 0
          ? 'follow-up'
          : 'pass'
        : inserted + reused === plannedWrites && verified === plannedWrites
          ? 'pass'
          : 'fail';

    return {
      targetTable: summary.targetTable,
      plannedWrites,
      inserted,
      reused,
      verified,
      currentTableCount: typeof activeTable === 'number' ? activeTable : undefined,
      status,
    };
  });

  const followUp = followUpItems(scan, plan);
  const status = resultStatus(checks, followUp);
  const summary: MigrationAcceptanceSummary = {
    sourceStoreKeys: scan.storeCount,
    recognizedStores: scan.recognizedStores.length,
    outsidePreview: scan.unrecognizedStoreCount,
    plannedCreates: plan.summary.createRecords,
    plannedReviews: plan.summary.reviewRecords,
    deferredRecords: plan.summary.deferredRecords,
    quarantinedRecords: plan.summary.quarantineRecords,
    skippedRecords: plan.summary.skippedRecords,
    plannedWrites: plan.summary.plannedWriteOperations,
    insertedRecords: manifest.inserted.length,
    reusedRecords: manifest.reused.length,
    verifiedRecords,
    restorePointEntries: manifest.restorePoint.length,
    rollbackDeletes: plan.summary.rollbackDeletes,
    followUpItems: followUp.length,
    legacyStorageKeyCount:
      options.legacyStorageAfter?.keyCount ?? options.legacyStorageBefore?.keyCount ?? 0,
  };

  const reportWithoutHash = {
    schemaVersion: 'classroom-v20-migration-acceptance-v1' as const,
    reportId: `migration-acceptance-${execution.runId}-${stableHash(generatedAt)}`,
    runId: execution.runId,
    planId: plan.planId,
    sourceFingerprint: execution.sourceFingerprint,
    sourceFormat: manifest.sourceFormat,
    sourceAppVersion: manifest.sourceAppVersion,
    generatedAt,
    status,
    summary,
    checks,
    tables,
    followUp,
    privacy: {
      containsRecordNames: false as const,
      containsRecordContent: false as const,
      storesSourceFile: false as const,
    },
  };

  return {
    ...reportWithoutHash,
    integrityHash: stableHash(canonicalJson(reportWithoutHash)),
  };
}

export async function saveMigrationAcceptanceReport(
  report: MigrationAcceptanceReport,
  db: ClassroomDatabase = classroomDb,
): Promise<void> {
  const valueJson = JSON.stringify(report);
  const setting = appSettingSchema.parse({
    key: `${acceptanceSettingPrefix}${report.runId}`,
    valueJson,
    updatedAt: report.generatedAt,
  });
  const latest = appSettingSchema.parse({
    key: acceptanceLatestSettingKey,
    valueJson,
    updatedAt: report.generatedAt,
  });

  await db.transaction('rw', db.appSettings, async () => {
    await db.appSettings.put(setting);
    await db.appSettings.put(latest);
  });
}

function parseAcceptanceReport(valueJson: string): MigrationAcceptanceReport | null {
  try {
    const parsed: unknown = JSON.parse(valueJson);
    if (
      !isRecord(parsed) ||
      parsed.schemaVersion !== 'classroom-v20-migration-acceptance-v1' ||
      typeof parsed.reportId !== 'string' ||
      typeof parsed.runId !== 'string' ||
      typeof parsed.integrityHash !== 'string' ||
      !isRecord(parsed.summary) ||
      !Array.isArray(parsed.checks) ||
      !Array.isArray(parsed.tables) ||
      !Array.isArray(parsed.followUp)
    ) {
      return null;
    }
    const report = parsed as unknown as MigrationAcceptanceReport;
    const { integrityHash, ...reportWithoutHash } = report;
    if (stableHash(canonicalJson(reportWithoutHash)) !== integrityHash) return null;
    return report;
  } catch {
    return null;
  }
}

export async function getMigrationAcceptanceReport(
  runId: string,
  db: ClassroomDatabase = classroomDb,
): Promise<MigrationAcceptanceReport | null> {
  const setting = await db.appSettings.get(`${acceptanceSettingPrefix}${runId}`);
  return setting ? parseAcceptanceReport(setting.valueJson) : null;
}

export async function getLatestMigrationAcceptanceReport(
  db: ClassroomDatabase = classroomDb,
): Promise<MigrationAcceptanceReport | null> {
  const setting = await db.appSettings.get(acceptanceLatestSettingKey);
  return setting ? parseAcceptanceReport(setting.valueJson) : null;
}

export function migrationAcceptanceJson(report: MigrationAcceptanceReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function migrationAcceptanceMarkdown(report: MigrationAcceptanceReport): string {
  const statusLabel = report.status
    .split('-')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
  const lines = [
    '# Classroom v20 Migration Completion Report',
    '',
    `- Status: **${statusLabel}**`,
    `- Generated: ${report.generatedAt}`,
    `- Migration run: \`${report.runId}\``,
    `- Plan: \`${report.planId}\``,
    `- Source fingerprint: \`${report.sourceFingerprint}\``,
    `- Report integrity hash: \`${report.integrityHash}\``,
    '',
    '## Summary',
    '',
    `- Source store keys: ${report.summary.sourceStoreKeys}`,
    `- Recognized stores: ${report.summary.recognizedStores}`,
    `- Planned writes: ${report.summary.plannedWrites}`,
    `- Inserted records: ${report.summary.insertedRecords}`,
    `- Reused records: ${report.summary.reusedRecords}`,
    `- Verified records: ${report.summary.verifiedRecords}`,
    `- Restore-point entries: ${report.summary.restorePointEntries}`,
    `- Follow-up items: ${report.summary.followUpItems}`,
    '',
    '## Acceptance checks',
    '',
    ...report.checks.map(
      (check) =>
        `- ${check.status === 'pass' ? 'PASS' : check.status.toUpperCase()}: ${check.label} — ${check.detail}`,
    ),
    '',
    '## Target tables',
    '',
    '| Target | Planned | Inserted | Reused | Verified | Current total | Result |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...report.tables.map(
      (table) =>
        `| ${table.targetTable} | ${table.plannedWrites} | ${table.inserted} | ${table.reused} | ${table.verified} | ${table.currentTableCount ?? '—'} | ${table.status} |`,
    ),
    '',
    '## Follow-up',
    '',
    ...(report.followUp.length > 0 ? report.followUp.map((item) => `- ${item}`) : ['- None.']),
    '',
    '## Privacy',
    '',
    '- No record names are included.',
    '- No record content is included.',
    '- The private source backup is not stored in this report.',
    '',
  ];

  return lines.join('\n');
}
