import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';
import { SchoolYearMutationService } from '@/features/schoolYears/schoolYearMutationService';

let database: ClassroomDatabase;
let ids: string[];
let service: SchoolYearMutationService;
let history: EditHistoryService;

beforeEach(async () => {
  database = new ClassroomDatabase(`school-year-lifecycle-${crypto.randomUUID()}`);
  await database.open();
  ids = [];
  service = new SchoolYearMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => '2026-07-21T16:00:00.000Z',
  });
  history = new EditHistoryService(database, { now: () => '2026-07-21T17:00:00.000Z' });
});

afterEach(async () => {
  await database.delete();
});

describe('SchoolYearMutationService', () => {
  it('creates a first active school year and supports global undo and redo', async () => {
    ids = ['year-1', 'log-1'];
    await service.create(
      { label: '2026–2027', startsOn: '2026-07-01', endsOn: '2027-06-30' },
      { makeActive: true },
    );

    expect(await database.schoolYears.get('year-1')).toMatchObject({
      active: true,
      lifecycleState: 'active',
    });

    await history.undo();
    expect(await database.schoolYears.get('year-1')).toBeUndefined();
    await history.redo();
    expect(await database.schoolYears.get('year-1')).toMatchObject({ active: true });
  });

  it('sets exactly one active school year without moving learner contexts', async () => {
    await database.schoolYears.bulkPut([
      {
        id: 'year-1',
        label: '2026–2027',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
        lifecycleState: 'active',
      },
      {
        id: 'year-2',
        label: '2027–2028',
        startsOn: '2027-07-01',
        endsOn: '2028-06-30',
        active: false,
        lifecycleState: 'active',
      },
    ]);
    await database.learnerContexts.put({
      id: 'class-1',
      kind: 'class',
      name: 'Existing class',
      schoolYearId: 'year-1',
      status: 'active',
    });
    ids = ['log-active'];

    await service.setActive('year-2');

    expect((await database.schoolYears.toArray()).filter((year) => year.active)).toEqual([
      expect.objectContaining({ id: 'year-2' }),
    ]);
    expect(await database.learnerContexts.get('class-1')).toMatchObject({
      schoolYearId: 'year-1',
    });

    await history.undo();
    expect((await database.schoolYears.toArray()).filter((year) => year.active)).toEqual([
      expect.objectContaining({ id: 'year-1' }),
    ]);
  });

  it('archives linked historical years but blocks active-year archive and linked deletion', async () => {
    await database.schoolYears.bulkPut([
      {
        id: 'active-year',
        label: '2026–2027',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
        lifecycleState: 'active',
      },
      {
        id: 'historical-year',
        label: '2025–2026',
        startsOn: '2025-07-01',
        endsOn: '2026-06-30',
        active: false,
        lifecycleState: 'active',
      },
    ]);
    await database.learnerContexts.put({
      id: 'historical-class',
      kind: 'class',
      name: 'Historical class',
      schoolYearId: 'historical-year',
      status: 'archived',
    });

    await expect(service.archive('active-year')).rejects.toThrow(/Set another school year/);
    ids = ['log-archive'];
    await service.archive('historical-year');
    expect(await database.schoolYears.get('historical-year')).toMatchObject({
      lifecycleState: 'archived',
      active: false,
    });
    await expect(service.delete('historical-year')).rejects.toThrow(/learner context/);
  });

  it('deletes only empty inactive years and restores them through undo', async () => {
    await database.schoolYears.put({
      id: 'empty-year',
      label: '2024–2025',
      startsOn: '2024-07-01',
      endsOn: '2025-06-30',
      active: false,
      lifecycleState: 'archived',
      archivedAt: '2026-07-21T16:00:00.000Z',
    });
    ids = ['log-delete'];
    await service.delete('empty-year');
    expect(await database.schoolYears.get('empty-year')).toBeUndefined();
    await history.undo();
    expect(await database.schoolYears.get('empty-year')).toMatchObject({
      lifecycleState: 'archived',
    });
  });

  it('rejects duplicate labels and invalid date ranges', async () => {
    await database.schoolYears.put({
      id: 'year-1',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
      lifecycleState: 'active',
    });

    await expect(
      service.create({
        label: ' 2026–2027 ',
        startsOn: '2027-07-01',
        endsOn: '2028-06-30',
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      service.create({
        label: 'Invalid',
        startsOn: '2027-07-01',
        endsOn: '2027-06-30',
      }),
    ).rejects.toThrow(/end date/);
  });
});
