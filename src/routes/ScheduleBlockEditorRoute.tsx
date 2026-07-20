import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, CalendarClock, Plus, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ZodError } from 'zod';

import type { ScheduleBlock } from '@/domain/models/entities';
import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';
import { classroomRepository } from '@/data/repositories/DexieClassroomRepository';
import {
  createScheduleBlockEditorValues,
  SCHEDULE_BLOCK_KIND_OPTIONS,
  SCHEDULE_BLOCK_WEEKDAYS,
  scheduleBlockEditorValuesSchema,
  toScheduleBlockEditorValues,
  type ScheduleBlockEditorValues,
} from '@/features/editing/scheduleBlockEditorModel';
import {
  buildScheduleBlockHierarchy,
  getScheduleBlockDescendantIds,
} from '@/features/editing/scheduleBlockHierarchy';
import { scheduleBlockMutationService } from '@/features/editing/scheduleBlockMutationService';
import { todayLocalDate } from '@/shared/dates/localDate';

import styles from './ScheduleBlockEditorRoute.module.css';

interface FormErrors {
  [field: string]: string | undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to save this schedule block.';
}

function errorsFromZod(error: ZodError): FormErrors {
  const errors: FormErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}

function scheduleLabel(block: ScheduleBlock): string {
  const weekdays = block.weekdays
    .map(
      (weekday) => SCHEDULE_BLOCK_WEEKDAYS.find((option) => option.value === weekday)?.shortLabel,
    )
    .filter(Boolean)
    .join(', ');
  return `${weekdays} · ${formatCalendarMinute(block.startMinute)}–${formatCalendarMinute(block.endMinute)}`;
}

function childCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'child' : 'children'}`;
}

export function ScheduleBlockEditorRoute() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedId = searchParams.get('id') ?? '';
  const returnDate = searchParams.get('date') ?? todayLocalDate();
  const blocks = useLiveQuery(() => classroomRepository.listScheduleBlocks(), []);
  const selectedBlock = blocks?.find((block) => block.id === selectedId);
  const [values, setValues] = useState<ScheduleBlockEditorValues>(createScheduleBlockEditorValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatus('');
  }, [selectedId]);

  useEffect(() => {
    setErrors({});
    setValues(
      selectedId && selectedBlock
        ? toScheduleBlockEditorValues(selectedBlock)
        : createScheduleBlockEditorValues(),
    );
  }, [selectedBlock, selectedId]);

  const hierarchyEntries = useMemo(() => buildScheduleBlockHierarchy(blocks ?? []), [blocks]);
  const hierarchyById = useMemo(
    () => new Map(hierarchyEntries.map((entry) => [entry.blockId, entry])),
    [hierarchyEntries],
  );
  const descendantIds = useMemo(
    () => getScheduleBlockDescendantIds(blocks ?? [], selectedId),
    [blocks, selectedId],
  );
  const parentOptions = useMemo(
    () =>
      hierarchyEntries
        .map((entry) => entry.block)
        .filter((block) => block.id !== selectedId && !descendantIds.has(block.id)),
    [descendantIds, hierarchyEntries, selectedId],
  );
  const selectedHierarchy = selectedId ? hierarchyById.get(selectedId) : undefined;
  const selectedParent = values.parentId ? hierarchyById.get(values.parentId)?.block : undefined;
  const selectedChildCount = selectedHierarchy?.directChildCount ?? 0;
  const isMissingSelection = Boolean(selectedId && blocks && !selectedBlock);

  function updateValue<Key extends keyof ScheduleBlockEditorValues>(
    key: Key,
    value: ScheduleBlockEditorValues[Key],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
    setStatus('');
  }

  function toggleWeekday(weekday: number): void {
    const next = values.weekdays.includes(weekday)
      ? values.weekdays.filter((value) => value !== weekday)
      : [...values.weekdays, weekday];
    updateValue('weekdays', next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus('');

    const parsed = scheduleBlockEditorValuesSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(errorsFromZod(parsed.error));
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      if (selectedBlock) {
        await scheduleBlockMutationService.update(selectedBlock.id, values);
        setStatus('Schedule block saved.');
      } else {
        const created = await scheduleBlockMutationService.create(values);
        navigate(`/schedule/edit?id=${encodeURIComponent(created.id)}&date=${returnDate}`, {
          replace: true,
        });
      }
    } catch (error) {
      setErrors({ form: errorMessage(error) });
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(): Promise<void> {
    if (!selectedBlock) return;
    if (!window.confirm(`Archive “${selectedBlock.title}”?`)) return;

    setSaving(true);
    setErrors({});
    setStatus('');
    try {
      await scheduleBlockMutationService.archive(selectedBlock.id);
      navigate(`/schedule/edit?date=${returnDate}`, { replace: true });
    } catch (error) {
      setErrors({ form: errorMessage(error) });
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  const errorMessages = Object.values(errors).filter((message): message is string =>
    Boolean(message),
  );

  return (
    <section className={styles.page} aria-labelledby="schedule-editor-heading">
      <header className={`${styles.header} editor-page-header`}>
        <div>
          <span className="eyebrow">Calendar &amp; Schedule</span>
          <h1 id="schedule-editor-heading">Manage recurring schedule</h1>
          <p>Create, edit, and archive weekly defaults without changing dated occurrences.</p>
        </div>
        <nav className={styles.returnLinks} aria-label="Return to schedule views">
          <Link className="button" to={`/calendar?date=${returnDate}`}>
            Calendar
          </Link>
          <Link className="button" to={`/week?date=${returnDate}&view=schedule`}>
            Week
          </Link>
        </nav>
      </header>

      <div className={styles.layout}>
        <aside className={`card ${styles.blockList}`} aria-labelledby="active-blocks-heading">
          <div className={styles.listHeader}>
            <div>
              <span className="eyebrow">Defaults</span>
              <h2 id="active-blocks-heading">Active blocks</h2>
            </div>
            <Link className="button button-primary" to={`/schedule/edit?date=${returnDate}`}>
              <Plus size={17} aria-hidden="true" />
              New
            </Link>
          </div>

          {blocks === undefined ? <p aria-live="polite">Loading schedule…</p> : null}
          {blocks?.length === 0 ? (
            <p className={styles.empty}>No active schedule blocks yet.</p>
          ) : null}
          {blocks && blocks.length > 0 ? (
            <ul className={styles.list}>
              {hierarchyEntries.map((entry) => (
                <li
                  key={entry.blockId}
                  className={entry.visualDepth > 0 ? styles.hierarchyChild : styles.hierarchyParent}
                  data-schedule-id={entry.blockId}
                  data-schedule-depth={entry.visualDepth}
                  data-parent-id={entry.parentId}
                  data-child-count={entry.directChildCount}
                  data-group-tone={entry.groupTone}
                >
                  <Link
                    className={
                      entry.blockId === selectedId ? styles.selectedBlock : styles.blockLink
                    }
                    aria-current={entry.blockId === selectedId ? 'page' : undefined}
                    to={`/schedule/edit?id=${encodeURIComponent(entry.blockId)}&date=${returnDate}`}
                  >
                    <span className={styles.blockTitleRow}>
                      <strong>{entry.block.title}</strong>
                      {entry.directChildCount > 0 ? (
                        <span className={styles.childCountBadge}>
                          {childCountLabel(entry.directChildCount)}
                        </span>
                      ) : null}
                    </span>
                    <span className={styles.scheduleMeta}>{scheduleLabel(entry.block)}</span>
                    {entry.parentTitle ? (
                      <span className={styles.relationshipLabel}>Part of {entry.parentTitle}</span>
                    ) : null}
                    {entry.parentUnavailable ? (
                      <span className={styles.relationshipWarning}>Parent unavailable</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>

        <div className={`card ${styles.editor}`}>
          {isMissingSelection ? (
            <div className={styles.missing} role="alert">
              <CalendarClock size={28} aria-hidden="true" />
              <h2>Schedule block not found</h2>
              <p>It may have been archived or removed by Undo.</p>
              <Link className="button button-primary" to={`/schedule/edit?date=${returnDate}`}>
                Create a new block
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className={styles.editorHeading}>
                <div>
                  <span className="eyebrow">{selectedBlock ? 'Edit default' : 'New default'}</span>
                  <h2>{selectedBlock ? selectedBlock.title : 'New schedule block'}</h2>
                  {selectedParent ? (
                    <p className={styles.editorRelationship}>Part of {selectedParent.title}</p>
                  ) : null}
                  {selectedBlock && selectedChildCount > 0 ? (
                    <p className={styles.editorRelationship}>
                      Contains {childCountLabel(selectedChildCount)}.
                    </p>
                  ) : null}
                </div>
              </div>

              {selectedBlock && selectedChildCount > 0 ? (
                <p id="archive-children-help" className={styles.archiveHelp}>
                  Reassign or archive {childCountLabel(selectedChildCount)} before archiving this
                  parent.
                </p>
              ) : null}

              {errorMessages.length > 0 ? (
                <div
                  className={styles.errorSummary}
                  role="alert"
                  tabIndex={-1}
                  ref={errorSummaryRef}
                >
                  <strong>Check the schedule block.</strong>
                  <ul>
                    {[...new Set(errorMessages)].map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {status ? (
                <p className={styles.status} role="status" aria-label="Schedule block status">
                  {status}
                </p>
              ) : null}

              <div className={styles.formGrid}>
                <label className={styles.fullWidth}>
                  <span>Title</span>
                  <input
                    value={values.title}
                    onChange={(event) => updateValue('title', event.target.value)}
                    aria-invalid={Boolean(errors.title)}
                    aria-describedby={errors.title ? 'schedule-title-error' : undefined}
                  />
                  {errors.title ? (
                    <small id="schedule-title-error" className={styles.fieldError}>
                      {errors.title}
                    </small>
                  ) : null}
                </label>

                <label>
                  <span>Category</span>
                  <input
                    value={values.category}
                    onChange={(event) => updateValue('category', event.target.value)}
                    aria-invalid={Boolean(errors.category)}
                    aria-describedby={errors.category ? 'schedule-category-error' : undefined}
                  />
                  {errors.category ? (
                    <small id="schedule-category-error" className={styles.fieldError}>
                      {errors.category}
                    </small>
                  ) : null}
                </label>

                <label>
                  <span>Kind</span>
                  <select
                    value={values.kind}
                    onChange={(event) =>
                      updateValue('kind', event.target.value as ScheduleBlock['kind'])
                    }
                  >
                    {SCHEDULE_BLOCK_KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className={styles.fullWidth} aria-describedby="schedule-weekdays-help">
                  <legend>Weekdays</legend>
                  <p id="schedule-weekdays-help">Choose every day this block normally occurs.</p>
                  <div className={styles.weekdays}>
                    {SCHEDULE_BLOCK_WEEKDAYS.map((weekday) => (
                      <label key={weekday.value}>
                        <input
                          type="checkbox"
                          checked={values.weekdays.includes(weekday.value)}
                          onChange={() => toggleWeekday(weekday.value)}
                        />
                        <span>{weekday.shortLabel}</span>
                      </label>
                    ))}
                  </div>
                  {errors.weekdays ? (
                    <small className={styles.fieldError}>{errors.weekdays}</small>
                  ) : null}
                </fieldset>

                <label>
                  <span>Start time</span>
                  <input
                    type="time"
                    aria-label="Start time"
                    value={values.startTime}
                    onChange={(event) => updateValue('startTime', event.target.value)}
                    aria-invalid={Boolean(errors.startTime)}
                    aria-describedby={errors.startTime ? 'schedule-start-time-error' : undefined}
                  />
                  {errors.startTime ? (
                    <small id="schedule-start-time-error" className={styles.fieldError}>
                      {errors.startTime}
                    </small>
                  ) : null}
                </label>

                <label>
                  <span>End time</span>
                  <input
                    type="time"
                    aria-label="End time"
                    value={values.endTime}
                    onChange={(event) => updateValue('endTime', event.target.value)}
                    aria-invalid={Boolean(errors.endTime)}
                    aria-describedby={errors.endTime ? 'schedule-end-time-error' : undefined}
                  />
                  {errors.endTime ? (
                    <small id="schedule-end-time-error" className={styles.fieldError}>
                      {errors.endTime}
                    </small>
                  ) : null}
                </label>

                <label>
                  <span>Effective from</span>
                  <input
                    type="date"
                    value={values.effectiveFrom}
                    onChange={(event) => updateValue('effectiveFrom', event.target.value)}
                    aria-invalid={Boolean(errors.effectiveFrom)}
                    aria-describedby={
                      errors.effectiveFrom ? 'schedule-effective-from-error' : undefined
                    }
                  />
                  {errors.effectiveFrom ? (
                    <small id="schedule-effective-from-error" className={styles.fieldError}>
                      {errors.effectiveFrom}
                    </small>
                  ) : null}
                </label>

                <label>
                  <span>Effective to</span>
                  <input
                    type="date"
                    value={values.effectiveTo}
                    onChange={(event) => updateValue('effectiveTo', event.target.value)}
                    aria-invalid={Boolean(errors.effectiveTo)}
                    aria-describedby={
                      errors.effectiveTo ? 'schedule-effective-to-error' : undefined
                    }
                  />
                  {errors.effectiveTo ? (
                    <small id="schedule-effective-to-error" className={styles.fieldError}>
                      {errors.effectiveTo}
                    </small>
                  ) : null}
                </label>

                <label className={styles.fullWidth}>
                  <span>Parent block</span>
                  <select
                    value={values.parentId}
                    onChange={(event) => updateValue('parentId', event.target.value)}
                  >
                    <option value="">No parent</option>
                    {parentOptions.map((block) => {
                      const childCount = hierarchyById.get(block.id)?.directChildCount ?? 0;
                      return (
                        <option key={block.id} value={block.id}>
                          {block.title}
                          {childCount > 0 ? ` (${childCountLabel(childCount)})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <small>
                    Use a parent to show a block inside a larger schedule group. The current block
                    and its descendants are excluded to prevent cycles.
                  </small>
                </label>

                <label className={`${styles.fullWidth} ${styles.visibilityToggle}`}>
                  <input
                    type="checkbox"
                    checked={values.showInWeek}
                    onChange={(event) => updateValue('showInWeek', event.target.checked)}
                  />
                  <span>
                    <strong>Show in Week</strong>
                    <small>Calendar and Today continue to use active schedule defaults.</small>
                  </span>
                </label>
              </div>

              <div
                className={`editor-action-bar ${styles.actions}`}
                role="group"
                aria-label="Editor actions"
              >
                <button className="button button-primary" type="submit" disabled={saving}>
                  <Save size={17} aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save block'}
                </button>
                {selectedBlock ? (
                  <button
                    className={styles.archiveButton}
                    type="button"
                    onClick={handleArchive}
                    disabled={saving || selectedChildCount > 0}
                    aria-describedby={selectedChildCount > 0 ? 'archive-children-help' : undefined}
                  >
                    <Archive size={17} aria-hidden="true" />
                    Archive
                  </button>
                ) : null}
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
