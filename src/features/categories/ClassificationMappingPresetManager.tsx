import { Ban, CheckCircle2, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import type { CategoryFamilyId, CategoryValue } from '@/domain/models/entities';
import styles from '@/routes/CategoriesRoute.module.css';

import {
  classificationMappingPresetMutationService,
  type ClassificationMappingPresetEditorValues,
} from './classificationMappingPresetMutationService';
import {
  classificationMappingPresetHealthLabel,
  classificationMappingPresetReadService,
  type ClassificationMappingPresetWorkspaceItem,
} from './classificationMappingPresetReadService';

interface ClassificationMappingPresetManagerProps {
  familyId: CategoryFamilyId;
  familyLabel: string;
  values: readonly CategoryValue[];
}

type EditorState = {
  id?: string;
  sourceText: string;
  targetCategoryValueId: string;
};

function editorValues(editor: EditorState): ClassificationMappingPresetEditorValues {
  return {
    sourceText: editor.sourceText,
    targetCategoryValueId: editor.targetCategoryValueId,
  };
}

export function ClassificationMappingPresetManager({
  familyId,
  familyLabel,
  values,
}: ClassificationMappingPresetManagerProps) {
  const items = useLiveQuery(
    () => classificationMappingPresetReadService.listForFamily(familyId),
    [familyId],
  );
  const activeValues = useMemo(
    () =>
      values
        .filter((value) => value.lifecycleState === 'active')
        .sort(
          (first, second) =>
            first.sortOrder - second.sortOrder ||
            first.name.localeCompare(second.name, 'en', { sensitivity: 'base' }),
        ),
    [values],
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditor(null);
    setMessage(null);
    setError(null);
  }, [familyId]);

  function openCreate(): void {
    setEditor({
      sourceText: '',
      targetCategoryValueId: activeValues[0]?.id ?? '',
    });
    setMessage(null);
    setError(null);
  }

  function openEdit(item: ClassificationMappingPresetWorkspaceItem): void {
    setEditor({
      id: item.preset.id,
      sourceText: item.preset.sourceText,
      targetCategoryValueId: activeValues.some(
        (value) => value.id === item.preset.targetCategoryValueId,
      )
        ? item.preset.targetCategoryValueId
        : (activeValues[0]?.id ?? ''),
    });
    setMessage(null);
    setError(null);
  }

  async function save(): Promise<void> {
    if (!editor || busy) return;
    setBusy('editor');
    setMessage(null);
    setError(null);
    try {
      if (editor.id) {
        const updated = await classificationMappingPresetMutationService.update(
          editor.id,
          editorValues(editor),
        );
        setMessage(`Saved import mapping “${updated.sourceText}”.`);
      } else {
        const created = await classificationMappingPresetMutationService.create(
          familyId,
          editorValues(editor),
        );
        setMessage(`Created import mapping “${created.sourceText}”.`);
      }
      setEditor(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import mapping could not be saved.');
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(
    item: ClassificationMappingPresetWorkspaceItem,
    status: 'active' | 'inactive',
  ): Promise<void> {
    if (busy) return;
    setBusy(item.preset.id);
    setMessage(null);
    setError(null);
    try {
      await classificationMappingPresetMutationService.setStatus(item.preset.id, status);
      setMessage(
        `${status === 'active' ? 'Activated' : 'Deactivated'} import mapping “${item.preset.sourceText}”.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import mapping could not be changed.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: ClassificationMappingPresetWorkspaceItem): Promise<void> {
    if (busy) return;
    if (
      !window.confirm(
        `Delete import mapping “${item.preset.sourceText}”? Controlled values and imported records will not be changed.`,
      )
    ) {
      return;
    }
    setBusy(item.preset.id);
    setMessage(null);
    setError(null);
    try {
      await classificationMappingPresetMutationService.delete(item.preset.id);
      setMessage(`Deleted import mapping “${item.preset.sourceText}”.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import mapping could not be deleted.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className={`card ${styles.valuesCard}`}
      aria-labelledby="classification-mapping-presets-title"
    >
      <header className={styles.valuesHeader}>
        <div>
          <h2 id="classification-mapping-presets-title">Import mappings</h2>
          <p>
            Translate external text into canonical {familyLabel.toLowerCase()}. Mappings are shared
            by Activities, Resources, and Assessments imports.
          </p>
        </div>
        <button
          className="button button-primary"
          type="button"
          disabled={activeValues.length === 0}
          onClick={openCreate}
        >
          <Plus size={16} aria-hidden="true" /> New import mapping
        </button>
      </header>

      {editor ? (
        <section className={styles.mappingEditor} aria-label="Import mapping editor">
          <header className={styles.panelHeader}>
            <div>
              <h3>{editor.id ? 'Edit import mapping' : 'New import mapping'}</h3>
              <p>External text remains separate from controlled names and aliases.</p>
            </div>
            <button
              className="button button-icon"
              type="button"
              aria-label="Close import mapping editor"
              onClick={() => setEditor(null)}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </header>
          <div className={styles.mappingEditorGrid}>
            <label>
              <span>External text</span>
              <input
                className="input"
                autoFocus
                value={editor.sourceText}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, sourceText: event.target.value } : current,
                  )
                }
              />
            </label>
            <label>
              <span>Controlled target</span>
              <select
                className="select"
                value={editor.targetCategoryValueId}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, targetCategoryValueId: event.target.value } : current,
                  )
                }
              >
                {activeValues.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.panelActions}>
            <button
              className="button button-primary"
              type="button"
              disabled={
                !editor.sourceText.trim() || !editor.targetCategoryValueId || busy === 'editor'
              }
              onClick={() => void save()}
            >
              <Save size={16} aria-hidden="true" />
              {busy === 'editor' ? 'Saving…' : editor.id ? 'Save mapping' : 'Create mapping'}
            </button>
            <button className="button" type="button" onClick={() => setEditor(null)}>
              Cancel
            </button>
          </div>
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

      {items === undefined ? (
        <div className={styles.loadingState} role="status">
          Reading import mappings…
        </div>
      ) : null}
      {items !== undefined && activeValues.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Create an active controlled value before creating an import mapping.</p>
        </div>
      ) : null}
      {items !== undefined && items.length === 0 && activeValues.length > 0 ? (
        <div className={styles.emptyState}>
          <p>No import mappings for this family.</p>
          <button className="button" type="button" onClick={openCreate}>
            <Plus size={16} aria-hidden="true" /> Create the first mapping
          </button>
        </div>
      ) : null}
      {items && items.length > 0 ? (
        <div className={styles.mappingList}>
          {items.map((item) => (
            <article
              key={item.preset.id}
              className={styles.mappingRow}
              data-status={item.preset.status}
              aria-label={`${item.preset.sourceText} import mapping`}
            >
              <div className={styles.mappingIdentity}>
                <div>
                  <h3>{item.preset.sourceText}</h3>
                  <p>
                    Maps to <strong>{item.target?.name ?? 'Missing controlled value'}</strong>
                  </p>
                </div>
                <span className={styles.mappingHealth} data-health={item.health}>
                  {item.health === 'ready' ? (
                    <CheckCircle2 size={13} aria-hidden="true" />
                  ) : (
                    <Ban size={13} aria-hidden="true" />
                  )}
                  {classificationMappingPresetHealthLabel(item.health)}
                </span>
              </div>
              <div className={styles.rowActions}>
                <button
                  className="button"
                  type="button"
                  disabled={busy === item.preset.id}
                  onClick={() => openEdit(item)}
                >
                  <Pencil size={15} aria-hidden="true" /> Edit
                </button>
                {item.preset.status === 'active' ? (
                  <button
                    className="button"
                    type="button"
                    disabled={busy === item.preset.id}
                    onClick={() => void setStatus(item, 'inactive')}
                  >
                    <Ban size={15} aria-hidden="true" /> Deactivate
                  </button>
                ) : (
                  <button
                    className="button"
                    type="button"
                    disabled={busy === item.preset.id}
                    onClick={() => void setStatus(item, 'active')}
                  >
                    <RotateCcw size={15} aria-hidden="true" /> Activate
                  </button>
                )}
                <button
                  className="button"
                  type="button"
                  disabled={busy === item.preset.id}
                  onClick={() => void remove(item)}
                >
                  <Trash2 size={15} aria-hidden="true" /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
