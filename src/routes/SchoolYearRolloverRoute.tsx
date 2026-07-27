import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Copy,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';

import type { LearnerContext, ScheduleBlock, SchoolYear } from '@/domain/models/entities';
import {
  listRolloverScheduleCandidates,
  type SchoolYearRolloverPreview,
} from '@/features/schoolYearRollover/schoolYearRolloverModel';
import {
  schoolYearRolloverError,
  schoolYearRolloverService,
  type SchoolYearRolloverCommitResult,
} from '@/features/schoolYearRollover/schoolYearRolloverService';

import styles from './SchoolYearRolloverRoute.module.css';

function kindLabel(kind: LearnerContext['kind']): string {
  if (kind === 'class') return 'Class';
  if (kind === 'group') return 'Group';
  return 'Individual';
}

function scheduleTime(block: ScheduleBlock): string {
  const format = (minute: number) => {
    const hour = Math.floor(minute / 60);
    const displayHour = hour % 12 || 12;
    const suffix = hour < 12 ? 'AM' : 'PM';
    return `${displayHour}:${String(minute % 60).padStart(2, '0')} ${suffix}`;
  };
  return `${format(block.startMinute)}–${format(block.endMinute)}`;
}

function weekdayLabel(values: readonly number[]): string {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return values
    .map((value) => labels[value - 1])
    .filter(Boolean)
    .join(', ');
}

function initialSourceYear(years: readonly SchoolYear[]): SchoolYear | undefined {
  return (
    years.find((year) => year.active && year.lifecycleState === 'active') ??
    [...years]
      .filter((year) => year.lifecycleState === 'active')
      .sort((first, second) => second.startsOn.localeCompare(first.startsOn))[0]
  );
}

function initialTargetYear(
  years: readonly SchoolYear[],
  source: SchoolYear | undefined,
): SchoolYear | undefined {
  const activeYears = years
    .filter((year) => year.lifecycleState === 'active' && year.id !== source?.id)
    .sort((first, second) => first.startsOn.localeCompare(second.startsOn));
  return activeYears.find((year) => !source || year.startsOn > source.startsOn) ?? activeYears[0];
}

export function SchoolYearRolloverRoute() {
  const data = useLiveQuery(() => schoolYearRolloverService.loadData(), []);
  const [sourceSchoolYearId, setSourceSchoolYearId] = useState('');
  const [targetSchoolYearId, setTargetSchoolYearId] = useState('');
  const [selectedContextIds, setSelectedContextIds] = useState<Set<string>>(new Set());
  const [copySchedule, setCopySchedule] = useState(false);
  const [selectedScheduleBlockIds, setSelectedScheduleBlockIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<SchoolYearRolloverPreview | null>(null);
  const [reviewedPreview, setReviewedPreview] = useState(false);
  const [acceptedBoundaries, setAcceptedBoundaries] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SchoolYearRolloverCommitResult | null>(null);

  useEffect(() => {
    if (!data || sourceSchoolYearId || targetSchoolYearId) return;
    const source = initialSourceYear(data.schoolYears);
    const target = initialTargetYear(data.schoolYears, source);
    setSourceSchoolYearId(source?.id ?? '');
    setTargetSchoolYearId(target?.id ?? '');
  }, [data, sourceSchoolYearId, targetSchoolYearId]);

  const sourceYear = data?.schoolYears.find((year) => year.id === sourceSchoolYearId);
  const targetYear = data?.schoolYears.find((year) => year.id === targetSchoolYearId);
  const sourceContexts = useMemo(
    () =>
      (data?.learnerContexts ?? [])
        .filter(
          (context) => context.schoolYearId === sourceSchoolYearId && context.status === 'active',
        )
        .sort(
          (first, second) =>
            first.kind.localeCompare(second.kind) || first.name.localeCompare(second.name),
        ),
    [data, sourceSchoolYearId],
  );
  const scheduleCandidates = useMemo(
    () =>
      data && sourceSchoolYearId ? listRolloverScheduleCandidates(sourceSchoolYearId, data) : [],
    [data, sourceSchoolYearId],
  );

  function clearReview(): void {
    setPreview(null);
    setReviewedPreview(false);
    setAcceptedBoundaries(false);
    setResult(null);
    setError(null);
  }

  function changeSource(value: string): void {
    setSourceSchoolYearId(value);
    setSelectedContextIds(new Set());
    setSelectedScheduleBlockIds(new Set());
    clearReview();
  }

  function changeTarget(value: string): void {
    setTargetSchoolYearId(value);
    clearReview();
  }

  function toggleContext(id: string): void {
    setSelectedContextIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    clearReview();
  }

  function toggleSchedule(id: string): void {
    setSelectedScheduleBlockIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    clearReview();
  }

  function selectAllContexts(): void {
    setSelectedContextIds(new Set(sourceContexts.map((context) => context.id)));
    clearReview();
  }

  function selectAllSchedules(): void {
    setSelectedScheduleBlockIds(new Set(scheduleCandidates.map((block) => block.id)));
    clearReview();
  }

  async function generatePreview(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const nextPreview = await schoolYearRolloverService.preview({
        sourceSchoolYearId,
        targetSchoolYearId,
        selectedContextIds: [...selectedContextIds],
        copySchedule,
        selectedScheduleBlockIds: copySchedule ? [...selectedScheduleBlockIds] : [],
      });
      setPreview(nextPreview);
      setReviewedPreview(false);
      setAcceptedBoundaries(false);
    } catch (cause) {
      setPreview(null);
      setError(schoolYearRolloverError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function commit(): Promise<void> {
    if (!preview || !preview.canCommit || !reviewedPreview || !acceptedBoundaries || busy) return;
    if (
      !window.confirm(
        `Commit the reviewed rollover from “${preview.sourceSchoolYear.label}” to “${preview.targetSchoolYear.label}”?\n\nA pre-rollover safety backup will be saved first. The target year will not be activated.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const nextResult = await schoolYearRolloverService.commit(preview);
      setResult(nextResult);
      setPreview(null);
      setReviewedPreview(false);
      setAcceptedBoundaries(false);
    } catch (cause) {
      setError(schoolYearRolloverError(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <section>
        <div className="card" role="status">
          Reading school-year rollover data…
        </div>
      </section>
    );
  }

  const availableYears = data.schoolYears
    .filter((year) => year.lifecycleState === 'active')
    .sort((first, second) => first.startsOn.localeCompare(second.startsOn));

  return (
    <section className={styles.page}>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Settings &amp; Data</p>
          <h1 className="page-title">Advanced school-year rollover</h1>
          <p className="page-subtitle">
            Continue selected learner contexts and placements, optionally copy their Schedule, and
            review every change before one protected transaction.
          </p>
        </div>
        <Link className="button" to="/settings">
          <ArrowLeft size={17} aria-hidden="true" /> School Years
        </Link>
      </header>

      <aside className={styles.boundaryNote} aria-label="Rollover boundaries">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <strong>Deliberately limited migration</strong>
          <p>
            This workflow does not copy Plans, Sessions, Tasks, notices, reflections, completion, or
            teaching history. It never activates the target school year automatically.
          </p>
        </div>
      </aside>

      <section className={`card ${styles.section}`} aria-labelledby="years-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="years-heading">1. Choose school years</h2>
            <p>
              The target container must already exist and remain inactive unless you activate it
              later.
            </p>
          </div>
        </div>
        <div className={styles.yearGrid}>
          <label>
            <span>Source school year</span>
            <select
              className="input"
              value={sourceSchoolYearId}
              onChange={(event) => changeSource(event.target.value)}
            >
              <option value="">Choose source</option>
              {availableYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.label}
                  {year.active ? ' · active' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Target school year</span>
            <select
              className="input"
              value={targetSchoolYearId}
              onChange={(event) => changeTarget(event.target.value)}
            >
              <option value="">Choose target</option>
              {availableYears
                .filter((year) => year.id !== sourceSchoolYearId)
                .map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label}
                    {year.active ? ' · active' : ''}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {sourceYear && targetYear ? (
          <p className={styles.metaLine}>
            {sourceYear.label}: {sourceYear.startsOn}–{sourceYear.endsOn} → {targetYear.label}:{' '}
            {targetYear.startsOn}–{targetYear.endsOn}
          </p>
        ) : null}
      </section>

      <section className={`card ${styles.section}`} aria-labelledby="contexts-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="contexts-heading">2. Continue learner contexts</h2>
            <p>Select every Class, Group, and Individual that should exist in the target year.</p>
          </div>
          <button className="button" type="button" onClick={selectAllContexts}>
            <Users size={16} aria-hidden="true" /> Select all active
          </button>
        </div>
        {sourceContexts.length === 0 ? (
          <p className={styles.empty}>
            No active learner contexts are available in this source year.
          </p>
        ) : (
          <div className={styles.choiceGrid} aria-label="Learner contexts to continue">
            {sourceContexts.map((context) => (
              <label key={context.id} className={styles.choiceCard}>
                <input
                  type="checkbox"
                  checked={selectedContextIds.has(context.id)}
                  onChange={() => toggleContext(context.id)}
                />
                <span>
                  <strong>{context.name}</strong>
                  <small>{kindLabel(context.kind)}</small>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className={`card ${styles.section}`} aria-labelledby="schedule-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="schedule-heading">3. Optional Schedule copy</h2>
            <p>
              Dates shift relative to the target-year start. Parent blocks are included
              automatically.
            </p>
          </div>
          <label className={styles.switchChoice}>
            <input
              type="checkbox"
              checked={copySchedule}
              onChange={(event) => {
                setCopySchedule(event.target.checked);
                if (!event.target.checked) setSelectedScheduleBlockIds(new Set());
                clearReview();
              }}
            />
            <span>Copy selected Schedule Blocks</span>
          </label>
        </div>
        {copySchedule ? (
          <>
            <div className={styles.inlineActions}>
              <button className="button" type="button" onClick={selectAllSchedules}>
                <CalendarClock size={16} aria-hidden="true" /> Select all available
              </button>
            </div>
            <div className={styles.scheduleList} aria-label="Schedule Blocks to copy">
              {scheduleCandidates.map((block) => (
                <label key={block.id} className={styles.scheduleRow}>
                  <input
                    type="checkbox"
                    checked={selectedScheduleBlockIds.has(block.id)}
                    onChange={() => toggleSchedule(block.id)}
                  />
                  <span>
                    <strong>{block.title}</strong>
                    <small>
                      {block.kind} · {weekdayLabel(block.weekdays)} · {scheduleTime(block)}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className={styles.empty}>
            Schedule copy is off. Existing target Schedule Blocks stay unchanged.
          </p>
        )}
      </section>

      <div className={styles.previewAction}>
        <button
          className="button button-primary"
          type="button"
          disabled={busy || !sourceSchoolYearId || !targetSchoolYearId}
          onClick={() => void generatePreview()}
        >
          <RefreshCw size={17} aria-hidden="true" />
          {busy ? 'Preparing preview…' : 'Generate reviewed preview'}
        </button>
        <span>No database writes occur while generating the preview.</span>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      {preview ? (
        <section className={`card ${styles.preview}`} aria-labelledby="preview-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className="page-eyebrow">Reviewed transaction</p>
              <h2 id="preview-heading">Rollover preview</h2>
              <p>
                {preview.sourceSchoolYear.label} → {preview.targetSchoolYear.label}
              </p>
            </div>
            <span className={preview.canCommit ? styles.readyBadge : styles.blockedBadge}>
              {preview.canCommit ? 'Ready to commit' : 'Blocked'}
            </span>
          </div>

          <div className={styles.summaryGrid} aria-label="Rollover preview summary">
            <article>
              <strong>{preview.createdContexts.length}</strong>
              <span>Contexts created</span>
            </article>
            <article>
              <strong>{preview.createdMemberships.length}</strong>
              <span>Placements created</span>
            </article>
            <article>
              <strong>{preview.createdScheduleBlocks.length}</strong>
              <span>Schedule Blocks created</span>
            </article>
            <article>
              <strong>{preview.conflicts.length}</strong>
              <span>Schedule conflicts</span>
            </article>
          </div>

          <div className={styles.previewColumns}>
            <section aria-labelledby="context-preview-heading">
              <h3 id="context-preview-heading">Learner continuation</h3>
              <ul>
                {preview.contextRows.map((row) => (
                  <li key={row.source.id}>
                    <strong>{row.source.name}</strong> —{' '}
                    {row.action === 'create' ? 'create' : 'reuse'} {kindLabel(row.source.kind)}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="placement-preview-heading">
              <h3 id="placement-preview-heading">Class and group placement</h3>
              {preview.membershipRows.length ? (
                <ul>
                  {preview.membershipRows.map((row) => (
                    <li key={row.source.id}>
                      {row.memberName} → {row.containerName} ({row.action})
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No selected placements will be created.</p>
              )}
            </section>
          </div>

          {preview.scheduleRows.length ? (
            <section
              className={styles.reviewTableSection}
              aria-labelledby="schedule-review-heading"
            >
              <h3 id="schedule-review-heading">Schedule date and conflict review</h3>
              <div
                className={styles.tableScroller}
                tabIndex={0}
                aria-label="Scrollable rollover Schedule preview"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Block</th>
                      <th>Target dates</th>
                      <th>Weekdays / time</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.scheduleRows.map((row) => (
                      <tr key={row.source.id}>
                        <td>
                          <strong>{row.target.title}</strong>
                          <small>{row.target.kind}</small>
                        </td>
                        <td>
                          {row.target.effectiveFrom}–{row.target.effectiveTo}
                        </td>
                        <td>
                          {weekdayLabel(row.target.weekdays)} · {scheduleTime(row.target)}
                        </td>
                        <td>
                          {row.conflicts.length
                            ? `${row.conflicts.length} conflict(s)`
                            : 'No conflict'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {preview.blockingIssues.length ? (
            <section className={styles.issuePanel} aria-labelledby="blocking-heading">
              <h3 id="blocking-heading">
                <AlertTriangle size={18} aria-hidden="true" /> Resolve before commit
              </h3>
              <ul>
                {preview.blockingIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {preview.warnings.length ? (
            <section className={styles.warningPanel} aria-labelledby="warning-heading">
              <h3 id="warning-heading">Review notes</h3>
              <ul>
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className={styles.confirmations}>
            <label>
              <input
                type="checkbox"
                checked={reviewedPreview}
                onChange={(event) => setReviewedPreview(event.target.checked)}
              />
              <span>I reviewed the learner, placement, date, and conflict preview.</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={acceptedBoundaries}
                onChange={(event) => setAcceptedBoundaries(event.target.checked)}
              />
              <span>
                I understand that Plans, Sessions, Tasks, notices, history, and target-year
                activation are excluded.
              </span>
            </label>
          </div>
          <button
            className="button button-primary"
            type="button"
            disabled={!preview.canCommit || !reviewedPreview || !acceptedBoundaries || busy}
            onClick={() => void commit()}
          >
            <Copy size={17} aria-hidden="true" /> Commit protected rollover
          </button>
        </section>
      ) : null}

      {result ? (
        <section className={`card ${styles.success}`} aria-labelledby="rollover-complete-heading">
          <CheckCircle2 size={24} aria-hidden="true" />
          <div>
            <h2 id="rollover-complete-heading">Rollover committed safely</h2>
            <p>
              Created {result.createdContextCount} contexts, {result.createdMembershipCount}{' '}
              placements, and {result.createdScheduleBlockCount} Schedule Blocks. A pre-rollover
              safety backup was saved, and the complete change is globally undoable.
            </p>
          </div>
        </section>
      ) : null}
    </section>
  );
}
