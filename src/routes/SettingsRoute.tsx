import {
  Archive,
  CalendarClock,
  CheckCircle2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type { SchoolYear } from '@/domain/models/entities';
import {
  buildNextSchoolYearValues,
  createEmptySchoolYearValues,
  type SchoolYearEditorValues,
} from '@/features/schoolYears/schoolYearEditorModel';
import {
  schoolYearMutationError,
  schoolYearMutationService,
} from '@/features/schoolYears/schoolYearMutationService';
import { useSchoolYears } from '@/features/schoolYears/useSchoolYears';

import styles from './SettingsRoute.module.css';

type EditorState =
  | {
      mode: 'create';
      values: SchoolYearEditorValues;
      makeActive: boolean;
      source: 'new' | 'rollover';
    }
  | { mode: 'edit'; id: string; values: SchoolYearEditorValues }
  | null;

function valuesFromSchoolYear(schoolYear: SchoolYear): SchoolYearEditorValues {
  return {
    label: schoolYear.label,
    startsOn: schoolYear.startsOn,
    endsOn: schoolYear.endsOn,
  };
}

export function SettingsRoute() {
  const state = useSchoolYears();
  const [editor, setEditor] = useState<EditorState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (state.status !== 'ready' || state.data.items.length > 0 || editor) return;
    setEditor({
      mode: 'create',
      values: createEmptySchoolYearValues(),
      makeActive: true,
      source: 'new',
    });
  }, [editor, state]);

  function openCreate(): void {
    setEditor({
      mode: 'create',
      values: createEmptySchoolYearValues(),
      makeActive: state.status === 'ready' && state.data.activeSchoolYearCount === 0,
      source: 'new',
    });
    setError(null);
    setMessage(null);
  }

  function openRollover(): void {
    if (state.status !== 'ready' || !state.data.activeSchoolYear) return;
    setEditor({
      mode: 'create',
      values: buildNextSchoolYearValues(state.data.activeSchoolYear),
      makeActive: false,
      source: 'rollover',
    });
    setError(null);
    setMessage(null);
  }

  function openEdit(schoolYear: SchoolYear): void {
    setEditor({ mode: 'edit', id: schoolYear.id, values: valuesFromSchoolYear(schoolYear) });
    setError(null);
    setMessage(null);
  }

  function updateEditor(name: keyof SchoolYearEditorValues, value: string): void {
    setEditor((current) =>
      current ? { ...current, values: { ...current.values, [name]: value } } : current,
    );
    setError(null);
  }

  async function save(): Promise<void> {
    if (!editor || busyId) return;
    setBusyId('editor');
    setError(null);
    setMessage(null);
    try {
      if (editor.mode === 'create') {
        const created = await schoolYearMutationService.create(editor.values, {
          makeActive: editor.makeActive,
        });
        setMessage(
          editor.source === 'rollover'
            ? `Prepared ${created.label}. Learners, schedules, plans, sessions, and history were not copied or moved.`
            : `Created ${created.label}${created.active ? ' and set it as active' : ''}.`,
        );
      } else {
        const updated = await schoolYearMutationService.update(editor.id, editor.values);
        setMessage(`Saved ${updated.label}.`);
      }
      setEditor(null);
    } catch (cause) {
      setError(schoolYearMutationError(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function setActive(schoolYear: SchoolYear): Promise<void> {
    if (busyId) return;
    if (
      !window.confirm(
        `Set “${schoolYear.label}” as the active school year?\n\nExisting learner contexts, plans, sessions, schedules, and history will stay in their current school year. New work will use the new active-year context where supported.`,
      )
    ) {
      return;
    }
    setBusyId(schoolYear.id);
    setError(null);
    setMessage(null);
    try {
      await schoolYearMutationService.setActive(schoolYear.id);
      setMessage(
        `${schoolYear.label} is now the active school year. Existing records were not moved.`,
      );
    } catch (cause) {
      setError(schoolYearMutationError(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleArchive(schoolYear: SchoolYear): Promise<void> {
    if (busyId) return;
    const verb = schoolYear.lifecycleState === 'archived' ? 'restore' : 'archive';
    if (!window.confirm(`${verb === 'restore' ? 'Restore' : 'Archive'} “${schoolYear.label}”?`)) {
      return;
    }
    setBusyId(schoolYear.id);
    setError(null);
    setMessage(null);
    try {
      if (schoolYear.lifecycleState === 'archived') {
        await schoolYearMutationService.restore(schoolYear.id);
        setMessage(`Restored ${schoolYear.label}.`);
      } else {
        await schoolYearMutationService.archive(schoolYear.id);
        setMessage(`Archived ${schoolYear.label}. Linked historical records remain available.`);
      }
    } catch (cause) {
      setError(schoolYearMutationError(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(schoolYear: SchoolYear): Promise<void> {
    if (busyId) return;
    if (!window.confirm(`Delete empty school year “${schoolYear.label}”? This can be undone.`))
      return;
    setBusyId(schoolYear.id);
    setError(null);
    setMessage(null);
    try {
      await schoolYearMutationService.delete(schoolYear.id);
      setMessage(`Deleted empty school year ${schoolYear.label}.`);
    } catch (cause) {
      setError(schoolYearMutationError(cause));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="school-years">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Settings &amp; Data</p>
          <h1 className="page-title">School Years</h1>
          <p className="page-subtitle">
            Manage the active school year and preserve historical years without moving or deleting
            teaching records.
          </p>
        </div>
        <div className={styles.actions}>
          {state.status === 'ready' && state.data.activeSchoolYear ? (
            <button className="button" type="button" onClick={openRollover}>
              <CalendarClock size={17} aria-hidden="true" /> Prepare next school year
            </button>
          ) : null}
          <button className="button button-primary" type="button" onClick={openCreate}>
            <Plus size={17} aria-hidden="true" /> New school year
          </button>
        </div>
      </header>

      {state.status === 'loading' ? (
        <div className={`card ${styles.loadingState}`} role="status">
          Reading school years…
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className={`card ${styles.error}`} role="alert">
          School years could not be loaded: {state.message}
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <div className={styles.summaryGrid} aria-label="School year summary">
            <article className={`card ${styles.summaryCard}`}>
              <span>Active school year</span>
              <strong>{state.data.activeSchoolYear?.label ?? 'None configured'}</strong>
              <small>
                {state.data.activeSchoolYear
                  ? `${state.data.activeSchoolYear.startsOn} through ${state.data.activeSchoolYear.endsOn}`
                  : 'Create or activate one school year.'}
              </small>
            </article>
            <article className={`card ${styles.summaryCard}`}>
              <span>Available years</span>
              <strong>{state.data.items.length - state.data.archivedCount}</strong>
              <small>{state.data.archivedCount} archived</small>
            </article>
            <article className={`card ${styles.summaryCard}`}>
              <span>Active-year integrity</span>
              <strong>{state.data.activeSchoolYearCount === 1 ? 'Ready' : 'Needs review'}</strong>
              <small>{state.data.activeSchoolYearCount} records marked active</small>
            </article>
          </div>

          <section className={styles.rolloverCallout} data-tone={state.data.rolloverTone}>
            <div>
              <h2>Rollover readiness</h2>
              <p>{state.data.rolloverMessage}</p>
              <p className={styles.sectionIntro}>
                Preparing a year only creates the school-year container. Learner continuation, class
                placement, and schedule copying remain future preview-based workflows.
              </p>
            </div>
            {state.data.activeSchoolYear ? (
              <button className="button" type="button" onClick={openRollover}>
                Prepare next year
              </button>
            ) : (
              <button className="button" type="button" onClick={openCreate}>
                Create first year
              </button>
            )}
          </section>

          {editor ? (
            <section className={`card ${styles.editorCard}`} aria-label="School year editor">
              <div className={styles.editorHeader}>
                <div>
                  <h2>
                    {editor.mode === 'edit'
                      ? 'Edit school year'
                      : editor.source === 'rollover'
                        ? 'Prepare next school year'
                        : 'New school year'}
                  </h2>
                  <p>
                    Dates and labels can be edited later. Creating a year never copies or moves
                    existing records.
                  </p>
                </div>
                <button className="button" type="button" onClick={() => setEditor(null)}>
                  <X size={16} aria-hidden="true" /> Close
                </button>
              </div>

              <div className={styles.editorGrid}>
                <label>
                  <span>School year name</span>
                  <input
                    className="input"
                    value={editor.values.label}
                    autoFocus
                    onChange={(event) => updateEditor('label', event.target.value)}
                  />
                </label>
                <label>
                  <span>Start date</span>
                  <input
                    className="input"
                    type="date"
                    value={editor.values.startsOn}
                    onChange={(event) => updateEditor('startsOn', event.target.value)}
                  />
                </label>
                <label>
                  <span>End date</span>
                  <input
                    className="input"
                    type="date"
                    value={editor.values.endsOn}
                    onChange={(event) => updateEditor('endsOn', event.target.value)}
                  />
                </label>
              </div>

              {editor.mode === 'create' ? (
                <label className={styles.activeChoice}>
                  <input
                    type="checkbox"
                    checked={editor.makeActive}
                    onChange={(event) =>
                      setEditor((current) =>
                        current?.mode === 'create'
                          ? { ...current, makeActive: event.target.checked }
                          : current,
                      )
                    }
                  />
                  <span>
                    <strong>Set as active when created</strong>
                    <br />
                    Existing records stay assigned to their current school year.
                  </span>
                </label>
              ) : null}

              <div className={styles.editorActions}>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={busyId === 'editor'}
                  onClick={() => void save()}
                >
                  <Save size={16} aria-hidden="true" />
                  {busyId === 'editor' ? 'Saving…' : 'Save school year'}
                </button>
                <button className="button" type="button" onClick={() => setEditor(null)}>
                  Cancel
                </button>
              </div>
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
            </section>
          ) : null}

          {message ? (
            <p className={styles.success} role="status">
              {message}
            </p>
          ) : null}
          {!editor && error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <section className={`card ${styles.listCard}`} aria-labelledby="school-year-list-heading">
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="school-year-list-heading">All school years</h2>
                <p>Active, available, and archived years share stable IDs.</p>
              </div>
            </div>

            {state.data.items.length === 0 ? (
              <div className={styles.emptyState} role="status">
                <p>No school years have been created.</p>
                <button className="button button-primary" type="button" onClick={openCreate}>
                  Create first school year
                </button>
              </div>
            ) : (
              <div className={styles.yearGrid}>
                {state.data.items.map(({ schoolYear, learnerContextCount }) => {
                  const archived = schoolYear.lifecycleState === 'archived';
                  const canDelete = !schoolYear.active && learnerContextCount === 0;
                  return (
                    <article
                      key={schoolYear.id}
                      className={styles.yearCard}
                      data-active={schoolYear.active}
                      data-archived={archived}
                      aria-label={`${schoolYear.label} school year`}
                    >
                      <div className={styles.yearHeader}>
                        <div>
                          <h3>{schoolYear.label}</h3>
                          <p className={styles.yearDates}>
                            {schoolYear.startsOn} through {schoolYear.endsOn}
                          </p>
                        </div>
                        <div className={styles.statusRow}>
                          {schoolYear.active ? <span className={styles.badge}>Active</span> : null}
                          {archived ? (
                            <span className={`${styles.badge} ${styles.archivedBadge}`}>
                              Archived
                            </span>
                          ) : null}
                          <span className={`${styles.badge} ${styles.usageBadge}`}>
                            {learnerContextCount} learner context
                            {learnerContextCount === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>

                      <p className={styles.yearMeta}>
                        {schoolYear.active
                          ? 'New year-scoped work uses this active context where supported.'
                          : archived
                            ? 'Hidden from active-year selection; historical records remain linked.'
                            : 'Available to view or activate. Existing records are unchanged.'}
                      </p>

                      <div className={styles.yearActions}>
                        <button
                          className="button"
                          type="button"
                          onClick={() => openEdit(schoolYear)}
                        >
                          <Pencil size={16} aria-hidden="true" /> Edit
                        </button>
                        {!schoolYear.active && !archived ? (
                          <button
                            className="button button-primary"
                            type="button"
                            disabled={busyId === schoolYear.id}
                            onClick={() => void setActive(schoolYear)}
                          >
                            <CheckCircle2 size={16} aria-hidden="true" /> Set active
                          </button>
                        ) : null}
                        <button
                          className="button"
                          type="button"
                          disabled={busyId === schoolYear.id || schoolYear.active}
                          title={
                            schoolYear.active ? 'Set another school year active first.' : undefined
                          }
                          onClick={() => void toggleArchive(schoolYear)}
                        >
                          {archived ? (
                            <RotateCcw size={16} aria-hidden="true" />
                          ) : (
                            <Archive size={16} aria-hidden="true" />
                          )}
                          {archived ? 'Restore' : 'Archive'}
                        </button>
                        <button
                          className="button"
                          type="button"
                          disabled={!canDelete || busyId === schoolYear.id}
                          title={
                            schoolYear.active
                              ? 'The active school year cannot be deleted.'
                              : learnerContextCount > 0
                                ? 'Archive this year; linked learner contexts prevent deletion.'
                                : undefined
                          }
                          onClick={() => void remove(schoolYear)}
                        >
                          <Trash2 size={16} aria-hidden="true" /> Delete empty year
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
