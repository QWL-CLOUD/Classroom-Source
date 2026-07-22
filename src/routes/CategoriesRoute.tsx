import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Merge,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type {
  CategoryColorKey,
  CategoryFamilyId,
  CategoryIconKey,
  CategoryValue,
} from '@/domain/models/entities';
import { CATEGORY_FAMILIES, getCategoryFamily } from '@/features/categories/categoryFamilies';
import {
  CategoryMergeHistoryDependencyError,
  CategoryValueInUseError,
  categoryMutationService,
} from '@/features/categories/categoryMutationService';
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  canArchiveDirectly,
  categoryUsageLabel,
  filterCategoryWorkspaceItems,
  replacementGuidance,
  type CategoryWorkspaceItem,
  type CategoryWorkspaceView,
} from '@/features/categories/categoryWorkspacePresentation';
import { useCategoryWorkspace } from '@/features/categories/useCategoryWorkspace';

import styles from './CategoriesRoute.module.css';

const ICON_SYMBOLS: Record<CategoryIconKey, string> = {
  tag: '#',
  focus: '◎',
  target: '◉',
  shapes: '◇',
  file: '▤',
  'check-square': '☑',
  'heart-handshake': '♡',
  'book-open': '▣',
  star: '★',
  flag: '⚑',
  bookmark: '⌑',
  palette: '◐',
};

type EditorState = {
  mode: 'create' | 'edit';
  id?: string;
  name: string;
  colorKey: CategoryColorKey | '';
  iconKey: CategoryIconKey | '';
};

type CombineState = {
  sourceId: string;
  targetId: string;
  mode: 'replace-and-archive' | 'merge';
};

function isFamilyId(value: string | null): value is CategoryFamilyId {
  return CATEGORY_FAMILIES.some((family) => family.id === value);
}

function editorFromValue(value: CategoryValue): EditorState {
  return {
    mode: 'edit',
    id: value.id,
    name: value.name,
    colorKey: value.colorKey ?? '',
    iconKey: value.iconKey ?? '',
  };
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof CategoryValueInUseError) return error.message;
  if (error instanceof CategoryMergeHistoryDependencyError) return error.message;
  if (error instanceof Error) return error.message;
  return 'The category change could not be completed.';
}

function valueById(
  items: readonly CategoryWorkspaceItem[],
  id: string,
): CategoryWorkspaceItem | null {
  return items.find((item) => item.value.id === id) ?? null;
}

export function CategoriesRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFamily = searchParams.get('family');
  const familyId: CategoryFamilyId = isFamilyId(requestedFamily) ? requestedFamily : 'purpose-tag';
  const family = getCategoryFamily(familyId);
  const state = useCategoryWorkspace(familyId);
  const [view, setView] = useState<CategoryWorkspaceView>('active');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [combine, setCombine] = useState<CombineState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = state.status === 'ready' ? state.items : [];
  const visibleItems = useMemo(() => filterCategoryWorkspaceItems(items, view), [items, view]);
  const activeItems = useMemo(() => filterCategoryWorkspaceItems(items, 'active'), [items]);
  const archivedCount = useMemo(
    () => filterCategoryWorkspaceItems(items, 'archived').length,
    [items],
  );
  const historyCount = useMemo(
    () => filterCategoryWorkspaceItems(items, 'history').length,
    [items],
  );
  const sourceItem = combine ? valueById(items, combine.sourceId) : null;
  const replacementOptions = sourceItem
    ? activeItems.filter((item) => item.value.id !== sourceItem.value.id)
    : [];

  function chooseFamily(nextFamilyId: CategoryFamilyId): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('family', nextFamilyId);
    setSearchParams(nextParams, { replace: true });
    setView('active');
    setEditor(null);
    setCombine(null);
    setError(null);
    setMessage(null);
  }

  function openCreate(): void {
    setEditor({ mode: 'create', name: '', colorKey: '', iconKey: '' });
    setCombine(null);
    setError(null);
    setMessage(null);
  }

  function openEdit(item: CategoryWorkspaceItem): void {
    setEditor(editorFromValue(item.value));
    setCombine(null);
    setError(null);
    setMessage(null);
  }

  function openCombine(item: CategoryWorkspaceItem): void {
    const firstReplacement = activeItems.find((candidate) => candidate.value.id !== item.value.id);
    setCombine({
      sourceId: item.value.id,
      targetId: firstReplacement?.value.id ?? '',
      mode: item.usage.mergedSourceCount > 0 ? 'merge' : 'replace-and-archive',
    });
    setEditor(null);
    setError(null);
    setMessage(null);
  }

  async function saveEditor(): Promise<void> {
    if (!editor || busy) return;
    setBusy('editor');
    setError(null);
    setMessage(null);
    try {
      const values = {
        name: editor.name,
        colorKey: editor.colorKey || undefined,
        iconKey: editor.iconKey || undefined,
      };
      if (editor.mode === 'create') {
        const created = await categoryMutationService.create(familyId, values);
        setMessage(`Created “${created.name}”.`);
      } else if (editor.id) {
        const updated = await categoryMutationService.update(editor.id, values);
        setMessage(`Saved “${updated.name}”.`);
      }
      setEditor(null);
    } catch (cause) {
      setError(mutationErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function move(item: CategoryWorkspaceItem, direction: 'earlier' | 'later'): Promise<void> {
    if (busy) return;
    setBusy(item.value.id);
    setError(null);
    setMessage(null);
    try {
      await categoryMutationService.move(item.value.id, direction);
      setMessage(
        `${direction === 'earlier' ? 'Moved earlier' : 'Moved later'} “${item.value.name}”.`,
      );
    } catch (cause) {
      setError(mutationErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function setDefault(item: CategoryWorkspaceItem): Promise<void> {
    if (busy) return;
    setBusy(item.value.id);
    setError(null);
    setMessage(null);
    try {
      await categoryMutationService.setDefault(item.value.id);
      setMessage(`“${item.value.name}” is now the ${family.label} default.`);
    } catch (cause) {
      setError(mutationErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function archiveValue(item: CategoryWorkspaceItem): Promise<void> {
    if (!canArchiveDirectly(item)) {
      openCombine(item);
      return;
    }
    if (!window.confirm(`Archive “${item.value.name}”? It will disappear from new selections.`)) {
      return;
    }
    setBusy(item.value.id);
    setError(null);
    setMessage(null);
    try {
      await categoryMutationService.archive(item.value.id);
      setMessage(`Archived “${item.value.name}”. Existing history remains intact.`);
    } catch (cause) {
      if (
        cause instanceof CategoryValueInUseError ||
        cause instanceof CategoryMergeHistoryDependencyError
      ) {
        openCombine(item);
        setError(cause.message);
      } else {
        setError(mutationErrorMessage(cause));
      }
    } finally {
      setBusy(null);
    }
  }

  async function restoreValue(item: CategoryWorkspaceItem): Promise<void> {
    if (busy) return;
    setBusy(item.value.id);
    setError(null);
    setMessage(null);
    try {
      await categoryMutationService.restore(item.value.id);
      setMessage(`Restored “${item.value.name}”.`);
    } catch (cause) {
      setError(mutationErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function deleteValue(item: CategoryWorkspaceItem): Promise<void> {
    if (busy) return;
    if (!window.confirm(`Delete unused category value “${item.value.name}”? This can be undone.`)) {
      return;
    }
    setBusy(item.value.id);
    setError(null);
    setMessage(null);
    try {
      await categoryMutationService.deleteUnused(item.value.id);
      setMessage(`Deleted unused value “${item.value.name}”.`);
    } catch (cause) {
      setError(mutationErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function combineValues(): Promise<void> {
    if (!combine || !sourceItem || !combine.targetId || busy) return;
    const target = valueById(items, combine.targetId);
    if (!target) return;
    const actionLabel = combine.mode === 'merge' ? 'Merge' : 'Replace and archive';
    const confirmation =
      combine.mode === 'merge'
        ? `Merge “${sourceItem.value.name}” into “${target.value.name}”? Assignments will move, former names will remain as aliases, and the merge can be undone.`
        : `Replace “${sourceItem.value.name}” with “${target.value.name}” and archive the old value? Assignments will move in one undoable transaction.`;
    if (!window.confirm(confirmation)) return;

    setBusy(sourceItem.value.id);
    setError(null);
    setMessage(null);
    try {
      if (combine.mode === 'merge') {
        await categoryMutationService.merge(sourceItem.value.id, target.value.id);
      } else {
        await categoryMutationService.replaceAndArchive(sourceItem.value.id, target.value.id);
      }
      setMessage(`${actionLabel} completed for “${sourceItem.value.name}”.`);
      setCombine(null);
    } catch (cause) {
      setError(mutationErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Resources</p>
          <h1 className="page-title">Categories &amp; Labels</h1>
          <p className="page-subtitle">
            Manage stable shared vocabulary without breaking linked plans, tasks, notices, or future
            catalog records.
          </p>
        </div>
        <button className="button button-primary" type="button" onClick={openCreate}>
          <Plus size={17} aria-hidden="true" /> New {family.label.replace(/s$/, '')}
        </button>
      </header>

      <div className={styles.workspaceGrid}>
        <nav className={`card ${styles.familyNavigation}`} aria-label="Category families">
          <label className={styles.mobileFamilyPicker}>
            <span>Category family</span>
            <select
              className="select"
              value={familyId}
              onChange={(event) => chooseFamily(event.target.value as CategoryFamilyId)}
            >
              {CATEGORY_FAMILIES.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.familyList}>
            {CATEGORY_FAMILIES.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                data-selected={candidate.id === familyId}
                aria-current={candidate.id === familyId ? 'page' : undefined}
                onClick={() => chooseFamily(candidate.id)}
              >
                <span>
                  <strong>{candidate.label}</strong>
                  <small>
                    {candidate.assignmentAvailability === 'current'
                      ? 'Available now'
                      : 'Future use'}
                  </small>
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </nav>

        <div className={styles.mainColumn}>
          <section
            className={`card ${styles.familySummary}`}
            aria-labelledby="category-family-title"
          >
            <div>
              <p className="page-eyebrow">Managed family</p>
              <h2 id="category-family-title">{family.label}</h2>
              <p>{family.description}</p>
            </div>
            <dl>
              <div>
                <dt>Selection</dt>
                <dd>{family.selectionMode === 'multiple' ? 'Multiple values' : 'One value'}</dd>
              </div>
              <div>
                <dt>Assignment</dt>
                <dd>
                  {family.assignmentAvailability === 'current'
                    ? 'Available now'
                    : 'Reserved for a later phase'}
                </dd>
              </div>
            </dl>
          </section>

          {editor ? (
            <section className={`card ${styles.editorCard}`} aria-label="Category value editor">
              <header className={styles.panelHeader}>
                <div>
                  <h2>
                    {editor.mode === 'create'
                      ? `New ${family.label.replace(/s$/, '')}`
                      : 'Edit category value'}
                  </h2>
                  <p>Names keep stable IDs. Renamed values retain their former names as aliases.</p>
                </div>
                <button
                  className="button button-icon"
                  type="button"
                  aria-label="Close category editor"
                  onClick={() => setEditor(null)}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </header>
              <div className={styles.editorGrid}>
                <label>
                  <span>Name</span>
                  <input
                    className="input"
                    value={editor.name}
                    autoFocus
                    onChange={(event) =>
                      setEditor((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                  />
                </label>
                <label>
                  <span>Color</span>
                  <select
                    className="select"
                    value={editor.colorKey}
                    onChange={(event) =>
                      setEditor((current) =>
                        current
                          ? { ...current, colorKey: event.target.value as CategoryColorKey | '' }
                          : current,
                      )
                    }
                  >
                    <option value="">No color</option>
                    {CATEGORY_COLOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Icon</span>
                  <select
                    className="select"
                    value={editor.iconKey}
                    onChange={(event) =>
                      setEditor((current) =>
                        current
                          ? { ...current, iconKey: event.target.value as CategoryIconKey | '' }
                          : current,
                      )
                    }
                  >
                    <option value="">No icon</option>
                    {CATEGORY_ICON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.panelActions}>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={!editor.name.trim() || busy === 'editor'}
                  onClick={() => void saveEditor()}
                >
                  <Save size={16} aria-hidden="true" />{' '}
                  {busy === 'editor'
                    ? 'Saving…'
                    : editor.mode === 'create'
                      ? 'Create value'
                      : 'Save changes'}
                </button>
                <button className="button" type="button" onClick={() => setEditor(null)}>
                  Cancel
                </button>
              </div>
            </section>
          ) : null}

          {combine && sourceItem ? (
            <section className={`card ${styles.resolveCard}`} aria-label="Resolve category use">
              <header className={styles.panelHeader}>
                <div>
                  <h2>Resolve “{sourceItem.value.name}”</h2>
                  <p>{replacementGuidance(sourceItem)}</p>
                </div>
                <button
                  className="button button-icon"
                  type="button"
                  aria-label="Close resolution panel"
                  onClick={() => setCombine(null)}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </header>

              {replacementOptions.length === 0 ? (
                <p className={styles.panelNotice}>
                  Create another active {family.label.replace(/s$/, '').toLowerCase()} before
                  replacing this value.
                </p>
              ) : (
                <>
                  <div className={styles.resolveGrid}>
                    <label>
                      <span>Replacement value</span>
                      <select
                        className="select"
                        value={combine.targetId}
                        onChange={(event) =>
                          setCombine((current) =>
                            current ? { ...current, targetId: event.target.value } : current,
                          )
                        }
                      >
                        {replacementOptions.map((item) => (
                          <option key={item.value.id} value={item.value.id}>
                            {item.value.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <fieldset>
                      <legend>Resolution method</legend>
                      <label>
                        <input
                          type="radio"
                          name="combine-mode"
                          value="replace-and-archive"
                          checked={combine.mode === 'replace-and-archive'}
                          disabled={sourceItem.usage.mergedSourceCount > 0}
                          onChange={() =>
                            setCombine((current) =>
                              current ? { ...current, mode: 'replace-and-archive' } : current,
                            )
                          }
                        />
                        <span>
                          <strong>Replace and Archive</strong>
                          <small>Move assignments and archive the old value.</small>
                        </span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="combine-mode"
                          value="merge"
                          checked={combine.mode === 'merge'}
                          onChange={() =>
                            setCombine((current) =>
                              current ? { ...current, mode: 'merge' } : current,
                            )
                          }
                        />
                        <span>
                          <strong>Merge</strong>
                          <small>Move assignments and retain former names as aliases.</small>
                        </span>
                      </label>
                    </fieldset>
                  </div>
                  <div className={styles.panelActions}>
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={!combine.targetId || busy === sourceItem.value.id}
                      onClick={() => void combineValues()}
                    >
                      <Merge size={16} aria-hidden="true" />{' '}
                      {busy === sourceItem.value.id
                        ? 'Working…'
                        : combine.mode === 'merge'
                          ? 'Merge values'
                          : 'Replace and archive'}
                    </button>
                    <button className="button" type="button" onClick={() => setCombine(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : null}

          {message ? (
            <p className={styles.success} role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <section className={`card ${styles.valuesCard}`} aria-labelledby="category-values-title">
            <header className={styles.valuesHeader}>
              <div>
                <h2 id="category-values-title">Values</h2>
                <p>Archived values stay visible in history but disappear from new selections.</p>
              </div>
              <div className={styles.viewTabs} role="group" aria-label="Category value status">
                <button
                  type="button"
                  data-selected={view === 'active'}
                  onClick={() => setView('active')}
                >
                  Active <span>{activeItems.length}</span>
                </button>
                <button
                  type="button"
                  data-selected={view === 'archived'}
                  onClick={() => setView('archived')}
                >
                  Archived <span>{archivedCount}</span>
                </button>
                <button
                  type="button"
                  data-selected={view === 'history'}
                  onClick={() => setView('history')}
                >
                  Merge history <span>{historyCount}</span>
                </button>
              </div>
            </header>

            {state.status === 'loading' ? (
              <div className={styles.loadingState} role="status">
                Reading category values…
              </div>
            ) : null}
            {state.status === 'error' ? (
              <div className={styles.error} role="alert">
                Category values could not be loaded: {state.message}
              </div>
            ) : null}
            {state.status === 'ready' && visibleItems.length === 0 ? (
              <div className={styles.emptyState}>
                <p>
                  {view === 'active'
                    ? `No active ${family.label.toLowerCase()} yet.`
                    : view === 'archived'
                      ? 'No archived values.'
                      : 'No merge history.'}
                </p>
                {view === 'active' ? (
                  <button className="button" type="button" onClick={openCreate}>
                    <Plus size={16} aria-hidden="true" /> Create the first value
                  </button>
                ) : null}
              </div>
            ) : null}

            {state.status === 'ready' && visibleItems.length > 0 ? (
              <div className={styles.valueList}>
                {visibleItems.map((item, index) => {
                  const value = item.value;
                  const mergedTarget = value.mergedIntoId
                    ? valueById(items, value.mergedIntoId)
                    : null;
                  return (
                    <article
                      key={value.id}
                      className={styles.valueRow}
                      data-lifecycle={value.lifecycleState}
                      aria-label={`${value.name} category value`}
                    >
                      <div className={styles.valueIdentity}>
                        <span
                          className={styles.valueMark}
                          data-color={value.colorKey ?? 'neutral'}
                          aria-hidden="true"
                        >
                          {value.iconKey ? ICON_SYMBOLS[value.iconKey] : '#'}
                        </span>
                        <div>
                          <div className={styles.valueTitleRow}>
                            <h3>{value.name}</h3>
                            {value.isDefault ? (
                              <span className={styles.defaultBadge}>
                                <Check size={12} aria-hidden="true" /> Default
                              </span>
                            ) : null}
                            <span className={styles.usageBadge}>
                              {categoryUsageLabel(item.usage)}
                            </span>
                          </div>
                          <p>
                            {value.lifecycleState === 'merged'
                              ? `Merged into ${mergedTarget?.value.name ?? 'another value'}.`
                              : value.aliases.length > 0
                                ? `Aliases: ${value.aliases.join(', ')}`
                                : 'No aliases.'}
                            {item.usage.mergedSourceCount > 0
                              ? ` ${item.usage.mergedSourceCount} historical ${item.usage.mergedSourceCount === 1 ? 'value resolves' : 'values resolve'} here.`
                              : ''}
                          </p>
                        </div>
                      </div>

                      {value.lifecycleState === 'active' ? (
                        <div className={styles.rowActions}>
                          <button
                            className="button button-icon"
                            type="button"
                            aria-label={`Move ${value.name} earlier`}
                            title="Move earlier"
                            disabled={index === 0 || busy === value.id}
                            onClick={() => void move(item, 'earlier')}
                          >
                            <ArrowUp size={16} aria-hidden="true" />
                          </button>
                          <button
                            className="button button-icon"
                            type="button"
                            aria-label={`Move ${value.name} later`}
                            title="Move later"
                            disabled={index === visibleItems.length - 1 || busy === value.id}
                            onClick={() => void move(item, 'later')}
                          >
                            <ArrowDown size={16} aria-hidden="true" />
                          </button>
                          {!value.isDefault ? (
                            <button
                              className="button"
                              type="button"
                              disabled={busy === value.id}
                              onClick={() => void setDefault(item)}
                            >
                              Set default
                            </button>
                          ) : null}
                          <details className={styles.moreMenu}>
                            <summary aria-label={`More actions for ${value.name}`}>
                              <MoreHorizontal size={18} aria-hidden="true" />
                              <span>More</span>
                            </summary>
                            <div>
                              <button type="button" onClick={() => openEdit(item)}>
                                <Pencil size={15} aria-hidden="true" /> Edit
                              </button>
                              <button type="button" onClick={() => void archiveValue(item)}>
                                {canArchiveDirectly(item) ? (
                                  <Archive size={15} aria-hidden="true" />
                                ) : (
                                  <Merge size={15} aria-hidden="true" />
                                )}
                                {canArchiveDirectly(item) ? 'Archive' : 'Resolve use'}
                              </button>
                              <button
                                type="button"
                                disabled={!canArchiveDirectly(item)}
                                onClick={() => void deleteValue(item)}
                              >
                                <Trash2 size={15} aria-hidden="true" /> Delete unused
                              </button>
                            </div>
                          </details>
                        </div>
                      ) : null}

                      {value.lifecycleState === 'archived' ? (
                        <div className={styles.rowActions}>
                          <button
                            className="button"
                            type="button"
                            disabled={busy === value.id}
                            onClick={() => void restoreValue(item)}
                          >
                            <RotateCcw size={16} aria-hidden="true" /> Restore
                          </button>
                          <button
                            className="button"
                            type="button"
                            disabled={busy === value.id || !canArchiveDirectly(item)}
                            onClick={() => void deleteValue(item)}
                          >
                            <Trash2 size={16} aria-hidden="true" /> Delete unused
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}
