import type {
  WorkspaceDataSummary,
  WorkspaceReadState,
} from '@/domain/readModels/workspaceReadModels';

export type HealthCheckTone = 'ready' | 'attention' | 'checking' | 'error';

export interface LiveHealthCheck {
  id: 'database' | 'schema' | 'active-school-year' | 'quarantine';
  name: string;
  detail: string;
  statusLabel: string;
  tone: HealthCheckTone;
}

const EXPECTED_SCHEMA_VERSION = 3;

export function buildLiveHealthChecks(
  summaryState: WorkspaceReadState<WorkspaceDataSummary>,
  schemaVersion: number,
): LiveHealthCheck[] {
  const databaseCheck: LiveHealthCheck =
    summaryState.status === 'loading'
      ? {
          id: 'database',
          name: 'IndexedDB repository read',
          detail: 'Opening the Classroom v20 database.',
          statusLabel: 'Checking',
          tone: 'checking',
        }
      : summaryState.status === 'error'
        ? {
            id: 'database',
            name: 'IndexedDB repository read',
            detail: summaryState.message,
            statusLabel: 'Read error',
            tone: 'error',
          }
        : {
            id: 'database',
            name: 'IndexedDB repository read',
            detail: 'Repository-backed school-year and record summaries are readable.',
            statusLabel: 'Ready',
            tone: 'ready',
          };

  const schemaCheck: LiveHealthCheck =
    schemaVersion === EXPECTED_SCHEMA_VERSION
      ? {
          id: 'schema',
          name: 'Database schema version',
          detail: `Classroom is using expected schema version ${EXPECTED_SCHEMA_VERSION}.`,
          statusLabel: `Version ${schemaVersion}`,
          tone: 'ready',
        }
      : {
          id: 'schema',
          name: 'Database schema version',
          detail: `Expected schema version ${EXPECTED_SCHEMA_VERSION}, received ${schemaVersion}.`,
          statusLabel: 'Needs review',
          tone: 'attention',
        };

  let activeSchoolYearCheck: LiveHealthCheck;
  let quarantineCheck: LiveHealthCheck;

  if (summaryState.status === 'loading') {
    activeSchoolYearCheck = {
      id: 'active-school-year',
      name: 'Active school year',
      detail: 'Checking the school-year records.',
      statusLabel: 'Checking',
      tone: 'checking',
    };
    quarantineCheck = {
      id: 'quarantine',
      name: 'Migration quarantine',
      detail: 'Checking records that require review.',
      statusLabel: 'Checking',
      tone: 'checking',
    };
  } else if (summaryState.status === 'error') {
    activeSchoolYearCheck = {
      id: 'active-school-year',
      name: 'Active school year',
      detail: 'The active school year could not be verified.',
      statusLabel: 'Unavailable',
      tone: 'error',
    };
    quarantineCheck = {
      id: 'quarantine',
      name: 'Migration quarantine',
      detail: 'Quarantine records could not be verified.',
      statusLabel: 'Unavailable',
      tone: 'error',
    };
  } else if (summaryState.data.activeSchoolYearCount === 1 && summaryState.data.activeSchoolYear) {
    const schoolYear = summaryState.data.activeSchoolYear;
    activeSchoolYearCheck = {
      id: 'active-school-year',
      name: 'Active school year',
      detail: `${schoolYear.label}: ${schoolYear.startsOn} through ${schoolYear.endsOn}.`,
      statusLabel: schoolYear.label,
      tone: 'ready',
    };
    quarantineCheck =
      summaryState.data.counts.quarantine === 0
        ? {
            id: 'quarantine',
            name: 'Migration quarantine',
            detail: 'No records are waiting for migration review.',
            statusLabel: 'Clear',
            tone: 'ready',
          }
        : {
            id: 'quarantine',
            name: 'Migration quarantine',
            detail: `${summaryState.data.counts.quarantine} records require migration review.`,
            statusLabel: 'Review',
            tone: 'attention',
          };
  } else {
    const activeCount = summaryState.data.activeSchoolYearCount;
    activeSchoolYearCheck =
      activeCount === 0
        ? {
            id: 'active-school-year',
            name: 'Active school year',
            detail:
              'No school year is marked active. Learner and planning views cannot establish their normal year context.',
            statusLabel: 'Needs setup',
            tone: 'attention',
          }
        : {
            id: 'active-school-year',
            name: 'Active school year',
            detail: `${activeCount} school years are marked active. Classroom should have exactly one active school year.`,
            statusLabel: 'Needs review',
            tone: 'attention',
          };
    quarantineCheck =
      summaryState.data.counts.quarantine === 0
        ? {
            id: 'quarantine',
            name: 'Migration quarantine',
            detail: 'No records are waiting for migration review.',
            statusLabel: 'Clear',
            tone: 'ready',
          }
        : {
            id: 'quarantine',
            name: 'Migration quarantine',
            detail: `${summaryState.data.counts.quarantine} records require migration review.`,
            statusLabel: 'Review',
            tone: 'attention',
          };
  }

  return [databaseCheck, schemaCheck, activeSchoolYearCheck, quarantineCheck];
}
