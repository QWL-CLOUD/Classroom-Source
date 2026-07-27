import { AlertTriangle, CheckCircle2, Copy, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';

import type { ScheduleBlock, SchoolYear } from '@/domain/models/entities';
import {
  listInstructionalRolloverCandidates,
  listRolloverScheduleCandidates,
  type SchoolYearRolloverPreview,
} from '@/features/schoolYearRollover/schoolYearRolloverModel';
import {
  schoolYearRolloverError,
  schoolYearRolloverService,
  type SchoolYearRolloverCommitResult,
} from '@/features/schoolYearRollover/schoolYearRolloverService';

import styles from './SchoolYearRolloverRoute.module.css';

function initialSourceYear(years: readonly SchoolYear[]): SchoolYear | undefined {
  return (
    years.find((year) => year.active && year.lifecycleState !== 'archived') ??
    [...years]
      .filter((year) => year.lifecycleState !== 'archived')
      .sort((first, second) => second.startsOn.localeCompare(first.startsOn))[0]
  );
}

function initialTargetYear(
  years: readonly SchoolYear[],
  source: SchoolYear | undefined,
): SchoolYear | undefined {
  const values = years
    .filter((year) => year.lifecycleState !== 'archived' && year.id !== source?.id)
    .sort((first, second) => first.startsOn.localeCompare(second.startsOn));
  return values.find((year) => !source || year.startsOn > source.startsOn) ?? values[0];
}

function scheduleLabel(block: ScheduleBlock): string {
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = block.weekdays
    .map((day) => weekdays[day - 1])
    .filter(Boolean)
    .join(', ');
  const format = (minute: number) => {
    const hour = Math.floor(minute / 60);
    return `${hour % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  };
  return `${block.title} · ${days} · ${format(block.startMinute)}–${format(block.endMinute)}`;
}

export function SchoolYearRolloverRoute() {
  const data = useLiveQuery(() => schoolYearRolloverService.loadData(), []);
  const [sourceSchoolYearId, setSourceSchoolYearId] = useState('');
  const [targetSchoolYearId, setTargetSchoolYearId] = useState('');
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());
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
  const candidates = useMemo(
    () =>
      data && sourceSchoolYearId
        ? listInstructionalRolloverCandidates(sourceSchoolYearId, data)
        : [],
    [data, sourceSchoolYearId],
  );
  const scheduleCandidates = useMemo(
    () =>
      data && sourceSchoolYearId
        ? listRolloverScheduleCandidates(sourceSchoolYearId, [...selectedPlanIds], data)
        : [],
    [data, sourceSchoolYearId, selectedPlanIds],
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
    setSelectedPlanIds(new Set());
    setSelectedScheduleBlockIds(new Set());
    clearReview();
  }

  function togglePlan(id: string): void {
    setSelectedPlanIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedScheduleBlockIds(new Set());
    clearReview();
  }

  function selectAllPlans(): void {
    setSelectedPlanIds(new Set(candidates.map((candidate) => candidate.plan.id)));
    setSelectedScheduleBlockIds(new Set());
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

  async function generatePreview(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const next = await schoolYearRolloverService.preview({
        sourceSchoolYearId,
        targetSchoolYearId,
        selectedPlanIds: [...selectedPlanIds],
        copySchedule,
        selectedScheduleBlockIds: copySchedule ? [...selectedScheduleBlockIds] : [],
      });
      setPreview(next);
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
    if (!preview?.canCommit || !reviewedPreview || !acceptedBoundaries || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await schoolYearRolloverService.commit(preview);
      setResult(next);
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
      <div className={styles.page}>
        <p>Loading instructional rollover…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>School Year continuity</p>
          <h1>Instructional rollover</h1>
          <p>
            Copy reusable Lesson Series and Lesson Plans into a new school year. Student
            memberships, Sessions, completion history, Tasks, and Reminders stay in the original
            year.
          </p>
        </div>
        <Link className="button secondary" to="/settings">
          Back to School Years
        </Link>
      </header>

      <section className={`card ${styles.boundaryNote}`} aria-label="School Year date protection">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>School Year dates are protected</strong>
          <p>
            Rollover does not edit start dates, end dates, or active status. It only creates new
            instructional copies and an automatic pre-rollover safety backup.
          </p>
        </div>
      </section>

      <section className={`card ${styles.section}`}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>1. Choose source and target years</h2>
            <p>Existing year boundaries are displayed exactly as stored.</p>
          </div>
        </div>
        <div className={styles.yearGrid}>
          <label>
            Source school year
            <select
              value={sourceSchoolYearId}
              onChange={(event) => changeSource(event.target.value)}
            >
              {data.schoolYears
                .filter((year) => year.lifecycleState !== 'archived')
                .map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label} · {year.startsOn} through {year.endsOn}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Target school year
            <select
              value={targetSchoolYearId}
              onChange={(event) => {
                setTargetSchoolYearId(event.target.value);
                clearReview();
              }}
            >
              {data.schoolYears
                .filter(
                  (year) => year.lifecycleState !== 'archived' && year.id !== sourceSchoolYearId,
                )
                .map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label} · {year.startsOn} through {year.endsOn}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </section>

      <section className={`card ${styles.section}`}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>2. Select reusable Lesson Plans</h2>
            <p>
              Class and Group plans are copied as editable Drafts. Empty matching Class or Group
              shells are created only when needed; no student memberships are copied.
            </p>
          </div>
          <button type="button" className="button secondary" onClick={selectAllPlans}>
            Select all plans
          </button>
        </div>
        {candidates.length === 0 ? (
          <p>No active Class or Group Lesson Plans are available in this source year.</p>
        ) : (
          <div className={styles.choiceList}>
            {candidates.map((candidate) => (
              <label className={styles.choiceCard} key={candidate.plan.id}>
                <input
                  type="checkbox"
                  checked={selectedPlanIds.has(candidate.plan.id)}
                  onChange={() => togglePlan(candidate.plan.id)}
                />
                <span>
                  <strong>{candidate.plan.title}</strong>
                  <small>
                    {candidate.context.name}
                    {candidate.series ? ` · ${candidate.series.title}` : ' · Standalone plan'}
                  </small>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className={`card ${styles.section}`}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>3. Optional Schedule starting point</h2>
            <p>
              Copied plans remain unscheduled unless their preferred block is also copied. Conflicts
              are warnings, so you can adjust the new Schedule after rollover.
            </p>
          </div>
        </div>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={copySchedule}
            onChange={(event) => {
              setCopySchedule(event.target.checked);
              if (!event.target.checked) setSelectedScheduleBlockIds(new Set());
              clearReview();
            }}
          />
          <span>Copy selected Schedule Blocks as an editable starting point</span>
        </label>
        {copySchedule && (
          <div className={styles.choiceList}>
            {scheduleCandidates.map((block) => (
              <label className={styles.choiceCard} key={block.id}>
                <input
                  type="checkbox"
                  checked={selectedScheduleBlockIds.has(block.id)}
                  onChange={() => toggleSchedule(block.id)}
                />
                <span>
                  <strong>{scheduleLabel(block)}</strong>
                  <small>
                    {block.effectiveFrom ?? 'Open start'} through {block.effectiveTo ?? 'Open end'}
                  </small>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      <div className={styles.previewAction}>
        <button
          type="button"
          className="button primary"
          disabled={
            busy || !sourceSchoolYearId || !targetSchoolYearId || selectedPlanIds.size === 0
          }
          onClick={() => void generatePreview()}
        >
          Generate reviewed preview
        </button>
        <span>Preview creates no database records.</span>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {preview && (
        <section className={`card ${styles.preview}`} aria-labelledby="rollover-preview-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>No writes yet</p>
              <h2 id="rollover-preview-heading">Instructional rollover preview</h2>
              <p>
                {preview.sourceSchoolYear.label}: {preview.sourceSchoolYear.startsOn} through{' '}
                {preview.sourceSchoolYear.endsOn} → {preview.targetSchoolYear.label}:{' '}
                {preview.targetSchoolYear.startsOn} through {preview.targetSchoolYear.endsOn}
              </p>
            </div>
          </div>

          <div className={styles.summary} aria-label="Instructional rollover summary">
            <article>
              <strong>{preview.createdPlans.length}</strong>
              <span>Lesson Plans</span>
            </article>
            <article>
              <strong>{preview.createdSeries.length}</strong>
              <span>Lesson Series</span>
            </article>
            <article>
              <strong>{preview.createdStandardAlignments.length}</strong>
              <span>Standards links</span>
            </article>
            <article>
              <strong>{preview.createdScheduleBlocks.length}</strong>
              <span>Schedule Blocks</span>
            </article>
          </div>

          {preview.blockingIssues.length > 0 && (
            <div className={styles.blocking} role="alert">
              <AlertTriangle aria-hidden="true" />
              <div>
                <strong>Resolve before committing</strong>
                <ul>
                  {preview.blockingIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className={styles.warning}>
              <AlertTriangle aria-hidden="true" />
              <div>
                <strong>Review warnings</strong>
                <ul>
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div
            className={styles.tableScroller}
            tabIndex={0}
            aria-label="Scrollable instructional rollover preview"
          >
            <table>
              <thead>
                <tr>
                  <th>Class / Group</th>
                  <th>Series</th>
                  <th>Lesson Plan</th>
                  <th>New state</th>
                </tr>
              </thead>
              <tbody>
                {preview.planRows.map((row) => (
                  <tr key={row.target.id}>
                    <td>{row.contextName}</td>
                    <td>{row.seriesTitle ?? 'Standalone'}</td>
                    <td>
                      <strong>{row.target.title}</strong>
                    </td>
                    <td>
                      Draft
                      {row.target.preferredScheduleBlockId
                        ? ' · Schedule mapped'
                        : ' · Unscheduled'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.confirmations}>
            <label>
              <input
                type="checkbox"
                checked={reviewedPreview}
                onChange={(event) => setReviewedPreview(event.target.checked)}
              />
              <span>
                I reviewed the copied Lesson Series, Plans, Flow, Standards, categories, and
                optional Schedule.
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={acceptedBoundaries}
                onChange={(event) => setAcceptedBoundaries(event.target.checked)}
              />
              <span>
                I understand that School Year dates and activation will not change, and that
                Sessions, student memberships, completion history, Tasks, and Reminders are not
                copied.
              </span>
            </label>
          </div>

          <button
            type="button"
            className="button primary"
            disabled={!preview.canCommit || !reviewedPreview || !acceptedBoundaries || busy}
            onClick={() => void commit()}
          >
            <Copy aria-hidden="true" />
            Commit instructional rollover
          </button>
        </section>
      )}

      {result && (
        <section className={`card ${styles.success}`} aria-live="polite">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>Instructional rollover committed</h2>
            <p>
              Created {result.createdPlanCount} Lesson Plan
              {result.createdPlanCount === 1 ? '' : 's'} and a pre-rollover safety backup. Use
              global Undo to remove the new copies without changing either School Year.
            </p>
          </div>
        </section>
      )}

      {sourceYear && targetYear && (
        <p className={styles.footerNote}>
          Current boundaries: {sourceYear.startsOn}–{sourceYear.endsOn} and {targetYear.startsOn}–
          {targetYear.endsOn}. These values are read-only in this workflow.
        </p>
      )}
    </div>
  );
}
