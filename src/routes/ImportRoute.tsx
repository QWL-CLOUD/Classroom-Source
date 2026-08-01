import { ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { ActivitiesImportWorkspace } from '@/features/importCenter/ActivitiesImportWorkspace';
import sharedStyles from '@/features/importCenter/ImportCenterShared.module.css';
import { ImportTypeSelector } from '@/features/importCenter/ImportTypeSelector';
import { ResourcesImportWorkspace } from '@/features/importCenter/ResourcesImportWorkspace';
import { RosterImportWorkspace } from '@/features/importCenter/RosterImportWorkspace';
import { StandardsImportWorkspace } from '@/features/importCenter/StandardsImportWorkspace';
import {
  buildImportCenterHref,
  parseImportRouteState,
} from '@/features/importCenter/importRouteState';

import styles from './ImportRoute.module.css';

export function ImportRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = parseImportRouteState(searchParams);

  return (
    <div className={`page-shell ${styles.page}`}>
      <header className={styles.pageHeader}>
        <div>
          <p className="page-eyebrow">Settings &amp; Data</p>
          <h1>Import Center</h1>
          <p>
            Use one canonical workspace for reviewed imports. Preview never writes data; only an
            explicit atomic commit can change Classroom records.
          </p>
        </div>
        <div className={styles.privacyNote}>
          <ShieldCheck size={19} aria-hidden="true" />
          <span>
            Files stay in this browser session; file paths and workbook contents are not stored.
          </span>
        </div>
      </header>

      <ImportTypeSelector selectedType={routeState.importType} />

      {routeState.issue ? (
        <div className={styles.routeError} role="alert">
          <span>{routeState.issue}</span>
          <Link to={buildImportCenterHref()}>Reset Import Center</Link>
        </div>
      ) : null}

      {!routeState.issue && routeState.importType === 'activities' ? (
        <ActivitiesImportWorkspace key="activities" />
      ) : null}
      {!routeState.issue && routeState.importType === 'resources' ? (
        <ResourcesImportWorkspace key="resources" />
      ) : null}
      {!routeState.issue && routeState.importType === 'standards' ? (
        <StandardsImportWorkspace key="standards" />
      ) : null}
      {!routeState.issue && routeState.importType === 'roster' ? (
        <RosterImportWorkspace
          key={`roster-${routeState.contextId ?? 'none'}`}
          contextId={routeState.contextId}
          onContextChange={(contextId) => {
            const next = new URLSearchParams({ type: 'roster' });
            if (contextId) next.set('context', contextId);
            setSearchParams(next, { replace: true });
          }}
        />
      ) : null}
      {!routeState.issue &&
      routeState.importType &&
      !['activities', 'resources', 'standards', 'roster'].includes(routeState.importType) ? (
        <section className={`card ${sharedStyles.plannedPanel}`} aria-label="Planned import type">
          <p className="page-eyebrow">Planned catalog import</p>
          <h2>Assessment import is not enabled yet</h2>
          <p>
            This canonical route is reserved, but implementation remains in the approved later Phase
            3I-0.5 subphase. No preview or write state is created here.
          </p>
        </section>
      ) : null}
      {!routeState.issue && !routeState.importType ? (
        <section className={`card ${styles.welcome}`} aria-label="Choose an import type">
          <p className="page-eyebrow">Start here</p>
          <h2>Choose what you are importing</h2>
          <p>
            Activities, Resources, Standards, and Rosters are available now. Assessments will join
            this same Import Center without creating additional routes or duplicated state.
          </p>
        </section>
      ) : null}

      <section className={`card ${styles.legacy}`} aria-label="Legacy backup migration">
        <div>
          <p className="page-eyebrow">Separate workflow</p>
          <h2>Legacy Classroom backup</h2>
          <p>
            The existing v19 backup scanner remains a read-only migration preview and is not mixed
            with catalog or roster imports.
          </p>
        </div>
        <Link className="button" to="/migration">
          Open migration preview
        </Link>
      </section>
    </div>
  );
}
