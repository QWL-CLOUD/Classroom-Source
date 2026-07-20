import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, RotateCcw, Save, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ZodError } from 'zod';

import { classroomRepository } from '@/data/repositories/DexieClassroomRepository';
import type { ScheduleException } from '@/domain/models/entities';
import {
  createScheduleExceptionEditorValues,
  scheduleExceptionEditorValuesSchema,
  type ScheduleExceptionEditorValues,
} from '@/features/scheduleExceptions/scheduleExceptionEditorModel';
import { scheduleExceptionMutationService } from '@/features/scheduleExceptions/scheduleExceptionMutationService';
import { minuteToTime } from '@/features/editing/scheduleBlockEditorModel';
import { formatLongDate, parseLocalDate, todayLocalDate } from '@/shared/dates/localDate';

import styles from './ScheduleOccurrenceEditorRoute.module.css';

type FormErrors = Partial<Record<keyof ScheduleExceptionEditorValues | 'form', string>>;

function errorsFromZod(error: ZodError): FormErrors {
  const errors: FormErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form') as keyof FormErrors;
    errors[field] ??= issue.message;
  }
  return errors;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to update this schedule occurrence.';
}

function returnHref(returnView: string, date: string): string {
  if (returnView === 'calendar') return `#/calendar?date=${date}`;
  if (returnView === 'today') return `#/today?date=${date}`;
  return `#/week?date=${date}&view=schedule`;
}

function matchingException(
  exceptions: readonly ScheduleException[] | undefined,
  blockId: string,
): ScheduleException | undefined {
  return exceptions?.find((exception) => exception.scheduleBlockId === blockId);
}

export function ScheduleOccurrenceEditorRoute() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const blockId = searchParams.get('block') ?? '';
  const date = searchParams.get('date') ?? todayLocalDate();
  const returnView = searchParams.get('return') ?? 'week';
  const blocks = useLiveQuery(() => classroomRepository.listScheduleBlocks(), []);
  const exceptions = useLiveQuery(
    () =>
      classroomRepository.listScheduleExceptionsForRange({
        startDate: date,
        endDate: date,
      }),
    [date],
  );
  const block = blocks?.find((candidate) => candidate.id === blockId);
  const exception = matchingException(exceptions, blockId);
  const [values, setValues] = useState<ScheduleExceptionEditorValues | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatus('');
  }, [blockId, date]);

  useEffect(() => {
    const nextStatus = (location.state as { occurrenceStatus?: string } | null)?.occurrenceStatus;
    if (!nextStatus) return;
    setStatus(nextStatus);
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!block) return;
    setErrors({});
    setValues(createScheduleExceptionEditorValues(block, exception));
  }, [block, exception]);

  const parent = useMemo(
    () =>
      block?.parentId ? blocks?.find((candidate) => candidate.id === block.parentId) : undefined,
    [block, blocks],
  );
  const hasActiveChildren = useMemo(
    () =>
      Boolean(blocks?.some((candidate) => candidate.parentId === blockId && !candidate.archivedAt)),
    [blockId, blocks],
  );

  function updateValue<Key extends keyof ScheduleExceptionEditorValues>(
    key: Key,
    value: ScheduleExceptionEditorValues[Key],
  ): void {
    setValues((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
    setStatus('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!block || !values) return;
    setStatus('');
    const parsed = scheduleExceptionEditorValuesSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(errorsFromZod(parsed.error));
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }

    if (values.scope === 'default') {
      navigate(`/schedule/edit?id=${encodeURIComponent(block.id)}&date=${date}`);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      if (values.scope === 'future') {
        const future = await scheduleExceptionMutationService.splitFuture(block.id, date, values);
        navigate(
          `/schedule/occurrence/edit?block=${encodeURIComponent(future.id)}&date=${date}&return=${encodeURIComponent(returnView)}`,
          {
            replace: true,
            state: { occurrenceStatus: 'Future schedule saved.' },
          },
        );
      } else {
        await scheduleExceptionMutationService.saveOccurrence(block.id, date, values);
        setStatus('Occurrence saved.');
      }
    } catch (error) {
      setErrors({ form: errorMessage(error) });
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelOccurrence(): Promise<void> {
    if (!block || !values) return;
    if (!window.confirm(`Cancel “${block.title}” on ${formatLongDate(date)}?`)) return;
    setSaving(true);
    setErrors({});
    setStatus('');
    try {
      await scheduleExceptionMutationService.cancelOccurrence(block.id, date, values.reason);
      setStatus('Occurrence cancelled.');
    } catch (error) {
      setErrors({ form: errorMessage(error) });
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  async function handleRestoreDefault(): Promise<void> {
    if (!block) return;
    setSaving(true);
    setErrors({});
    setStatus('');
    try {
      await scheduleExceptionMutationService.restoreDefault(block.id, date);
      setStatus('Default schedule restored.');
    } catch (error) {
      setErrors({ form: errorMessage(error) });
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  if (!parseLocalDate(date)) {
    return (
      <section className={`card ${styles.state}`} role="alert">
        Invalid occurrence date.
      </section>
    );
  }

  if (!blocks || !exceptions) {
    return (
      <section className={`card ${styles.state}`} role="status">
        Loading occurrence…
      </section>
    );
  }

  if (!block || !values) {
    return (
      <section className={`card ${styles.state}`} role="alert">
        <h1>Schedule occurrence unavailable</h1>
        <p>The recurring block may have been archived, removed, or split.</p>
        <a className="button" href={returnHref(returnView, date)}>
          Back
        </a>
      </section>
    );
  }

  const errorMessages = Object.values(errors).filter((message): message is string =>
    Boolean(message),
  );

  return (
    <section className={styles.page} aria-labelledby="schedule-occurrence-heading">
      <header className={`${styles.header} editor-page-header`}>
        <div>
          <p className="page-eyebrow">Schedule exception</p>
          <h1 className="page-title" id="schedule-occurrence-heading">
            Edit occurrence
          </h1>
          <p className={styles.subtitle}>
            {formatLongDate(date)} · {block.title}
          </p>
        </div>
        <a className="button" href={returnHref(returnView, date)}>
          Back to {returnView}
        </a>
      </header>

      <div className={styles.layout}>
        <aside className={`card ${styles.context}`} aria-label="Default schedule context">
          <CalendarClock aria-hidden="true" size={24} />
          <h2>Default schedule</h2>
          <dl>
            <div>
              <dt>Title</dt>
              <dd>{block.title}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>
                {minuteToTime(block.startMinute)}–{minuteToTime(block.endMinute)}
              </dd>
            </div>
            <div>
              <dt>Parent</dt>
              <dd>{parent?.title ?? 'None'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{exception?.action ?? 'Default'}</dd>
            </div>
          </dl>
        </aside>

        <form className={`card ${styles.editor}`} onSubmit={handleSubmit} noValidate>
          <h2>Change schedule</h2>
          <p>
            Choose whether this change affects one date, this date and future defaults, or the
            entire recurring block.
          </p>

          {errorMessages.length > 0 ? (
            <div className={styles.errorSummary} role="alert" tabIndex={-1} ref={errorSummaryRef}>
              <strong>Review these fields:</strong>
              <ul>
                {errorMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {status ? (
            <p className={styles.status} role="status" aria-label="Occurrence edit status">
              {status}
            </p>
          ) : null}

          <fieldset className={styles.scope}>
            <legend>Edit scope</legend>
            {[
              ['occurrence', 'This occurrence only', 'Store a date-specific exception.'],
              ['future', 'This and future', 'Split the recurring default at this date.'],
              ['default', 'Entire default', 'Open the recurring Schedule Block editor.'],
            ].map(([value, label, detail]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="scope"
                  value={value}
                  checked={values.scope === value}
                  disabled={value === 'future' && hasActiveChildren}
                  onChange={() =>
                    updateValue('scope', value as ScheduleExceptionEditorValues['scope'])
                  }
                />
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {hasActiveChildren ? (
            <p className={styles.scopeNote}>
              This and future is unavailable because this parent has active child blocks. Edit
              children individually or use Entire default.
            </p>
          ) : null}

          <div className={styles.formGrid}>
            <label className={styles.fullWidth}>
              <span>Title</span>
              <input
                value={values.title}
                onChange={(event) => updateValue('title', event.target.value)}
                aria-invalid={Boolean(errors.title)}
              />
              {errors.title ? <small className={styles.fieldError}>{errors.title}</small> : null}
            </label>
            <label>
              <span>Start time</span>
              <input
                type="time"
                aria-label="Start time"
                value={values.startTime}
                onChange={(event) => updateValue('startTime', event.target.value)}
                aria-invalid={Boolean(errors.startTime)}
              />
              {errors.startTime ? (
                <small className={styles.fieldError}>{errors.startTime}</small>
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
              />
              {errors.endTime ? (
                <small className={styles.fieldError}>{errors.endTime}</small>
              ) : null}
            </label>
            <label className={styles.fullWidth}>
              <span>
                Reason <small>Optional</small>
              </span>
              <textarea
                rows={3}
                value={values.reason}
                onChange={(event) => updateValue('reason', event.target.value)}
              />
            </label>
          </div>

          <div
            className={`editor-action-bar ${styles.actions}`}
            role="group"
            aria-label="Editor actions"
          >
            <button className="button button-primary" type="submit" disabled={saving}>
              <Save aria-hidden="true" size={18} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              className="button"
              type="button"
              disabled={saving}
              onClick={handleCancelOccurrence}
            >
              <XCircle aria-hidden="true" size={18} /> Cancel this occurrence
            </button>
            {exception ? (
              <button
                className="button"
                type="button"
                disabled={saving}
                onClick={handleRestoreDefault}
              >
                <RotateCcw aria-hidden="true" size={18} /> Restore default
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
