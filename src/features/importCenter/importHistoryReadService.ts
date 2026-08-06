import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  importRunSchema,
  standardImportBatchSchema,
  type ImportRun,
} from '@/domain/models/entities';

import type { ImportHistoryEntry } from './importTypes';

function canonicalEntry(record: ImportRun): ImportHistoryEntry {
  return {
    id: record.id,
    importType: record.importType,
    sourceKind: record.sourceKind,
    sourceLabel: record.sourceLabel,
    worksheetName: record.worksheetName,
    contextId: record.contextId,
    schoolYearId: record.schoolYearId,
    totalRows: record.totalRows,
    createdCount: record.createdCount,
    updatedCount: record.updatedCount,
    removedCount: record.removedCount,
    skippedCount: record.skippedCount,
    reviewCount: record.reviewCount,
    blockedCount: record.blockedCount,
    committedAt: record.committedAt,
    origin: 'canonical',
    record,
  };
}

export class ImportHistoryReadService {
  constructor(private readonly db: ClassroomDatabase = classroomDb) {}

  async list(): Promise<ImportHistoryEntry[]> {
    const [runs, legacyBatches] = await this.db.transaction(
      'r',
      [this.db.importRuns, this.db.standardImportBatches],
      async () =>
        Promise.all([this.db.importRuns.toArray(), this.db.standardImportBatches.toArray()]),
    );

    const entries: ImportHistoryEntry[] = [];
    const canonicalIds = new Set<string>();
    for (const value of runs) {
      const parsed = importRunSchema.safeParse(value);
      if (!parsed.success) continue;
      canonicalIds.add(parsed.data.id);
      entries.push(canonicalEntry(parsed.data));
    }

    for (const value of legacyBatches) {
      const parsed = standardImportBatchSchema.safeParse(value);
      if (!parsed.success || canonicalIds.has(parsed.data.id)) continue;
      entries.push({
        id: parsed.data.id,
        importType: 'standards',
        sourceKind: parsed.data.fileKind,
        sourceLabel: parsed.data.sourceName,
        worksheetName: parsed.data.worksheetName,
        totalRows: parsed.data.totalRows,
        createdCount: parsed.data.createdCount,
        updatedCount: parsed.data.updatedCount,
        removedCount: 0,
        skippedCount: parsed.data.duplicateCount,
        reviewCount: 0,
        blockedCount: 0,
        committedAt: parsed.data.createdAt,
        origin: 'legacy-standard-batch',
      });
    }

    return entries.sort((first, second) => {
      const byDate = second.committedAt.localeCompare(first.committedAt);
      return byDate || first.id.localeCompare(second.id, 'en');
    });
  }
}

export const importHistoryReadService = new ImportHistoryReadService();
