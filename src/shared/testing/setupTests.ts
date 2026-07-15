import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { classroomDb } from '@/data/db/ClassroomDatabase';

afterEach(async () => {
  cleanup();
  classroomDb.close();
  await Dexie.delete('classroom-v20');
});
