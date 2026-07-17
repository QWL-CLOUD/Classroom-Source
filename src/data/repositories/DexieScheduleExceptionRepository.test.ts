import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { DexieClassroomRepository } from '@/data/repositories/DexieClassroomRepository';
import { scheduleExceptionSchema } from '@/domain/models/entities';

describe('Schedule Exception repository reads', () => {
  let database: ClassroomDatabase;
  let repository: DexieClassroomRepository;

  beforeEach(async () => {
    database = new ClassroomDatabase(`schedule-exception-repository-${crypto.randomUUID()}`);
    repository = new DexieClassroomRepository(database);
    await database.open();
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('returns only exceptions in the inclusive range with deterministic ordering', async () => {
    await database.scheduleExceptions.bulkPut([
      scheduleExceptionSchema.parse({
        id: 'later',
        date: '2026-07-18',
        scheduleBlockId: 'block',
        action: 'cancel',
      }),
      scheduleExceptionSchema.parse({
        id: 'first',
        date: '2026-07-17',
        scheduleBlockId: 'block',
        action: 'modify',
      }),
      scheduleExceptionSchema.parse({
        id: 'outside',
        date: '2026-07-20',
        scheduleBlockId: 'block',
        action: 'cancel',
      }),
    ]);

    await expect(
      repository.listScheduleExceptionsForRange({
        startDate: '2026-07-17',
        endDate: '2026-07-18',
      }),
    ).resolves.toMatchObject([{ id: 'first' }, { id: 'later' }]);
  });
});
