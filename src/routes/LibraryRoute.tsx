import {
  Archive,
  BookOpen,
  Boxes,
  ClipboardCheck,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shapes,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import type { LibraryCatalogStatus, LibraryCatalogType } from '@/domain/models/entities';
import { LibraryCatalogEditor } from '@/features/libraryCatalog/LibraryCatalogEditor';
import { libraryCatalogMutationService } from '@/features/libraryCatalog/libraryCatalogMutationService';
import {
  buildLibraryCatalogItemViews,
  filterLibraryCatalogItems,
  libraryCatalogStatusLabels,
  libraryCatalogTypeLabels,
  listLibraryCatalogTags,
  type LibraryCatalogItemView,
} from '@/features/libraryCatalog/libraryCatalogReadModel';

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
  const data = useLiveQuery(async () => {
    const [items, assignments, categoryValues] = await Promise.all([
      classroomDb.libraryItems.toArray(),
      classroomDb.categoryAssignments.where('entityType').equals('library-item').toArray(),
      classroomDb.categoryValues.toArray(),
    ]);
    return {
      items,
      views: buildLibraryCatalogItemViews(items, assignments, categoryValues),
      resourceFormats: categoryValues
        .filter(
          (value) => value.familyId === 'resource-format' && value.lifecycleState === 'active',
        )
        .sort(
          (first, second) =>
            first.sortOrder - second.sortOrder || first.name.localeCompare(second.name),
        ),
    };
  }, []);

  const [query, setQuery] = useState('');
  const [catalogType, setCatalogType] = useState<'all' | LibraryCatalogType>('all');
  const [status, setStatus] = useState<'all' | LibraryCatalogStatus>('active');
  const [tag, setTag] = useState('');
  const [resourceFormatId, setResourceFormatId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tags = useMemo(() => listLibraryCatalogTags(data?.views ?? []), [data?.views]);

  const visible = useMemo(
    () =>
      filterLibraryCatalogItems(data?.views ?? [], {
        query,
        catalogType,
        status,
        tag,
        resourceFormatId,
      }),
    [catalogType, data?.views, query, resourceFormatId, status, tag],
  );

  const selected = (data?.views ?? []).find((item) => item.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (creating) return;
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
    }
  }, [creating, selected, selectedId]);

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

  function clearFilters(): void {
    setQuery('');
    setCatalogType('all');
    setStatus('active');
    setTag('');
    setResourceFormatId('');
  }

  const filterActive =
    query.trim() || catalogType !== 'all' || status !== 'active' || tag || resourceFormatId;

  return (
    <div className={`page-shell ${styles.page}`}>
      <header className={styles.pageHeader}>
        <div>
          <p className="page-eyebrow">Reusable teaching catalog</p>
          <h1>Library</h1>
          <p>
            Organize Activities, Resources, Assessments, and Standards with stable identities,
            shared metadata, and one searchable catalog.
          </p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            setCreating(true);
            setEditing(false);
            setError(null);
          }}
        >
          <Plus size={17} aria-hidden="true" /> New Library item
        </button>
      </header>

      <section className={`card ${styles.filters}`} aria-label="Library catalog filters">
        <label className={styles.searchField}>
          <span>Search</span>
          <div>
            <Search size={17} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, descriptions, tags, and formats"
            />
          </div>
        </label>

        <label>
          <span>Type</span>
          <select
            value={catalogType}
            onChange={(event) => setCatalogType(event.target.value as 'all' | LibraryCatalogType)}
          >
            <option value="all">All types</option>
            <option value="activity">Activities</option>
            <option value="resource">Resources</option>
            <option value="assessment">Assessments</option>
            <option value="standard">Standards</option>
          </select>
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

        <label>
          <span>Resource Format</span>
          <select
            value={resourceFormatId}
            onChange={(event) => setResourceFormatId(event.target.value)}
          >
            <option value="">All formats</option>
            {(data?.resourceFormats ?? []).map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
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
              <p className="page-eyebrow">Catalog</p>
              <h2>{visible.length} items</h2>
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
  onEdit,
  onArchive,
  onRestore,
}: {
  item: LibraryCatalogItemView;
  busy: boolean;
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
        {item.catalogType === 'resource' ? (
          <div>
            <dt>Resource Format</dt>
            <dd>{item.resourceFormatLabel ?? 'Not assigned'}</dd>
          </div>
        ) : null}
      </dl>

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
          <strong>Standards Catalog foundation</strong>
          <span>
            Import, Planning alignment, and coverage reporting are reserved for Phase 3F. This
            record already has the stable identity needed for that later work.
          </span>
        </div>
      ) : null}
    </>
  );
}
