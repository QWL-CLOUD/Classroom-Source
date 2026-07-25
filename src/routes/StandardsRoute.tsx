import { Archive, BookCheck, Boxes, Pencil, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import {
  standardAlignmentSchema,
  standardSchema,
  type StandardStatus,
} from '@/domain/models/entities';
import { StandardEditor } from '@/features/standards/StandardEditor';
import { standardMutationService } from '@/features/standards/standardMutationService';
import {
  buildStandardViews,
  filterStandards,
  standardStatusLabels,
  type StandardView,
} from '@/features/standards/standardReadModel';

import styles from './StandardsRoute.module.css';

function uniqueSorted(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' }),
  );
}

export function StandardsRoute() {
  const data = useLiveQuery(async () => {
    const [standardValues, alignmentValues] = await Promise.all([
      classroomDb.standards.toArray(),
      classroomDb.standardAlignments.toArray(),
    ]);
    const standards = standardValues.map((value) => standardSchema.parse(value));
    const alignments = alignmentValues.map((value) => standardAlignmentSchema.parse(value));
    const views = buildStandardViews(standards, alignments);
    return {
      standards,
      views,
      frameworks: [
        ...new Map(views.map((value) => [value.frameworkKey, value.frameworkLabel])).entries(),
      ]
        .map(([key, label]) => ({ key, label }))
        .sort((first, second) =>
          first.label.localeCompare(second.label, 'en', { sensitivity: 'base' }),
        ),
      subjects: uniqueSorted(views.map((value) => value.subject)),
      gradeBands: uniqueSorted(views.map((value) => value.gradeBand)),
    };
  }, []);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | StandardStatus>('active');
  const [frameworkKey, setFrameworkKey] = useState('');
  const [subject, setSubject] = useState('');
  const [gradeBand, setGradeBand] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      filterStandards(data?.views ?? [], {
        query,
        status,
        frameworkKey,
        subject,
        gradeBand,
      }),
    [data?.views, frameworkKey, gradeBand, query, status, subject],
  );
  const selected =
    (data?.views ?? []).find((standard) => standard.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (creating) return;
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [creating, selected, selectedId]);

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The Standard action could not be completed.',
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  const filtersActive = query.trim() || status !== 'active' || frameworkKey || subject || gradeBand;

  return (
    <div className={`page-shell ${styles.page}`}>
      <header className={styles.pageHeader}>
        <div>
          <p className="page-eyebrow">Independent source records</p>
          <h1>Standards</h1>
          <p>
            Manage framework-aware Standard identities and preserve explicit links to Plans, Lesson
            Flow steps, and Lesson Templates.
          </p>
        </div>
        <div className={styles.headerActions}>
          <a className="button" href="#/library">
            <Boxes size={17} aria-hidden="true" /> Open Library
          </a>
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              setCreating(true);
              setEditing(false);
              setError(null);
            }}
          >
            <Plus size={17} aria-hidden="true" /> New Standard
          </button>
        </div>
      </header>

      <section className={`card ${styles.filters}`} aria-label="Standard filters">
        <div className={styles.filterHeader}>
          <div>
            <strong>Filter Standards</strong>
            <span>Search and narrow the independent source catalog.</span>
          </div>
          <button
            className={`button button-quiet ${styles.clearFilters}`}
            type="button"
            disabled={!filtersActive}
            onClick={() => {
              setQuery('');
              setStatus('active');
              setFrameworkKey('');
              setSubject('');
              setGradeBand('');
            }}
          >
            <X size={15} aria-hidden="true" /> Clear filters
          </button>
        </div>

        <div className={styles.filterGrid}>
          <label>
            <span>Search</span>
            <div>
              <Search size={16} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Code, statement, framework, or subject"
              />
            </div>
          </label>
          <label>
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'all' | StandardStatus)}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All statuses</option>
            </select>
          </label>
          <label>
            <span>Framework</span>
            <select value={frameworkKey} onChange={(event) => setFrameworkKey(event.target.value)}>
              <option value="">All frameworks</option>
              {(data?.frameworks ?? []).map((framework) => (
                <option key={framework.key} value={framework.key}>
                  {framework.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Subject</span>
            <select value={subject} onChange={(event) => setSubject(event.target.value)}>
              <option value="">All subjects</option>
              {(data?.subjects ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Grade band</span>
            <select value={gradeBand} onChange={(event) => setGradeBand(event.target.value)}>
              <option value="">All levels</option>
              {(data?.gradeBands ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {creating ? (
        <section className={`card ${styles.editorPanel}`} aria-label="Create Standard">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Framework source</p>
              <h2>New Standard</h2>
            </div>
          </div>
          <StandardEditor
            standards={data?.standards ?? []}
            busy={busy}
            onCancel={() => setCreating(false)}
            onSubmit={async (values) => {
              const created = await run(() => standardMutationService.create(values));
              if (!created) return;
              setSelectedId(created.id);
              setCreating(false);
            }}
          />
        </section>
      ) : null}

      <div className={styles.workspace} data-empty={!selected}>
        <section className={`card ${styles.directory}`} aria-label="Standard results">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Catalog</p>
              <h2>{visible.length} Standards</h2>
            </div>
          </div>
          {data === undefined ? (
            <p className={styles.message}>Loading Standards…</p>
          ) : visible.length === 0 ? (
            <div className={styles.empty} role="status">
              <BookCheck size={28} aria-hidden="true" />
              <strong>
                {filtersActive ? 'No Standards match these filters' : 'No Standards yet'}
              </strong>
              <span>
                {filtersActive
                  ? 'Adjust or clear the filters to return to the active catalog.'
                  : 'Create the first framework-aware Standard to begin the catalog.'}
              </span>
            </div>
          ) : (
            <ul className={styles.list}>
              {visible.map((standard) => (
                <li key={standard.id}>
                  <button
                    type="button"
                    className={styles.itemButton}
                    data-selected={selected?.id === standard.id}
                    onClick={() => {
                      setSelectedId(standard.id);
                      setEditing(false);
                    }}
                  >
                    <span className={styles.itemText}>
                      <strong>{standard.code}</strong>
                      <small className={styles.frameworkSummary}>
                        {standard.frameworkLabel}
                        {standard.subject ? ` · ${standard.subject}` : ''}
                        {standard.gradeBand ? ` · ${standard.gradeBand}` : ''}
                      </small>
                    </span>
                    <span className={styles.status} data-status={standard.status}>
                      {standardStatusLabels[standard.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className={`card ${styles.details}`}
          aria-label="Standard details"
          hidden={!selected}
        >
          {!selected ? (
            <div className={styles.empty} role="status">
              <BookCheck size={28} aria-hidden="true" />
              <strong>Select a Standard</strong>
              <span>Identity, hierarchy, lifecycle, and alignment counts will appear here.</span>
            </div>
          ) : editing ? (
            <StandardEditor
              key={selected.id}
              standard={selected}
              standards={data?.standards ?? []}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSubmit={async (values) => {
                const updated = await run(() =>
                  standardMutationService.update(selected.id, values),
                );
                if (updated) setEditing(false);
              }}
            />
          ) : (
            <StandardDetails
              standard={selected}
              standards={data?.views ?? []}
              busy={busy}
              onEdit={() => setEditing(true)}
              onArchive={() => void run(() => standardMutationService.archive(selected.id))}
              onRestore={() => void run(() => standardMutationService.restore(selected.id))}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function StandardDetails({
  standard,
  standards,
  busy,
  onEdit,
  onArchive,
  onRestore,
}: {
  standard: StandardView;
  standards: readonly StandardView[];
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const children = standards
    .filter((candidate) => candidate.parentStandardId === standard.id)
    .sort(
      (first, second) =>
        first.sortOrder - second.sortOrder ||
        first.code.localeCompare(second.code, 'en', { numeric: true, sensitivity: 'base' }),
    );

  return (
    <article className={styles.detailContent} aria-label={`${standard.code} Standard details`}>
      <header className={styles.detailHeader}>
        <div className={styles.detailIdentity}>
          <p className={`page-eyebrow ${styles.frameworkLabel}`}>{standard.frameworkLabel}</p>
          <h2>{standard.code}</h2>
          <span className={styles.status} data-status={standard.status}>
            {standardStatusLabels[standard.status]}
          </span>
        </div>
        <div className={styles.actions}>
          <button className="button" type="button" disabled={busy} onClick={onEdit}>
            <Pencil size={16} aria-hidden="true" /> Edit
          </button>
          {standard.status === 'active' ? (
            <button className="button" type="button" disabled={busy} onClick={onArchive}>
              <Archive size={16} aria-hidden="true" /> Archive
            </button>
          ) : (
            <button className="button" type="button" disabled={busy} onClick={onRestore}>
              <RotateCcw size={16} aria-hidden="true" /> Restore
            </button>
          )}
        </div>
      </header>

      <p className={styles.statement}>{standard.statement}</p>

      <dl className={styles.metadata}>
        <div>
          <dt>Issuing organization</dt>
          <dd>{standard.issuingOrganization}</dd>
        </div>
        <div>
          <dt>Framework title</dt>
          <dd>{standard.frameworkTitle}</dd>
        </div>
        <div>
          <dt>Jurisdiction or scope</dt>
          <dd>{standard.jurisdiction ?? 'Not specified'}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{standard.version ?? 'Not specified'}</dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>{standard.subject ?? 'Not specified'}</dd>
        </div>
        <div>
          <dt>Grade band or level</dt>
          <dd>{standard.gradeBand ?? 'Not specified'}</dd>
        </div>
        <div>
          <dt>Parent Standard</dt>
          <dd>{standard.parentCode ?? 'None'}</dd>
        </div>
        <div>
          <dt>Explicit alignments</dt>
          <dd>{standard.alignmentCount}</dd>
        </div>
      </dl>

      <section className={styles.hierarchy} aria-label="Standard hierarchy">
        <h3>Child Standards</h3>
        {children.length === 0 ? (
          <p>No direct children.</p>
        ) : (
          <p>{children.map((child) => child.code).join(', ')}</p>
        )}
      </section>

      <p className={styles.message}>
        Archiving hides this Standard from new alignment choices. Existing alignments remain
        readable and can be removed explicitly.
      </p>
    </article>
  );
}
