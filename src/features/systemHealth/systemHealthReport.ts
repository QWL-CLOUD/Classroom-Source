import type { Table } from 'dexie';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  BACKUP_TABLE_NAMES,
  CLASSROOM_APP_VERSION,
  CLASSROOM_DATABASE_SCHEMA_VERSION,
  type BackupTableName,
} from '@/features/backupRecovery/backupFormat';

export const SYSTEM_HEALTH_REPORT_FORMAT = 'classroom-v20-system-health-v1' as const;
export const SYSTEM_HEALTH_REPORT_VERSION = 1 as const;

export type BrowserStorageStatus = 'persistent' | 'best-effort' | 'unsupported' | 'unavailable';

export interface BrowserStorageSnapshot {
  status: BrowserStorageStatus;
  persisted: boolean | null;
  canRequestPersistence: boolean;
  usageBytes?: number;
  quotaBytes?: number;
  detail: string;
}

export interface StorageManagerLike {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

export interface SystemHealthReportPrivacy {
  containsRecordContent: false;
  containsNames: false;
  containsIds: false;
  containsFilePaths: false;
  containsRawImportedData: false;
}

export interface SystemHealthReport {
  format: typeof SYSTEM_HEALTH_REPORT_FORMAT;
  reportVersion: typeof SYSTEM_HEALTH_REPORT_VERSION;
  generatedAt: string;
  appVersion: string;
  database: {
    actualSchemaVersion: number;
    expectedSchemaVersion: number;
    ready: boolean;
  };
  schoolYears: {
    activeCount: number;
  };
  portableTableCounts: Record<BackupTableName, number>;
  internalTableCounts: {
    backupSnapshots: number;
    restoreRuns: number;
    restoreQuarantineRecords: number;
  };
  reviewTotals: {
    migrationRuns: number;
    migrationQuarantineRecords: number;
    restoreRuns: number;
    restoreQuarantineRecords: number;
  };
  browserStorage: BrowserStorageSnapshot;
  privacy: SystemHealthReportPrivacy;
}

export interface CreateSystemHealthReportOptions {
  generatedAt?: string;
  storage?: BrowserStorageSnapshot;
  actualSchemaVersion?: number;
}

function currentStorageManager(): StorageManagerLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  try {
    return navigator.storage as StorageManagerLike | undefined;
  } catch {
    return undefined;
  }
}

function storageSize(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

export async function inspectBrowserStorage(
  storage: StorageManagerLike | null | undefined = currentStorageManager(),
): Promise<BrowserStorageSnapshot> {
  if (!storage) {
    return {
      status: 'unsupported',
      persisted: null,
      canRequestPersistence: false,
      detail: 'This browser does not expose the Storage Manager API.',
    };
  }

  try {
    const [persisted, estimate] = await Promise.all([
      storage.persisted ? storage.persisted() : Promise.resolve(null),
      storage.estimate
        ? storage.estimate()
        : Promise.resolve<{ usage?: number; quota?: number }>({}),
    ]);
    const isPersistent = persisted === true;
    return {
      status: isPersistent ? 'persistent' : 'best-effort',
      persisted,
      canRequestPersistence: !isPersistent && typeof storage.persist === 'function',
      usageBytes: storageSize(estimate.usage),
      quotaBytes: storageSize(estimate.quota),
      detail: isPersistent
        ? 'The browser reports persistent local storage for this origin.'
        : 'The browser reports best-effort local storage. Portable backups remain the primary safety mechanism.',
    };
  } catch {
    return {
      status: 'unavailable',
      persisted: null,
      canRequestPersistence: false,
      detail: 'Browser storage status could not be read. Classroom data may still be available.',
    };
  }
}

export async function requestBrowserStoragePersistence(
  storage: StorageManagerLike | null | undefined = currentStorageManager(),
): Promise<BrowserStorageSnapshot> {
  if (!storage?.persist) return inspectBrowserStorage(storage);
  try {
    await storage.persist();
  } catch {
    return {
      status: 'unavailable',
      persisted: null,
      canRequestPersistence: false,
      detail: 'The browser could not complete the persistence request.',
    };
  }
  return inspectBrowserStorage(storage);
}

function tableFor(db: ClassroomDatabase, tableName: BackupTableName): Table<unknown, string> {
  return db.table(tableName) as Table<unknown, string>;
}

export async function createSystemHealthReport(
  db: ClassroomDatabase = classroomDb,
  options: CreateSystemHealthReportOptions = {},
): Promise<SystemHealthReport> {
  const storage = options.storage ?? (await inspectBrowserStorage());
  const portableTables = BACKUP_TABLE_NAMES.map((tableName) => tableFor(db, tableName));
  const transactionTables = [
    ...portableTables,
    db.backupSnapshots,
    db.restoreRuns,
    db.restoreQuarantineRecords,
  ];

  const counts = await db.transaction('r', transactionTables, async () => {
    const portableEntries = await Promise.all(
      BACKUP_TABLE_NAMES.map(
        async (tableName) => [tableName, await tableFor(db, tableName).count()] as const,
      ),
    );
    const [activeSchoolYearCount, backupSnapshots, restoreRuns, restoreQuarantineRecords] =
      await Promise.all([
        db.schoolYears.filter((schoolYear) => schoolYear.active).count(),
        db.backupSnapshots.count(),
        db.restoreRuns.count(),
        db.restoreQuarantineRecords.count(),
      ]);
    return {
      portableTableCounts: Object.fromEntries(portableEntries) as Record<BackupTableName, number>,
      activeSchoolYearCount,
      backupSnapshots,
      restoreRuns,
      restoreQuarantineRecords,
    };
  });

  const actualSchemaVersion = options.actualSchemaVersion ?? db.verno;
  return {
    format: SYSTEM_HEALTH_REPORT_FORMAT,
    reportVersion: SYSTEM_HEALTH_REPORT_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    appVersion: CLASSROOM_APP_VERSION,
    database: {
      actualSchemaVersion,
      expectedSchemaVersion: CLASSROOM_DATABASE_SCHEMA_VERSION,
      ready: actualSchemaVersion === CLASSROOM_DATABASE_SCHEMA_VERSION,
    },
    schoolYears: {
      activeCount: counts.activeSchoolYearCount,
    },
    portableTableCounts: counts.portableTableCounts,
    internalTableCounts: {
      backupSnapshots: counts.backupSnapshots,
      restoreRuns: counts.restoreRuns,
      restoreQuarantineRecords: counts.restoreQuarantineRecords,
    },
    reviewTotals: {
      migrationRuns: counts.portableTableCounts.migrationRuns,
      migrationQuarantineRecords: counts.portableTableCounts.quarantineRecords,
      restoreRuns: counts.restoreRuns,
      restoreQuarantineRecords: counts.restoreQuarantineRecords,
    },
    browserStorage: storage,
    privacy: {
      containsRecordContent: false,
      containsNames: false,
      containsIds: false,
      containsFilePaths: false,
      containsRawImportedData: false,
    },
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])]),
  );
}

export function serializeSystemHealthReport(report: SystemHealthReport): string {
  return `${JSON.stringify(canonicalize(report), null, 2)}\n`;
}

export function systemHealthReportFileName(generatedAt: string): string {
  const compact = generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `classroom-v20-system-health-${compact}.json`;
}
