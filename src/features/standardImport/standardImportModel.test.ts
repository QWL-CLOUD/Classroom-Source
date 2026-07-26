import { describe, expect, it } from 'vitest';

import { standardSchema, type Standard } from '@/domain/models/entities';

import {
  buildStandardImportPreview,
  buildStandardImportTable,
  createEmptyColumnMapping,
  suggestStandardImportMapping,
  type StandardImportSourceValues,
} from './standardImportModel';

const now = '2026-07-25T16:00:00.000Z';
const source: StandardImportSourceValues = {
  sourceName: 'Reviewed mathematics framework',
  issuingOrganization: 'Synthetic Standards Office',
  frameworkTitle: 'Synthetic Mathematics Standards',
  jurisdiction: 'Synthetic scope',
  version: '2026',
  importNote: 'Reviewed locally.',
};

function existing(overrides: Partial<Standard> = {}): Standard {
  return standardSchema.parse({
    id: 'existing-1',
    issuingOrganization: source.issuingOrganization,
    frameworkTitle: source.frameworkTitle,
    jurisdiction: source.jurisdiction,
    subject: 'Mathematics',
    gradeBand: '3',
    version: source.version,
    frameworkKey: 'synthetic standards office|synthetic mathematics standards|synthetic scope|2026',
    code: '3.NF.A.1',
    normalizedCode: '3.nf.a.1',
    statement: 'Understand a fraction.',
    sortOrder: 4,
    status: 'active',
    sourceName: source.sourceName,
    importNote: source.importNote,
    importBatchId: 'prior-batch',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  });
}

function dependencies() {
  const ids = ['batch-1', 'row-1', 'row-2', 'row-3', 'row-4'];
  return { createId: () => ids.shift() ?? crypto.randomUUID(), now: () => now };
}

describe('Standards reviewed import preview', () => {
  it('classifies new, exact duplicate, reviewed update, and invalid rows without writes', () => {
    const table = buildStandardImportTable([
      ['Code', 'Statement', 'Subject', 'Grade'],
      ['3.NF.A.1', 'Understand a fraction.', 'Mathematics', '3'],
      ['3.NF.A.2', 'Represent fractions on a number line.', 'Mathematics', '3'],
      ['3.NF.A.3', 'Explain equivalent fractions.', 'Mathematics', '3'],
      ['', 'Missing code.', 'Mathematics', '3'],
    ]);
    const mapping = suggestStandardImportMapping(table.headers);
    const current = existing();
    const updated = existing({
      id: 'existing-update',
      code: '3.NF.A.3',
      normalizedCode: '3.nf.a.3',
      statement: 'Old statement.',
    });

    const preview = buildStandardImportPreview(
      { table, mapping, source, existingStandards: [current, updated] },
      dependencies(),
    );

    expect(preview.rows.map((row) => row.classification)).toEqual([
      'exact-duplicate',
      'valid-new',
      'reviewed-update',
      'invalid',
    ]);
    expect(preview.rows[2]?.reason).toContain('statement');
    expect(preview.summary).toMatchObject({
      total: 4,
      newCount: 1,
      duplicateCount: 1,
      updateCount: 1,
      invalidCount: 1,
    });
    expect(preview.canCommit).toBe(false);
  });

  it('preserves existing optional values when update columns are not mapped', () => {
    const table = buildStandardImportTable([
      ['Code', 'Statement'],
      ['3.NF.A.1', 'Revised fraction statement.'],
    ]);
    const mapping = suggestStandardImportMapping(table.headers);
    const current = existing({ parentStandardId: 'parent-1', status: 'archived', archivedAt: now });
    const parent = existing({
      id: 'parent-1',
      code: '3.NF.A',
      normalizedCode: '3.nf.a',
      statement: 'Fractions domain.',
      subject: undefined,
      gradeBand: undefined,
      sortOrder: 0,
      parentStandardId: undefined,
      status: 'active',
      archivedAt: undefined,
    });

    const preview = buildStandardImportPreview(
      { table, mapping, source, existingStandards: [parent, current] },
      dependencies(),
    );

    expect(preview.rows[0]).toMatchObject({ classification: 'reviewed-update' });
    expect(preview.rows[0]?.plannedStandard).toMatchObject({
      subject: 'Mathematics',
      gradeBand: '3',
      parentStandardId: 'parent-1',
      status: 'archived',
      sortOrder: 4,
    });
  });

  it('blocks unresolved parents, duplicate identities, and hierarchy cycles', () => {
    const table = buildStandardImportTable([
      ['Code', 'Statement', 'Parent code'],
      ['A', 'Parent A.', 'B'],
      ['B', 'Parent B.', 'A'],
      ['C', 'Child C.', 'MISSING'],
      ['D', 'First D.', ''],
      ['D', 'Second D.', ''],
    ]);
    const mapping = suggestStandardImportMapping(table.headers);
    const preview = buildStandardImportPreview(
      { table, mapping, source, existingStandards: [] },
      dependencies(),
    );

    expect(preview.rows.map((row) => row.classification)).toEqual([
      'hierarchy-conflict',
      'hierarchy-conflict',
      'unresolved-parent',
      'identity-conflict',
      'identity-conflict',
    ]);
    expect(preview.canCommit).toBe(false);
  });

  it('requires explicit code and statement mappings', () => {
    const table = buildStandardImportTable([['Code'], ['A']]);
    expect(() =>
      buildStandardImportPreview(
        { table, mapping: createEmptyColumnMapping(), source, existingStandards: [] },
        dependencies(),
      ),
    ).toThrow(/Map both/);
  });
});
