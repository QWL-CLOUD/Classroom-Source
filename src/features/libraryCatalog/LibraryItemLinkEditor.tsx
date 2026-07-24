import { Archive, Link2, Plus, RefreshCcw, Search, Snowflake, Unlink, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type {
  LibraryApplicationLink,
  LibraryApplicationType,
  LibraryCatalogItem,
} from '@/domain/models/entities';
import {
  createLibraryApplicationLink,
  createLibraryApplicationSnapshot,
  removeLibraryApplicationLink,
  replaceLibraryApplicationLink,
  resolveLibraryApplicationView,
} from '@/features/libraryCatalog/libraryApplicationModel';
import {
  libraryCatalogTypeLabels,
  normalizeLibraryCatalogTags,
} from '@/features/libraryCatalog/libraryCatalogReadModel';
import {
  libraryCatalogTypedFieldsSearchText,
  libraryCatalogWorkflowDetails,
} from '@/features/libraryCatalog/libraryCatalogTypedFields';

import styles from './LibraryItemLinkEditor.module.css';

interface LibraryItemLinkEditorProps {
  idPrefix: string;
  label: string;
  description: string;
  links: readonly LibraryApplicationLink[];
  items: readonly LibraryCatalogItem[];
  allowedTypes: readonly LibraryApplicationType[];
  preferredType: LibraryApplicationType;
  disabled?: boolean;
  onChange: (links: LibraryApplicationLink[]) => void;
}

function searchableText(item: LibraryCatalogItem): string {
  return normalizeLibraryCatalogTags([
    item.title,
    item.description ?? '',
    ...item.tags,
    libraryCatalogTypeLabels[item.catalogType],
    libraryCatalogTypedFieldsSearchText(item),
  ])
    .join(' ')
    .toLocaleLowerCase('en');
}

export function LibraryItemLinkEditor({
  idPrefix,
  label,
  description,
  links,
  items,
  allowedTypes,
  preferredType,
  disabled = false,
  onChange,
}: LibraryItemLinkEditorProps) {
  const [query, setQuery] = useState('');
  const [catalogType, setCatalogType] = useState<LibraryApplicationType>(preferredType);
  const [captureSnapshot, setCaptureSnapshot] = useState(false);

  useEffect(() => {
    if (!allowedTypes.includes(catalogType)) setCatalogType(preferredType);
  }, [allowedTypes, catalogType, preferredType]);

  const attachedIds = useMemo(() => new Set(links.map((link) => link.libraryItemId)), [links]);
  const available = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('en');
    return items
      .filter(
        (item): item is LibraryCatalogItem & { catalogType: LibraryApplicationType } =>
          item.catalogType !== 'standard' &&
          item.status === 'active' &&
          allowedTypes.includes(item.catalogType) &&
          item.catalogType === catalogType &&
          !attachedIds.has(item.id) &&
          (!normalizedQuery || searchableText(item).includes(normalizedQuery)),
      )
      .sort(
        (first, second) =>
          first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
          first.id.localeCompare(second.id),
      )
      .slice(0, 30);
  }, [allowedTypes, attachedIds, catalogType, items, query]);

  function attach(item: LibraryCatalogItem): void {
    onChange([...links, createLibraryApplicationLink(item, { captureSnapshot })]);
  }

  return (
    <section className={styles.editor} aria-label={label}>
      <div className={styles.heading}>
        <div>
          <strong>{label}</strong>
          <p>{description}</p>
        </div>
        <span className={styles.count}>{links.length}</span>
      </div>

      {links.length > 0 ? (
        <ul className={styles.attachedList}>
          {links.map((link) => {
            const source = items.find((item) => item.id === link.libraryItemId);
            const view = resolveLibraryApplicationView(link, items);
            const workflowDetails = libraryCatalogWorkflowDetails(view.typedFields);
            return (
              <li key={link.libraryItemId} className={styles.attachedItem}>
                <div className={styles.itemIdentity}>
                  <span className={styles.itemIcon}>
                    {view.usesSnapshot ? (
                      <Snowflake size={15} aria-hidden="true" />
                    ) : (
                      <Link2 size={15} aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <strong>{view.title}</strong>
                    <small>
                      {libraryCatalogTypeLabels[view.catalogType]} ·{' '}
                      {view.usesSnapshot ? 'Frozen snapshot' : 'Live source'}
                      {view.sourceStatus === 'archived' ? ' · Source archived' : ''}
                      {view.sourceStatus === 'missing' ? ' · Source unavailable' : ''}
                    </small>
                  </div>
                </div>
                {view.description ? <p>{view.description}</p> : null}
                {workflowDetails.length > 0 ? (
                  <dl className={styles.workflowDetails}>
                    {workflowDetails.map((detail) => (
                      <div key={detail.label}>
                        <dt>{detail.label}</dt>
                        <dd>{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <div className={styles.itemActions}>
                  {view.usesSnapshot ? (
                    <>
                      <button
                        className="button button-quiet"
                        type="button"
                        disabled={disabled || !source || source.catalogType === 'standard'}
                        onClick={() => {
                          if (!source || source.catalogType === 'standard') return;
                          onChange(
                            replaceLibraryApplicationLink(links, {
                              ...link,
                              snapshot: createLibraryApplicationSnapshot(source),
                            }),
                          );
                        }}
                      >
                        <RefreshCcw size={14} aria-hidden="true" /> Refresh snapshot
                      </button>
                      <button
                        className="button button-quiet"
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          onChange(
                            replaceLibraryApplicationLink(links, {
                              ...link,
                              snapshot: undefined,
                            }),
                          )
                        }
                      >
                        <Link2 size={14} aria-hidden="true" /> Use live source
                      </button>
                    </>
                  ) : (
                    <button
                      className="button button-quiet"
                      type="button"
                      disabled={disabled || !source || source.catalogType === 'standard'}
                      onClick={() => {
                        if (!source || source.catalogType === 'standard') return;
                        onChange(
                          replaceLibraryApplicationLink(links, {
                            ...link,
                            snapshot: createLibraryApplicationSnapshot(source),
                          }),
                        );
                      }}
                    >
                      <Snowflake size={14} aria-hidden="true" /> Freeze version
                    </button>
                  )}
                  <button
                    className="button button-quiet"
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange(removeLibraryApplicationLink(links, link.libraryItemId))
                    }
                  >
                    <Unlink size={14} aria-hidden="true" /> Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>No Library items attached here.</p>
      )}

      <details className={styles.picker}>
        <summary className="button">
          <Plus size={15} aria-hidden="true" /> Add from Library
        </summary>
        <div className={styles.pickerPanel}>
          <div className={styles.pickerControls}>
            <label htmlFor={`${idPrefix}-library-type`}>
              <span>Type</span>
              <select
                id={`${idPrefix}-library-type`}
                value={catalogType}
                disabled={disabled}
                onChange={(event) => setCatalogType(event.target.value as LibraryApplicationType)}
              >
                {allowedTypes.map((type) => (
                  <option key={type} value={type}>
                    {libraryCatalogTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.searchField} htmlFor={`${idPrefix}-library-search`}>
              <span>Search</span>
              <div>
                <Search size={15} aria-hidden="true" />
                <input
                  id={`${idPrefix}-library-search`}
                  value={query}
                  disabled={disabled}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Title, description, tags, or workflow fields"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Clear Library search"
                    disabled={disabled}
                    onClick={() => setQuery('')}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </label>
          </div>

          <label className={styles.snapshotChoice}>
            <input
              type="checkbox"
              checked={captureSnapshot}
              disabled={disabled}
              onChange={(event) => setCaptureSnapshot(event.target.checked)}
            />
            <span>
              Freeze the current version for this application. Leave off to follow future Catalog
              edits through the stable source link.
            </span>
          </label>

          {available.length > 0 ? (
            <ul className={styles.resultList}>
              {available.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.description || item.tags.join(' · ') || 'No description'}</small>
                  </div>
                  <button
                    className="button"
                    type="button"
                    disabled={disabled}
                    onClick={() => attach(item)}
                  >
                    <Plus size={14} aria-hidden="true" /> Attach
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.noResults}>
              <Archive size={16} aria-hidden="true" /> No active unattached items match this view.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
