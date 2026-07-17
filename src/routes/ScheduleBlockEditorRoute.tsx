import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, CalendarClock, Plus, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ZodError } from 'zod';

import type { ScheduleBlock } from '@/domain/models/entities';
import { classroomRepository } from '@/data/repositories/DexieClassroomRepository';
import {
  createScheduleBlockEditorValues,
  SCHEDULE_BLOCK_KIND_OPTIONS,
  SCHEDULE_BLOCK_WEEKDAYS,
  scheduleBlockEditorValuesSchema,
  toScheduleBlockEditorValues,
  type ScheduleBlockEditorValues,
} from '@/features/editing/scheduleBlockEditorModel';
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
  return `${weekdays} · ${block.title}`;
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

  const parentOptions = useMemo(
    () => (blocks ?? []).filter((block) => block.id !== selectedId),
    [blocks, selectedId],
  );
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
      <header className={styles.header}>
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
              {blocks.map((block) => (
                <li key={block.id}>
                  <Link
                    className={block.id === selectedId ? styles.selectedBlock : styles.blockLink}
                    aria-current={block.id === selectedId ? 'page' : undefined}
                    to={`/schedule/edit?id=${encodeURIComponent(block.id)}&date=${returnDate}`}
                  >
                    <strong>{block.title}</strong>
                    <span>{scheduleLabel(block)}</span>
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
                </div>
                <div className={styles.actions}>
                  {selectedBlock ? (
                    <button
                      className={styles.archiveButton}
                      type="button"
                      onClick={handleArchive}
                      disabled={saving}
                    >
                      <Archive size={17} aria-hidden="true" />
                      Archive
                    </button>
                  ) : null}
                  <button className="button button-primary" type="submit" disabled={saving}>
                    <Save size={17} aria-hidden="true" />
                    {saving ? 'Saving…' : 'Save block'}
                  </button>
                </div>
              </div>

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
                    {parentOptions.map((block) => (
                      <option key={block.id} value={block.id}>
                        {block.title}
                      </option>
                    ))}
                  </select>
                  <small>Use a parent to show a block inside a larger schedule group.</small>
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
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
