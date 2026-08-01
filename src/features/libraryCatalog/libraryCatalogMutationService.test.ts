import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import type { CategoryValue } from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { LibraryCatalogMutationService } from './libraryCatalogMutationService';

let database: ClassroomDatabase;
const timestamp = '2026-07-23T12:00:00.000Z';

const oralLanguage: CategoryValue = {
  id: 'purpose-oral-language',
  familyId: 'purpose-tag',
  name: 'Oral language',
  normalizedName: 'oral language',
  aliases: [],
  normalizedAliases: [],
  sortOrder: 0,
  isDefault: false,
  lifecycleState: 'active',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const retelling: CategoryValue = {
  id: 'focus-retelling',
  familyId: 'focus-tag',
  name: 'Retelling',
  normalizedName: 'retelling',
  aliases: [],
  normalizedAliases: [],
  sortOrder: 0,
  isDefault: false,
  lifecycleState: 'active',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const slideDeck: CategoryValue = {
  id: 'format-slides',
  familyId: 'resource-format',
  name: 'Slide deck',
  normalizedName: 'slide deck',
  aliases: [],
  normalizedAliases: [],
  sortOrder: 0,
  isDefault: false,
  lifecycleState: 'active',
  createdAt: timestamp,
  updatedAt: timestamp,
};

beforeEach(async () => {
  database = new ClassroomDatabase(`library-catalog-${globalThis.crypto.randomUUID()}`);
  await database.open();
  await database.categoryValues.bulkPut([slideDeck, oralLanguage, retelling]);
});

afterEach(async () => {
  await database.delete();
});

function createService(
  ids: string[],
  times: string[] = [timestamp],
): LibraryCatalogMutationService {
  let timeIndex = 0;
  return new LibraryCatalogMutationService(database, {
    createId: () => ids.shift() ?? globalThis.crypto.randomUUID(),
    now: () => {
      const value = times[Math.min(timeIndex, times.length - 1)] ?? timestamp;
      timeIndex += 1;
      return value;
    },
  });
}

describe('LibraryCatalogMutationService', () => {
  it('creates one stable Resource with the existing Resource Format vocabulary', async () => {
    const service = createService(['resource-1', 'assignment-1', '01-create-log']);
    const created = await service.create(
      {
        catalogType: 'resource',
        title: ' Weather slides ',
        description: ' Visual prompts ',
        tags: ['Speaking', ' speaking ', 'Weather'],
        typedFields: {
          catalogType: 'resource',
          sourceLocation: 'Shared drive / Weather',
          usageNotes: 'Open in presentation mode.',
        },
      },
      { 'resource-format': ['format-slides'] },
    );

    expect(created).toMatchObject({
      id: 'resource-1',
      catalogType: 'resource',
      title: 'Weather slides',
      description: 'Visual prompts',
      tags: ['Speaking', 'Weather'],
      status: 'active',
      typedFields: {
        catalogType: 'resource',
        sourceLocation: 'Shared drive / Weather',
        usageNotes: 'Open in presentation mode.',
      },
    });
    expect(await database.categoryAssignments.get('assignment-1')).toMatchObject({
      familyId: 'resource-format',
      categoryValueId: 'format-slides',
      entityType: 'library-item',
      entityId: 'resource-1',
    });
  });

  it('creates an Activity with scoped Purpose and Focus values plus text-only workflow fields', async () => {
    const service = createService([
      'activity-1',
      'assignment-focus',
      'assignment-purpose',
      '01-create-log',
    ]);

    const created = await service.create(
      {
        catalogType: 'activity',
        title: 'Partner retell',
        tags: ['Speaking'],
        typedFields: {
          catalogType: 'activity',
          grouping: 'partners',
          estimatedMinutes: 15,
          directions: 'Partners retell the story in order.',
          materials: 'Picture cards; timer',
          notes: 'Preparation\nSort the picture cards.',
        },
      },
      {
        'purpose-tag': ['purpose-oral-language'],
        'focus-tag': ['focus-retelling'],
        'resource-format': ['format-slides'],
      },
    );

    expect(created.typedFields).toMatchObject({
      catalogType: 'activity',
      grouping: 'partners',
      materials: 'Picture cards; timer',
      notes: 'Preparation\nSort the picture cards.',
    });
    expect(
      (await database.categoryAssignments.where('entityId').equals('activity-1').toArray())
        .map((assignment) => assignment.familyId)
        .sort(),
    ).toEqual(['focus-tag', 'purpose-tag']);
  });

  it('edits metadata without replacing the item identity or type', async () => {
    const service = createService(
      ['activity-1', '01-create-log', '02-update-log'],
      [timestamp, '2026-07-23T12:10:00.000Z'],
    );
    await service.create({
      catalogType: 'activity',
      title: 'Think pair share',
      tags: ['Speaking'],
    });
    const updated = await service.update('activity-1', {
      title: 'Think–pair–share',
      description: 'Structured partner talk.',
      tags: ['Speaking', 'Collaboration'],
      typedFields: {
        catalogType: 'activity',
        grouping: 'partners',
        estimatedMinutes: 12,
        directions: 'Partners take turns explaining one idea.',
      },
    });

    expect(updated).toMatchObject({
      id: 'activity-1',
      catalogType: 'activity',
      title: 'Think–pair–share',
      description: 'Structured partner talk.',
      tags: ['Speaking', 'Collaboration'],
      typedFields: {
        catalogType: 'activity',
        grouping: 'partners',
        estimatedMinutes: 12,
        directions: 'Partners take turns explaining one idea.',
      },
    });

    const history = new EditHistoryService(database, {
      now: () => '2026-07-23T12:20:00.000Z',
    });
    await history.undo();
    expect(await database.libraryItems.get('activity-1')).toMatchObject({
      title: 'Think pair share',
      typedFields: { catalogType: 'activity', grouping: 'flexible' },
    });

    await history.redo();
    expect(await database.libraryItems.get('activity-1')).toMatchObject({
      title: 'Think–pair–share',
      typedFields: { catalogType: 'activity', grouping: 'partners' },
    });
  });

  it('archives and restores the same record', async () => {
    const service = createService([
      'standard-1',
      '01-create-log',
      '02-archive-log',
      '03-restore-log',
    ]);
    await service.create({
      catalogType: 'standard',
      title: 'B.RL.4.1',
      tags: ['Reading'],
    });
    expect(await service.archive('standard-1')).toMatchObject({
      id: 'standard-1',
      status: 'archived',
      archivedAt: timestamp,
    });
    expect(await service.restore('standard-1')).toMatchObject({
      id: 'standard-1',
      status: 'active',
      archivedAt: undefined,
    });
  });

  it('undoes and redoes the Resource and its format assignment atomically', async () => {
    const service = createService(['resource-1', 'assignment-1', '01-create-log']);
    const history = new EditHistoryService(database, {
      now: () => '2026-07-23T13:00:00.000Z',
    });
    await service.create(
      {
        catalogType: 'resource',
        title: 'Shared slides',
      },
      { 'resource-format': ['format-slides'] },
    );

    await history.undo();
    expect(await database.libraryItems.get('resource-1')).toBeUndefined();
    expect(await database.categoryAssignments.get('assignment-1')).toBeUndefined();

    await history.redo();
    expect(await database.libraryItems.get('resource-1')).toBeDefined();
    expect(await database.categoryAssignments.get('assignment-1')).toBeDefined();
  });
});
