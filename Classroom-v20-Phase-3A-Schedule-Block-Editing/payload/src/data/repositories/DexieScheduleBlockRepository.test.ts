import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { DexieClassroomRepository } from '@/data/repositories/DexieClassroomRepository';
import { scheduleBlockSchema } from '@/domain/models/entities';

let database: ClassroomDatabase;
let repository: DexieClassroomRepository;

beforeEach(async () => {
  database = new ClassroomDatabase(`phase-3a-repository-${crypto.randomUUID()}`);
  await database.open();
  repository = new DexieClassroomRepository(database);
});

afterEach(async () => {
  await database.delete();
});

describe('Schedule Block repository editing reads', () => {
  it('lists every active block in stable schedule order and excludes archived records', async () => {
    await database.scheduleBlocks.bulkPut([
      scheduleBlockSchema.parse({
        id: 'later',
        title: 'Later',
        kind: 'teachable',
        weekdays: [7],
        startMinute: 600,
        endMinute: 660,
      }),
      scheduleBlockSchema.parse({
        id: 'first',
        title: 'First',
        kind: 'routine',
        weekdays: [1],
        startMinute: 480,
        endMinute: 510,
      }),
      scheduleBlockSchema.parse({
        id: 'archived',
        title: 'Archived',
        kind: 'routine',
        weekdays: [1],
        startMinute: 470,
        endMinute: 480,
        archivedAt: '2026-07-16T20:00:00.000Z',
      }),
    ]);

    await expect(repository.listScheduleBlocks()).resolves.toMatchObject([
      { id: 'first' },
      { id: 'later' },
    ]);
  });

  it('keeps range reads aligned with the active editor list', async () => {
    await database.scheduleBlocks.put(
      scheduleBlockSchema.parse({
        id: 'summer',
        title: 'Summer block',
        kind: 'teachable',
        weekdays: [5, 6, 7],
        startMinute: 600,
        endMinute: 660,
        effectiveFrom: '2026-07-01',
        effectiveTo: '2026-07-31',
      }),
    );

    expect((await repository.listScheduleBlocks()).map((block) => block.id)).toEqual(['summer']);
    expect(
      (
        await repository.listScheduleBlocksForRange({
          startDate: '2026-07-13',
          endDate: '2026-07-19',
        })
      ).map((block) => block.id),
    ).toEqual(['summer']);
  });
});
