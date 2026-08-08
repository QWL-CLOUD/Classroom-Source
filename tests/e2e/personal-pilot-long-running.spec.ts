import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const timestamp = '2026-08-08T12:00:00.000Z';

type SeedTables = Record<string, unknown[]>;

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

function buildLongRunningDataset(): SeedTables {
  const tables: SeedTables = {
    schoolYears: [],
    learnerContexts: [],
    studentRecords: [],
    rosterMemberships: [],
    lessonPlans: [],
    sessionOccurrences: [],
    teachingReflections: [],
    assessmentEvidence: [],
    tasks: [],
    calendarEvents: [],
    libraryItems: [],
    standards: [],
  };

  for (let studentIndex = 1; studentIndex <= 24; studentIndex += 1) {
    tables.studentRecords!.push({
      id: `volume-student-${padded(studentIndex)}`,
      name: `Volume Student ${padded(studentIndex)}`,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  for (let standardIndex = 1; standardIndex <= 12; standardIndex += 1) {
    tables.standards!.push({
      id: `volume-standard-${padded(standardIndex)}`,
      issuingOrganization: 'Synthetic Pilot Standards',
      frameworkTitle: 'Synthetic Long-running Framework',
      frameworkKey: 'synthetic::pilot-volume',
      code: `VOL.${standardIndex}`,
      normalizedCode: `vol.${standardIndex}`,
      statement: `Synthetic pilot standard ${standardIndex}.`,
      sortOrder: standardIndex,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  for (let itemIndex = 1; itemIndex <= 15; itemIndex += 1) {
    const assessment = itemIndex <= 8;
    tables.libraryItems!.push({
      id: `volume-library-${padded(itemIndex)}`,
      catalogType: assessment ? 'assessment' : 'activity',
      title: `Volume ${assessment ? 'Assessment' : 'Activity'} ${padded(itemIndex)}`,
      tags: ['Synthetic pilot'],
      typedFields: assessment
        ? { catalogType: 'assessment', assessmentKind: 'formative' }
        : { catalogType: 'activity', grouping: 'small-group' },
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  for (const startYear of [2024, 2025, 2026]) {
    const yearId = `volume-year-${startYear}`;
    const current = startYear === 2026;
    const classId = `volume-class-${startYear}`;
    const groupId = `volume-group-${startYear}`;

    tables.schoolYears!.push({
      id: yearId,
      label: `Volume ${startYear}–${startYear + 1}`,
      startsOn: `${startYear}-07-01`,
      endsOn: `${startYear + 1}-06-30`,
      active: current,
      lifecycleState: current ? 'active' : 'archived',
      ...(current ? {} : { archivedAt: timestamp }),
    });
    tables.learnerContexts!.push(
      {
        id: classId,
        kind: 'class',
        name: `Volume Class ${startYear}`,
        schoolYearId: yearId,
        status: current ? 'active' : 'archived',
      },
      {
        id: groupId,
        kind: 'group',
        name: `Volume Group ${startYear}`,
        schoolYearId: yearId,
        status: current ? 'active' : 'archived',
      },
    );

    for (let studentIndex = 1; studentIndex <= 24; studentIndex += 1) {
      const studentId = `volume-student-${padded(studentIndex)}`;
      tables.rosterMemberships!.push({
        id: `volume-membership-class-${startYear}-${padded(studentIndex)}`,
        contextId: classId,
        studentId,
        createdAt: timestamp,
      });
      if (studentIndex <= 8) {
        tables.rosterMemberships!.push({
          id: `volume-membership-group-${startYear}-${padded(studentIndex)}`,
          contextId: groupId,
          studentId,
          createdAt: timestamp,
        });
      }
    }

    for (let planIndex = 0; planIndex < 20; planIndex += 1) {
      tables.lessonPlans!.push({
        id: `volume-plan-${startYear}-${padded(planIndex + 1)}`,
        contextId: planIndex % 4 === 0 ? groupId : classId,
        title: `Volume Lesson ${startYear}-${padded(planIndex + 1)}`,
        subject: 'Synthetic long-running pilot',
        workflowState: 'ready',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    for (let sessionIndex = 0; sessionIndex < 60; sessionIndex += 1) {
      const day = (sessionIndex % 28) + 1;
      const month = sessionIndex < 28 ? 8 : sessionIndex < 56 ? 9 : 10;
      const planIndex = sessionIndex % 20;
      const sessionId = `volume-session-${startYear}-${padded(sessionIndex + 1)}`;
      const completed = sessionIndex % 3 !== 2;
      const contextId = planIndex % 4 === 0 ? groupId : classId;
      const reflectionId =
        completed && sessionIndex % 5 === 0
          ? `volume-reflection-${startYear}-${padded(sessionIndex + 1)}`
          : undefined;
      tables.sessionOccurrences!.push({
        id: sessionId,
        lessonPlanId: `volume-plan-${startYear}-${padded(planIndex + 1)}`,
        contextId,
        date: `${startYear}-${padded(month)}-${padded(day)}`,
        startMinute: 480 + (sessionIndex % 6) * 60,
        endMinute: 530 + (sessionIndex % 6) * 60,
        deliveryState: completed ? 'completed' : 'scheduled',
        ...(completed ? { completedAt: timestamp } : {}),
        ...(reflectionId ? { reflectionId } : {}),
      });

      if (reflectionId) {
        tables.teachingReflections!.push({
          id: reflectionId,
          sessionOccurrenceId: sessionId,
          schoolYearId: yearId,
          contextId,
          lessonPlanId: `volume-plan-${startYear}-${padded(planIndex + 1)}`,
          occurredOn: `${startYear}-${padded(month)}-${padded(day)}`,
          whatWorked: `Synthetic reflection ${sessionIndex + 1} remained teacher-authored.`,
          sourceSnapshots: {
            context: {
              kind: contextId === groupId ? 'group' : 'class',
              name:
                contextId === groupId ? `Volume Group ${startYear}` : `Volume Class ${startYear}`,
            },
            lessonPlan: { title: `Volume Lesson ${startYear}-${padded(planIndex + 1)}` },
            sessionOccurrence: {
              date: `${startYear}-${padded(month)}-${padded(day)}`,
              startMinute: 480 + (sessionIndex % 6) * 60,
              endMinute: 530 + (sessionIndex % 6) * 60,
            },
          },
          status: 'active',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }

    for (let studentIndex = 1; studentIndex <= 24; studentIndex += 1) {
      const studentId = `volume-student-${padded(studentIndex)}`;
      for (let evidenceIndex = 0; evidenceIndex < 8; evidenceIndex += 1) {
        const kindIndex = evidenceIndex % 3;
        const sessionIndex = (studentIndex * 7 + evidenceIndex) % 60;
        const planIndex = sessionIndex % 20;
        const day = evidenceIndex + 1;
        const contextId = planIndex % 4 === 0 ? groupId : classId;
        const base = {
          id: `volume-evidence-${startYear}-${padded(studentIndex)}-${padded(evidenceIndex + 1)}`,
          studentId,
          schoolYearId: yearId,
          occurredOn: `${startYear}-08-${padded(day)}`,
          title: `Volume evidence ${studentIndex}-${evidenceIndex + 1}-${startYear}`,
          contextId,
          lessonPlanId: `volume-plan-${startYear}-${padded(planIndex + 1)}`,
          sessionOccurrenceId: `volume-session-${startYear}-${padded(sessionIndex + 1)}`,
          assessmentId: `volume-library-${padded((evidenceIndex % 8) + 1)}`,
          standardIds: [`volume-standard-${padded((evidenceIndex % 12) + 1)}`],
          status: evidenceIndex === 7 ? 'archived' : 'active',
          ...(evidenceIndex === 7 ? { archivedAt: timestamp } : {}),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        tables.assessmentEvidence!.push(
          kindIndex === 0
            ? { ...base, kind: 'score', score: { value: (evidenceIndex % 4) + 1, maximum: 4 } }
            : kindIndex === 1
              ? {
                  ...base,
                  kind: 'proficiency',
                  proficiency: {
                    label: evidenceIndex % 2 === 0 ? 'Developing' : 'Meeting',
                    scaleKey: 'volume-reading',
                    scaleLabel: 'Synthetic reading continuum',
                  },
                }
              : {
                  ...base,
                  kind: 'observation',
                  observation: {
                    text: `Synthetic observation ${studentIndex}-${evidenceIndex + 1}.`,
                  },
                },
        );
      }
    }

    for (let taskIndex = 1; taskIndex <= 40; taskIndex += 1) {
      tables.tasks!.push({
        id: `volume-task-${startYear}-${padded(taskIndex)}`,
        title: `Volume Task ${startYear}-${padded(taskIndex)}`,
        status: taskIndex % 5 === 0 ? 'completed' : 'active',
        scheduledDate: `${startYear}-08-${padded((taskIndex % 28) + 1)}`,
        contextId: taskIndex % 4 === 0 ? groupId : classId,
        order: taskIndex,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    for (let eventIndex = 1; eventIndex <= 30; eventIndex += 1) {
      tables.calendarEvents!.push({
        id: `volume-event-${startYear}-${padded(eventIndex)}`,
        title: `Volume Calendar Event ${startYear}-${padded(eventIndex)}`,
        startDate: `${startYear}-08-${padded((eventIndex % 28) + 1)}`,
        schoolYearId: yearId,
        category: 'Synthetic Pilot',
      });
    }
  }

  return tables;
}

async function waitForSchema(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const databases = await indexedDB.databases();
    return databases.some(
      (database) => database.name === 'classroom-v20' && (database.version ?? 0) >= 17,
    );
  });
}

async function seedLongRunningDataset(page: Page): Promise<void> {
  await page.goto('./#/settings');
  await waitForSchema(page);
  const dataset = buildLongRunningDataset();
  await page.evaluate(async (seedTables) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('classroom-v20');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const storeNames = Object.keys(seedTables);
        const transaction = database.transaction(storeNames, 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        for (const [storeName, records] of Object.entries(seedTables)) {
          const store = transaction.objectStore(storeName);
          store.clear();
          for (const record of records) store.put(record);
        }
      });
    } finally {
      database.close();
    }
  }, dataset);
  await page.reload();
}

test('multi-year synthetic pilot data remains usable across daily work, Progress, Reports, Health, and backup', async ({
  page,
}) => {
  test.slow();
  await seedLongRunningDataset(page);

  await page.goto('./#/today?date=2026-08-05');
  await expect(page.getByRole('heading', { level: 1, name: /Alyssa\.$/ })).toBeVisible();
  await expect(page.locator('main')).toBeVisible();

  await page.goto('./#/week?date=2026-08-05');
  await expect(page.getByRole('heading', { level: 1, name: /^Week\b/ })).toBeVisible();

  await page.goto('./#/learner-progress?schoolYear=volume-year-2026&student=volume-student-01');
  await expect(page.getByRole('heading', { level: 1, name: 'Learner Progress' })).toBeVisible();
  await expect(page.getByText('Volume evidence 1-1-2026', { exact: true })).toBeVisible();

  await page.goto('./#/reports?schoolYear=volume-year-2026&student=volume-student-01');
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  const report = page.getByRole('article', { name: 'Volume Student 01' });
  await expect(report).toContainText('Volume evidence 1-1-2026');
  await expect(report).toContainText('Classroom does not infer mastery, grades, readiness');

  await page.goto('./#/system-health');
  await expect(page.getByRole('heading', { level: 1, name: 'System Health' })).toBeVisible();
  await expect(page.getByText('Version 17', { exact: true })).toBeVisible();

  await page.goto('./#/export');
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full backup' }).click();
  const download = await backupDownload;
  const path = await download.path();
  expect(path).not.toBeNull();
  const backup = JSON.parse(await readFile(path!, 'utf8')) as {
    databaseSchemaVersion: number;
    tableCounts: Record<string, number>;
  };
  expect(backup.databaseSchemaVersion).toBe(17);
  expect(backup.tableCounts).toMatchObject({
    schoolYears: 3,
    studentRecords: 24,
    rosterMemberships: 96,
    lessonPlans: 60,
    sessionOccurrences: 180,
    assessmentEvidence: 576,
    tasks: 120,
    calendarEvents: 90,
    libraryItems: 15,
    standards: 12,
  });

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Backup & Recovery' })).toBeVisible();
  await page.goto('./#/reports?schoolYear=volume-year-2024&student=volume-student-01');
  await expect(page.getByRole('article', { name: 'Volume Student 01' })).toContainText(
    'Volume evidence 1-1-2024',
  );
});
