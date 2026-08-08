import {
  Activity,
  Archive,
  BookOpen,
  Boxes,
  ClipboardCheck,
  FileText,
  Import as ImportIcon,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shapes,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import {
  libraryCatalogItemSchema,
  type LibraryCatalogStatus,
  type LibraryCatalogType,
} from '@/domain/models/entities';
import { LibraryCatalogEditor } from '@/features/libraryCatalog/LibraryCatalogEditor';
import {
  buildLibraryClassificationFacetModel,
  hasLibraryClassificationSelections,
  libraryClassificationSelectionsEqual,
  pruneLibraryClassificationSelections,
  updateLibraryClassificationSelection,
  type LibraryClassificationSelections,
} from '@/features/libraryCatalog/libraryClassificationFacets';
import { buildImportCenterHref } from '@/features/importCenter/importRouteState';
import { buildLearnerProgressEntryHref } from '@/features/learnerProgress/learnerProgressNavigation';
import { preserveTeachingReviewReturnParams } from '@/features/teachingReview/teachingReviewNavigation';
import { libraryCatalogMutationService } from '@/features/libraryCatalog/libraryCatalogMutationService';
import {
  buildLibraryCatalogItemViews,
  libraryCatalogStatusLabels,
  libraryCatalogTypeLabels,
  listLibraryCatalogTags,
  selectVisibleLibraryCatalogItem,
  type LibraryCatalogItemView,
} from '@/features/libraryCatalog/libraryCatalogReadModel';
import {
  buildLibraryRouteSearch,
  parseLibraryRouteState,
} from '@/features/libraryCatalog/libraryRouteState';
import {
  libraryActivityGroupingLabels,
  libraryAssessmentKindLabels,
  safeLibraryResourceHref,
} from '@/features/libraryCatalog/libraryCatalogTypedFields';

import styles from './LibraryRoute.module.css';

function typeIcon(type: LibraryCatalogType): ReactNode {
  if (type === 'activity') return <Shapes size={18} aria-hidden="true" />;
  if (type === 'resource') return <FileText size={18} aria-hidden="true" />;
  if (type === 'assessment') {
    return <ClipboardCheck size={18} aria-hidden="true" />;
  }
  return <BookOpen size={18} aria-hidden="true" />;
}

export function LibraryRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = parseLibraryRouteState(searchParams);
  const catalogType = routeState.catalogType;
  const requestedItemId = routeState.itemId;
  const data = useLiveQuery(async () => {
    const [itemValues, assignments, categoryValues] = await Promise.all([
      classroomDb.libraryItems.toArray(),
      classroomDb.categoryAssignments.where('entityType').equals('library-item').toArray(),
      classroomDb.categoryValues.toArray(),
    ]);
    const items = itemValues.map((value) => libraryCatalogItemSchema.parse(value));
    return {
      items,
      views: buildLibraryCatalogItemViews(items, assignments, categoryValues),
      categoryValues,
    };
  }, []);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | LibraryCatalogStatus>('active');
  const [tag, setTag] = useState('');
  const [classificationSelections, setClassificationSelections] =
    useState<LibraryClassificationSelections>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tags = useMemo(() => listLibraryCatalogTags(data?.views ?? []), [data?.views]);

  const baseFilters = useMemo(
    () => ({ query, catalogType, status, tag }),
    [catalogType, query, status, tag],
  );
  const facetModel = useMemo(
    () =>
      buildLibraryClassificationFacetModel({
        items: data?.views ?? [],
        categoryValues: data?.categoryValues ?? [],
        filters: baseFilters,
        selections: classificationSelections,
      }),
    [baseFilters, classificationSelections, data?.categoryValues, data?.views],
  );
  const visible = facetModel.visibleItems;
  const selected = requestedItemId
    ? (visible.find((item) => item.id === requestedItemId) ?? null)
    : selectVisibleLibraryCatalogItem(visible, selectedId);

  useEffect(() => {
    if (!requestedItemId || !data || selectedId === requestedItemId) return;
    const requested = data.views.find((item) => item.id === requestedItemId);
    if (!requested) return;
    setQuery('');
    setStatus('all');
    setTag('');
    setClassificationSelections({});
    setSelectedId(requested.id);
    setCreating(false);
    setEditing(false);
  }, [data, requestedItemId, selectedId]);

  useEffect(() => {
    if (creating) return;
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
    }
  }, [creating, selected, selectedId]);

  useEffect(() => {
    if (!data) return;
    setClassificationSelections((current) => {
      const next = pruneLibraryClassificationSelections(current, catalogType, data.categoryValues);
      return libraryClassificationSelectionsEqual(current, next) ? current : next;
    });
  }, [catalogType, data]);

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The Library action could not be completed.',
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  function selectCatalogType(nextType: 'all' | LibraryCatalogType): void {
    const next = preserveTeachingReviewReturnParams(
      searchParams,
      buildLibraryRouteSearch(nextType),
    );
    setSearchParams(next);
  }

  function clearFilters(): void {
    setQuery('');
    setStatus('active');
    setTag('');
    setClassificationSelections({});
  }

  const classificationFilterActive = hasLibraryClassificationSelections(facetModel.selections);
  const filterActive = Boolean(
    query.trim() || status !== 'active' || tag || classificationFilterActive,
  );
  const hasLegacyStandards = (data?.views ?? []).some((item) => item.catalogType === 'standard');
  const catalogTabs: Array<{ value: 'all' | LibraryCatalogType; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'activity', label: 'Activities' },
    { value: 'resource', label: 'Resources' },
    { value: 'assessment', label: 'Assessments' },
  ];
  if (hasLegacyStandards) {
    catalogTabs.push({ value: 'standard', label: 'Legacy Standards' });
  }

  const importAction =
    catalogType === 'activity'
      ? { label: 'Import activities', href: buildImportCenterHref('activities') }
      : catalogType === 'resource'
        ? { label: 'Import resources', href: buildImportCenterHref('resources') }
        : catalogType === 'assessment'
          ? { label: 'Import assessments', href: buildImportCenterHref('assessments') }
          : null;

  return (
    <div className={`page-shell ${styles.page}`}>
      <header className={styles.pageHeader}>
        <div>
          <p className="page-eyebrow">Reusable teaching catalog</p>
          <h1>Library</h1>
          <p>
            Organize reusable Activities, Resources, and Assessments. Standards now have their own
            framework-aware workspace and alignment workflow.
          </p>
        </div>
        <div className={styles.headerActions}>
          {importAction ? (
            <Link className="button" to={importAction.href}>
              <ImportIcon size={17} aria-hidden="true" /> {importAction.label}
            </Link>
          ) : null}
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('item');
              setSearchParams(next);
              setCreating(true);
              setEditing(false);
              setError(null);
            }}
          >
            <Plus size={17} aria-hidden="true" /> New Library item
          </button>
        </div>
      </header>

      <nav className={styles.catalogTabs} aria-label="Library catalog types">
        {catalogTabs.map((tab) => (
          <button
            key={tab.value}
            className={styles.catalogTab}
            type="button"
            data-selected={catalogType === tab.value}
            aria-pressed={catalogType === tab.value}
            onClick={() => selectCatalogType(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <section className={`card ${styles.filters}`} aria-label="Library catalog filters">
        <label className={styles.searchField}>
          <span>Search</span>
          <div>
            <Search size={17} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, descriptions, tags, classifications, and formats"
            />
          </div>
        </label>

        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as 'all' | LibraryCatalogStatus)}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All statuses</option>
          </select>
        </label>

        <label>
          <span>Tag</span>
          <select value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="">All tags</option>
            {tags.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <button
          className="button button-quiet"
          type="button"
          disabled={!filterActive}
          onClick={clearFilters}
        >
          <X size={15} aria-hidden="true" /> Clear filters
        </button>
      </section>

      {facetModel.groups.length > 0 ? (
        <section
          className={`card ${styles.classificationFilters}`}
          aria-label="Library classification filters"
        >
          <div className={styles.facetHeading}>
            <div>
              <h2>Classification filters</h2>
              <p>Choose multiple values within a group or combine groups to narrow the catalog.</p>
            </div>
            {classificationFilterActive ? (
              <button
                className="button button-quiet"
                type="button"
                onClick={() => setClassificationSelections({})}
              >
                Clear classifications
              </button>
            ) : null}
          </div>
          <div className={styles.facetGrid}>
            {facetModel.groups.map((group) => (
              <fieldset className={styles.facetGroup} key={group.familyId}>
                <legend>{group.familyLabel}</legend>
                <div className={styles.facetOptions}>
                  {group.values.map((value) => (
                    <label
                      className={styles.facetOption}
                      data-selected={value.selected}
                      key={value.id}
                    >
                      <input
                        type="checkbox"
                        aria-label={`${value.name} (${value.count})`}
                        checked={value.selected}
                        onChange={(event) =>
                          setClassificationSelections((current) =>
                            updateLibraryClassificationSelection(
                              current,
                              group.familyId,
                              value.id,
                              event.target.checked,
                            ),
                          )
                        }
                      />
                      <span className={styles.facetName}>{value.name}</span>
                      <span className={styles.facetCount} aria-hidden="true">
                        {value.count}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {creating ? (
        <section className={`card ${styles.createPanel}`} aria-label="Create Library item">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Add to catalog</p>
              <h2>New Library item</h2>
            </div>
          </div>
          <LibraryCatalogEditor
            busy={busy}
            onCancel={() => setCreating(false)}
            onSubmit={async (values, categorySelections) => {
              const created = await run(() =>
                libraryCatalogMutationService.create(values, categorySelections),
              );
              if (!created) return;
              const next = new URLSearchParams(searchParams);
              next.set('item', created.id);
              setSearchParams(next);
              setSelectedId(created.id);
              setCreating(false);
            }}
          />
        </section>
      ) : null}

      <div className={styles.workspace}>
        <section className={`card ${styles.directory}`} aria-label="Library catalog results">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Catalog results</p>
              <h2>{visible.length} items</h2>
              <p className={styles.resultContext}>
                {catalogTabs.find((tab) => tab.value === catalogType)?.label ?? 'All'}
              </p>
            </div>
          </div>

          {data === undefined ? (
            <p className={styles.message}>Loading Library catalog…</p>
          ) : visible.length === 0 ? (
            <div className={styles.empty} role="status">
              <Boxes size={28} aria-hidden="true" />
              <strong>No matching Library items</strong>
              <span>Adjust the filters or create the first item in this catalog.</span>
            </div>
          ) : (
            <ul className={styles.itemList}>
              {visible.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={styles.itemButton}
                    data-selected={selected?.id === item.id}
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.set('item', item.id);
                      setSearchParams(next);
                      setSelectedId(item.id);
                      setEditing(false);
                    }}
                  >
                    <span className={styles.itemIcon}>{typeIcon(item.catalogType)}</span>
                    <span className={styles.itemText}>
                      <strong>{item.title}</strong>
                      <small>
                        {libraryCatalogTypeLabels[item.catalogType]}
                        {item.resourceFormatLabel ? ` · ${item.resourceFormatLabel}` : ''}
                      </small>
                    </span>
                    <span className={styles.statusBadge} data-status={item.status}>
                      {libraryCatalogStatusLabels[item.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className={`card ${styles.detail}`}
          aria-label={selected ? `${selected.title} Library item details` : 'Library item details'}
        >
          {!selected ? (
            <div className={styles.empty} role="status">
              <Boxes size={30} aria-hidden="true" />
              <strong>Select a Library item</strong>
              <span>Details, tags, Resource Format, and lifecycle actions will appear here.</span>
            </div>
          ) : editing ? (
            <>
              <div className={styles.sectionHeading}>
                <div>
                  <p className="page-eyebrow">Edit catalog item</p>
                  <h2>{selected.title}</h2>
                </div>
              </div>
              <LibraryCatalogEditor
                key={selected.id}
                item={selected}
                busy={busy}
                onCancel={() => setEditing(false)}
                onSubmit={async (values, categorySelections) => {
                  const updated = await run(() =>
                    libraryCatalogMutationService.update(
                      selected.id,
                      {
                        title: values.title,
                        description: values.description,
                        tags: values.tags,
                        typedFields: values.typedFields,
                      },
                      categorySelections,
                    ),
                  );
                  if (updated) setEditing(false);
                }}
              />
            </>
          ) : (
            <LibraryItemDetail
              item={selected}
              busy={busy}
              progressHref={
                selected.catalogType === 'assessment'
                  ? buildLearnerProgressEntryHref({ assessmentId: selected.id })
                  : undefined
              }
              onEdit={() => setEditing(true)}
              onArchive={() => void run(() => libraryCatalogMutationService.archive(selected.id))}
              onRestore={() => void run(() => libraryCatalogMutationService.restore(selected.id))}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function LibraryItemDetail({
  item,
  busy,
  progressHref,
  onEdit,
  onArchive,
  onRestore,
}: {
  item: LibraryCatalogItemView;
  busy: boolean;
  progressHref?: string;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <>
      <div className={styles.detailHeader}>
        <div>
          <div className={styles.badges}>
            <span className={styles.typeBadge}>
              {typeIcon(item.catalogType)}
              {libraryCatalogTypeLabels[item.catalogType]}
            </span>
            <span className={styles.statusBadge} data-status={item.status}>
              {libraryCatalogStatusLabels[item.status]}
            </span>
          </div>
          <h2>{item.title}</h2>
        </div>
        <div className={styles.actions}>
          {progressHref ? (
            <a className="button" href={progressHref}>
              <Activity size={16} aria-hidden="true" /> Learner Progress
            </a>
          ) : null}
          <button className="button" type="button" disabled={busy} onClick={onEdit}>
            <Pencil size={16} aria-hidden="true" /> Edit
          </button>
          {item.status === 'active' ? (
            <button className="button" type="button" disabled={busy} onClick={onArchive}>
              <Archive size={16} aria-hidden="true" /> Archive
            </button>
          ) : (
            <button className="button" type="button" disabled={busy} onClick={onRestore}>
              <RotateCcw size={16} aria-hidden="true" /> Restore
            </button>
          )}
        </div>
      </div>

      {item.description ? (
        <p className={styles.description}>{item.description}</p>
      ) : (
        <p className={styles.muted}>No description has been added.</p>
      )}

      <dl className={styles.facts}>
        <div>
          <dt>Stable ID</dt>
          <dd>{item.id}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{libraryCatalogTypeLabels[item.catalogType]}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{libraryCatalogStatusLabels[item.status]}</dd>
        </div>
        {item.classificationGroups.map((group) => (
          <div key={group.familyId}>
            <dt>{group.familyLabel}</dt>
            <dd>
              {group.values.length
                ? group.values
                    .map((value) =>
                      value.lifecycleState === 'active'
                        ? value.name
                        : `${value.name} (${value.lifecycleState === 'archived' ? 'Archived' : 'Merged'})`,
                    )
                    .join(', ')
                : 'Not assigned'}
            </dd>
          </div>
        ))}
        {item.externalSource ? (
          <div>
            <dt>External source</dt>
            <dd>{item.externalSource}</dd>
          </div>
        ) : null}
        {item.externalKey ? (
          <div>
            <dt>External key</dt>
            <dd>{item.externalKey}</dd>
          </div>
        ) : null}
        {item.sourceReference ? (
          <div>
            <dt>Source reference</dt>
            <dd>{item.sourceReference}</dd>
          </div>
        ) : null}
      </dl>

      {item.typedFields?.catalogType === 'activity' ? (
        <section className={styles.workflowSection} aria-label="Activity workflow details">
          <h3>Activity workflow</h3>
          <dl className={styles.facts}>
            <div>
              <dt>Grouping</dt>
              <dd>{libraryActivityGroupingLabels[item.typedFields.grouping]}</dd>
            </div>
            <div>
              <dt>Estimated time</dt>
              <dd>
                {item.typedFields.estimatedMinutes
                  ? `${item.typedFields.estimatedMinutes} minutes`
                  : 'Not specified'}
              </dd>
            </div>
          </dl>
          {item.typedFields.directions ? (
            <div className={styles.workflowText}>
              <strong>Reusable directions</strong>
              <p>{item.typedFields.directions}</p>
            </div>
          ) : null}
          {item.typedFields.materials ? (
            <div className={styles.workflowText}>
              <strong>Materials</strong>
              <p>{item.typedFields.materials}</p>
            </div>
          ) : null}
          {item.typedFields.notes ? (
            <div className={styles.workflowText}>
              <strong>Teacher notes</strong>
              <p>{item.typedFields.notes}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {item.typedFields?.catalogType === 'resource' ? (
        <section className={styles.workflowSection} aria-label="Resource workflow details">
          <h3>Resource workflow</h3>
          <dl className={styles.facts}>
            <div>
              <dt>Source or location</dt>
              <dd>
                {safeLibraryResourceHref(item.typedFields.sourceLocation) ? (
                  <a
                    href={safeLibraryResourceHref(item.typedFields.sourceLocation)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.typedFields.sourceLocation}
                  </a>
                ) : (
                  (item.typedFields.sourceLocation ?? 'Not specified')
                )}
              </dd>
            </div>
          </dl>
          {item.typedFields.usageNotes ? (
            <div className={styles.workflowText}>
              <strong>Usage notes</strong>
              <p>{item.typedFields.usageNotes}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {item.typedFields?.catalogType === 'assessment' ? (
        <section className={styles.workflowSection} aria-label="Assessment workflow details">
          <h3>Assessment workflow</h3>
          <dl className={styles.facts}>
            <div>
              <dt>Assessment kind</dt>
              <dd>{libraryAssessmentKindLabels[item.typedFields.assessmentKind]}</dd>
            </div>
          </dl>
          {item.typedFields.studentPrompt ? (
            <div className={styles.workflowText}>
              <strong>Student prompt</strong>
              <p>{item.typedFields.studentPrompt}</p>
            </div>
          ) : null}
          {item.typedFields.evidenceToCollect ? (
            <div className={styles.workflowText}>
              <strong>Evidence to collect</strong>
              <p>{item.typedFields.evidenceToCollect}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className={styles.tagSection}>
        <h3>Tags</h3>
        {item.tags.length ? (
          <ul className={styles.tags}>
            {item.tags.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>No tags assigned.</p>
        )}
      </div>

      {item.catalogType === 'standard' ? (
        <div className={styles.phaseNote}>
          <strong>Legacy Library Standard</strong>
          <span>
            This compatibility record remains readable, but new Standards and alignments belong in
            the independent <a href="#/standards">Standards workspace</a>.
          </span>
        </div>
      ) : null}
    </>
  );
}
