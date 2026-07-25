import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { StandardMutationService } from './standardMutationService';
import type { StandardEditorValues } from './standardModel';

let database: ClassroomDatabase;
const names: string[] = [];
const timestamp = '2026-07-24T01:00:00.000Z';

function values(overrides: Partial<StandardEditorValues> = {}): StandardEditorValues {
  return {
    issuingOrganization: 'Common Core State Standards Initiative',
    frameworkTitle: 'Common Core State Standards for Mathematics',
    jurisdiction: 'United States',
    subject: 'Math',
    gradeBand: '3',
    version: '2010',
    code: '3.NF.A.3',
    statement: 'Explain equivalence of fractions in special cases.',
    parentStandardId: '',
    sortOrder: '0',
    ...overrides,
  };
}

function serviceWithIds(
  ids: string[],
  timestamps: string[] = [timestamp],
): StandardMutationService {
  const fallbackTimestamp = timestamps.at(-1) ?? timestamp;
  return new StandardMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => timestamps.shift() ?? fallbackTimestamp,
  });
}

beforeEach(async () => {
  const name = `standards-${crypto.randomUUID()}`;
  names.push(name);
  database = new ClassroomDatabase(name);
  await database.open();
});

afterEach(async () => {
  database.close();
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('StandardMutationService', () => {
  it('creates a framework-aware Standard and restores it through global Undo/Redo', async () => {
    const archivedTimestamp = '2026-07-24T01:01:00.000Z';
    const service = serviceWithIds(
      ['standard-1', 'log-create', 'log-archive'],
      [timestamp, archivedTimestamp],
    );
    const history = new EditHistoryService(database, {
      now: () => '2026-07-24T01:10:00.000Z',
    });

    const created = await service.create(values());
    expect(created).toMatchObject({
      id: 'standard-1',
      frameworkKey:
        'common core state standards initiative|common core state standards for mathematics|united states|2010',
      normalizedCode: '3.nf.a.3',
      status: 'active',
    });

    await service.archive(created.id);
    expect(await database.standards.get(created.id)).toMatchObject({
      status: 'archived',
      archivedAt: archivedTimestamp,
    });

    await history.undo();
    const restored = await database.standards.get(created.id);
    expect(restored).toMatchObject({
      status: 'active',
    });
    expect(restored?.archivedAt).toBeUndefined();

    await history.redo();
    expect(await database.standards.get(created.id)).toMatchObject({
      status: 'archived',
    });
  });

  it('enforces code uniqueness within a framework but permits the same code in another version', async () => {
    const service = serviceWithIds([
      'standard-1',
      'log-1',
      'standard-duplicate',
      'standard-versioned',
      'log-2',
    ]);
    await service.create(values());

    await expect(service.create(values({ statement: 'Duplicate statement.' }))).rejects.toThrow(
      /same code/,
    );

    const versioned = await service.create(
      values({ version: '2024', statement: 'Revised framework statement.' }),
    );
    expect(versioned.code).toBe('3.NF.A.3');
    expect(versioned.version).toBe('2024');
  });

  it('validates hierarchy membership and prevents cycles', async () => {
    const service = serviceWithIds([
      'parent',
      'parent-log',
      'child',
      'child-log',
      'cross-framework',
      'cross-log',
      'cycle-log',
    ]);
    const parent = await service.create(
      values({ code: '3.NF.A', statement: 'Develop understanding of fractions.' }),
    );
    const child = await service.create(
      values({
        code: '3.NF.A.3',
        parentStandardId: parent.id,
      }),
    );
    expect(child.parentStandardId).toBe(parent.id);

    await expect(
      service.update(
        parent.id,
        values({
          code: '3.NF.A',
          statement: 'Develop understanding of fractions.',
          frameworkTitle: 'Revised framework',
        }),
      ),
    ).rejects.toThrow(/Reassign child Standards/);

    await expect(
      service.create(
        values({
          code: 'OTHER.1',
          frameworkTitle: 'Different framework',
          parentStandardId: parent.id,
        }),
      ),
    ).rejects.toThrow(/same framework version/);

    await expect(
      service.update(
        parent.id,
        values({
          code: '3.NF.A',
          statement: 'Develop understanding of fractions.',
          parentStandardId: child.id,
        }),
      ),
    ).rejects.toThrow(/cycle/);

    await service.archive(parent.id);
    await expect(
      service.create(
        values({
          code: '3.NF.A.4',
          statement: 'Create another child.',
          parentStandardId: parent.id,
        }),
      ),
    ).rejects.toThrow(/Archived Standards cannot be selected/);
  });
});
