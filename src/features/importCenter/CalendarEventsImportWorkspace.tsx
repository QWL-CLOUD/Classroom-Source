import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Download, Import } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import {
  calendarEventImportOccurrenceSchema,
  calendarEventImportSeriesSchema,
  calendarEventSchema,
  categoryAssignmentSchema,
  categoryValueSchema,
  classificationMappingPresetSchema,
  schoolYearSchema,
} from '@/domain/models/entities';
import {
  buildCalendarEventImportPreview,
  calendarEventImportFieldKeys,
  calendarEventImportFieldLabels,
  calendarEventImportSourceContentFingerprint,
  createEmptyCalendarEventImportMapping,
  suggestCalendarEventImportMapping,
  type CalendarEventDuplicateDecision,
  type CalendarEventDuplicateDecisions,
  type CalendarEventImportColumnMapping,
  type CalendarEventImportDefaults,
  type CalendarEventImportPreview,
  type CalendarEventImportPreviewRow,
  type CalendarEventImportSource,
  type CalendarEventTentativeAcknowledgements,
} from '@/features/calendarEventImport/calendarEventImportModel';
import { parseCalendarEventIcs } from '@/features/calendarEventImport/calendarEventImportIcsParser';
import type {
  CalendarEventRecurrenceDecision,
  CalendarEventRecurrenceDecisions,
} from '@/features/calendarEventImport/calendarEventRecurrenceReconciliation';
import { calendarEventImportMutationService } from '@/features/calendarEventImport/calendarEventImportMutationService';
import { downloadCalendarEventImportTemplate } from '@/features/calendarEventImport/calendarEventImportTemplate';

import { ImportClassificationReview } from './ImportClassificationReview';
import type { ImportClassificationMappingPersistenceDecisions } from './importClassificationMappingPresetPlan';
import type { ImportClassificationDecisions } from './importClassificationResolution';
import { ImportMappingTable, type ImportMappingField } from './ImportMappingTable';
import { ImportPreviewTable, type ImportPreviewColumn } from './ImportPreviewTable';
import { ImportSourcePanel } from './ImportSourcePanel';
import { MAX_IMPORT_FILE_BYTES, parseImportFile } from './importSourceAdapters';
import { buildImportTable, type ImportTable } from './importTableModel';
import type { ImportWorkbook } from './importTypes';
import styles from './ImportCenterShared.module.css';

const mappingFields: Array<ImportMappingField<(typeof calendarEventImportFieldKeys)[number]>> =
  calendarEventImportFieldKeys.map((key) => ({
    key,
    label: calendarEventImportFieldLabels[key],
    required: key === 'externalKey' || key === 'title' || key === 'startDate',
  }));

const classificationLabels: Record<CalendarEventImportPreviewRow['classification'], string> = {
  create: 'Create',
  update: 'Update',
  remove: 'Remove',
  skip: 'Skip',
  review: 'Review',
  blocked: 'Blocked',
};

function previewTone(classification: CalendarEventImportPreviewRow['classification']) {
  if (classification === 'create') return 'new';
  if (classification === 'update') return 'update';
  if (classification === 'remove') return 'blocked';
  if (classification === 'skip') return 'skip';
  return 'blocked';
}

function minuteLabel(value: number | undefined): string {
  if (value === undefined) return 'All day';
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const previewColumns: Array<ImportPreviewColumn<CalendarEventImportPreviewRow>> = [
  {
    key: 'row',
    label: 'Source',
    render: (row) =>
      row.normalized.eventOrdinal ? `Event ${row.normalized.eventOrdinal}` : `Row ${row.sourceRow}`,
  },
  {
    key: 'classification',
    label: 'Classification',
    render: (row) => (
      <span className={styles.classification} data-tone={previewTone(row.classification)}>
        {classificationLabels[row.classification]}
      </span>
    ),
  },
  {
    key: 'event',
    label: 'Calendar Event',
    render: (row) => (
      <>
        <strong>{row.normalized.title || 'Untitled Event'}</strong>
        <small>
          {row.normalized.startDate}
          {row.normalized.endDate !== row.normalized.startDate
            ? ` through ${row.normalized.endDate}`
            : ''}{' '}
          · {minuteLabel(row.normalized.startMinute)}
        </small>
      </>
    ),
  },
  {
    key: 'identity',
    label: 'Stable identity',
    render: (row) => (
      <>
        <strong>{row.normalized.externalKey || 'Missing Event ID'}</strong>
        <small>{row.normalized.externalSource || 'Missing source namespace'}</small>
      </>
    ),
  },
  {
    key: 'reason',
    label: 'Visible reason',
    render: (row) => (
      <ul className={styles.reasonList}>
        {row.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    ),
  },
];

function encodeDuplicateDecision(decision: CalendarEventDuplicateDecision | undefined): string {
  if (!decision) return '';
  if (decision.action === 'create' || decision.action === 'skip') return decision.action;
  return `update:${decision.targetId}`;
}

function decodeDuplicateDecision(value: string): CalendarEventDuplicateDecision | undefined {
  if (!value) return undefined;
  if (value === 'create' || value === 'skip') return { action: value };
  if (value.startsWith('update:')) return { action: 'update', targetId: value.slice(7) };
  return undefined;
}

export function CalendarEventsImportWorkspace() {
  const data = useLiveQuery(async () => {
    const [schoolYears, events, series, occurrences, values, assignments, mappingPresets] =
      await Promise.all([
        classroomDb.schoolYears.toArray(),
        classroomDb.calendarEvents.toArray(),
        classroomDb.calendarEventImportSeries.toArray(),
        classroomDb.calendarEventImportOccurrences.toArray(),
        classroomDb.categoryValues.toArray(),
        classroomDb.categoryAssignments.where('entityType').equals('calendar-event').toArray(),
        classroomDb.classificationMappingPresets.toArray(),
      ]);
    return {
      schoolYears: schoolYears.map((value) => schoolYearSchema.parse(value)),
      events: events.map((value) => calendarEventSchema.parse(value)),
      series: series.map((value) => calendarEventImportSeriesSchema.parse(value)),
      occurrences: occurrences.map((value) => calendarEventImportOccurrenceSchema.parse(value)),
      categoryValues: values.map((value) => categoryValueSchema.parse(value)),
      categoryAssignments: assignments.map((value) => categoryAssignmentSchema.parse(value)),
      mappingPresets: mappingPresets.map((value) => classificationMappingPresetSchema.parse(value)),
    };
  }, []);

  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState('');
  const [workbook, setWorkbook] = useState<ImportWorkbook | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [fileLabel, setFileLabel] = useState('');
  const [sourceKind, setSourceKind] = useState<'ics' | 'csv' | 'xlsx' | null>(null);
  const [parsedIcs, setParsedIcs] = useState<Awaited<
    ReturnType<typeof parseCalendarEventIcs>
  > | null>(null);
  const [table, setTable] = useState<ImportTable | null>(null);
  const [mapping, setMapping] = useState<CalendarEventImportColumnMapping>(
    createEmptyCalendarEventImportMapping,
  );
  const [defaults, setDefaults] = useState<CalendarEventImportDefaults>({});
  const [duplicateDecisions, setDuplicateDecisions] = useState<CalendarEventDuplicateDecisions>({});
  const [tentativeAcknowledgements, setTentativeAcknowledgements] =
    useState<CalendarEventTentativeAcknowledgements>({});
  const [recurrenceDecisions, setRecurrenceDecisions] = useState<CalendarEventRecurrenceDecisions>(
    {},
  );
  const [classificationDecisions, setClassificationDecisions] =
    useState<ImportClassificationDecisions>({});
  const [mappingPersistenceDecisions, setMappingPersistenceDecisions] =
    useState<ImportClassificationMappingPersistenceDecisions>({});
  const [preview, setPreview] = useState<CalendarEventImportPreview | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [confirmUpdates, setConfirmUpdates] = useState(false);
  const [confirmRemovals, setConfirmRemovals] = useState(false);
  const [confirmCommit, setConfirmCommit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successDate, setSuccessDate] = useState<string | null>(null);

  const activeSchoolYears = useMemo(
    () =>
      (data?.schoolYears ?? [])
        .filter((year) => year.active && year.lifecycleState !== 'archived')
        .sort((first, second) => first.startsOn.localeCompare(second.startsOn)),
    [data],
  );
  useEffect(() => {
    if (!selectedSchoolYearId && activeSchoolYears.length === 1) {
      setSelectedSchoolYearId(activeSchoolYears[0]!.id);
    }
  }, [activeSchoolYears, selectedSchoolYearId]);

  const selectedSchoolYear = activeSchoolYears.find((year) => year.id === selectedSchoolYearId);
  const selectedSheet = workbook?.worksheets[selectedSheetIndex] ?? null;
  const source = useMemo<CalendarEventImportSource | null>(() => {
    if (sourceKind === 'ics' && parsedIcs) return { kind: 'ics', parsed: parsedIcs };
    if ((sourceKind === 'csv' || sourceKind === 'xlsx') && table) {
      return { kind: 'tabular', sourceKind, table, mapping, defaults };
    }
    return null;
  }, [defaults, mapping, parsedIcs, sourceKind, table]);
  const mappedCount = useMemo(
    () => calendarEventImportFieldKeys.filter((key) => mapping[key] !== null).length,
    [mapping],
  );

  function markReviewDirty(): void {
    if (preview) setReviewDirty(true);
    setSuccess(null);
    setSuccessDate(null);
  }

  function resetReview(): void {
    setDuplicateDecisions({});
    setTentativeAcknowledgements({});
    setRecurrenceDecisions({});
    setClassificationDecisions({});
    setMappingPersistenceDecisions({});
    setPreview(null);
    setReviewDirty(false);
    setConfirmUpdates(false);
    setConfirmRemovals(false);
    setConfirmCommit(false);
    setSuccess(null);
    setSuccessDate(null);
  }

  async function chooseFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (file.size > MAX_IMPORT_FILE_BYTES)
        throw new Error('Choose a Calendar file no larger than 20 MB.');
      const extension = file.name.split('.').at(-1)?.toLocaleLowerCase('en-US');
      if (extension === 'ics') {
        const parsed = await parseCalendarEventIcs(await file.text());
        setParsedIcs(parsed);
        setWorkbook(null);
        setTable(null);
        setSourceKind('ics');
        setSelectedSheetIndex(0);
        setFileLabel(file.name);
        resetReview();
        return;
      }
      if (extension !== 'csv' && extension !== 'xlsx') {
        throw new Error('Choose a .ics, .csv, or .xlsx Calendar file.');
      }
      const next = await parseImportFile(file);
      if (next.kind !== 'csv' && next.kind !== 'xlsx') {
        throw new Error('Calendar Events support only ICS, CSV, and XLSX sources.');
      }
      setWorkbook(next);
      setSelectedSheetIndex(0);
      setFileLabel(file.name);
      setSourceKind(next.kind);
      setParsedIcs(null);
      const nextTable = next.worksheets[0] ? buildImportTable(next.worksheets[0].rows) : null;
      setTable(nextTable);
      setMapping(
        nextTable
          ? suggestCalendarEventImportMapping(nextTable.headers)
          : createEmptyCalendarEventImportMapping(),
      );
      resetReview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not parse the Calendar source.');
    } finally {
      setBusy(false);
    }
  }

  function selectWorksheet(index: number): void {
    setSelectedSheetIndex(index);
    const sheet = workbook?.worksheets[index];
    const nextTable = sheet ? buildImportTable(sheet.rows) : null;
    setTable(nextTable);
    setMapping(
      nextTable
        ? suggestCalendarEventImportMapping(nextTable.headers)
        : createEmptyCalendarEventImportMapping(),
    );
    resetReview();
  }

  function generatePreview(): void {
    if (!source || !selectedSchoolYear || !data) return;
    setError(null);
    setSuccess(null);
    setSuccessDate(null);
    try {
      setPreview(
        buildCalendarEventImportPreview({
          source,
          schoolYear: selectedSchoolYear,
          duplicateDecisions,
          tentativeAcknowledgements,
          classificationDecisions,
          mappingPersistenceDecisions,
          existingEvents: data.events,
          existingSeries: data.series,
          existingOccurrences: data.occurrences,
          recurrenceDecisions,
          categoryValues: data.categoryValues,
          mappingPresets: data.mappingPresets,
          categoryAssignments: data.categoryAssignments,
        }),
      );
      setReviewDirty(false);
      setConfirmUpdates(false);
      setConfirmRemovals(false);
      setConfirmCommit(false);
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'The Calendar preview could not be built.');
    }
  }

  async function commit(): Promise<void> {
    if (!preview || !source || reviewDirty) return;
    setBusy(true);
    setError(null);
    try {
      const result = await calendarEventImportMutationService.commit(preview, {
        sourceKind: preview.sourceKind,
        sourceLabel: fileLabel || undefined,
        worksheetName: preview.sourceKind === 'xlsx' ? selectedSheet?.name : undefined,
        sourceContentFingerprint: calendarEventImportSourceContentFingerprint(source),
        confirmUpdates,
        confirmRemovals,
        confirmCommit,
      });
      const mappingSummary =
        result.createdMappingPresets.length > 0 || result.updatedMappingPresets.length > 0
          ? ` Saved ${result.createdMappingPresets.length} and updated ${result.updatedMappingPresets.length} import mappings.`
          : '';
      setSuccess(
        `Committed ${result.created.length} new and ${result.updated.length} updated Calendar Events, with ${result.removed.length} removed, as one global Undo action.${mappingSummary}`,
      );
      setSuccessDate(result.earliestStartDate ?? null);
      setPreview(null);
      setConfirmUpdates(false);
      setConfirmRemovals(false);
      setConfirmCommit(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Calendar Event import failed.');
    } finally {
      setBusy(false);
    }
  }

  const duplicateReviewRows = preview?.rows.filter((row) => row.duplicateReview) ?? [];
  const recurrenceReviewRows = preview?.rows.filter((row) => row.recurrenceReview) ?? [];
  const tentativeReviewRows =
    preview?.rows.filter(
      (row) => row.normalized.status === 'TENTATIVE' && row.classification === 'review',
    ) ?? [];
  const classificationReviews = preview?.classificationReviews ?? [];

  return (
    <section className={styles.workspace} aria-labelledby="calendar-events-import-heading">
      <div className={styles.workspaceHeader} data-testid="calendar-events-import-header">
        <div>
          <p className="page-eyebrow">Phase 3I-0.5J.3</p>
          <h2 id="calendar-events-import-heading">Import Calendar Events</h2>
          <p>
            Import reviewed one-time and recurring school-wide Events into one active School Year.
            Schedule Blocks, Schedule Exceptions, Sessions, and reminders are never changed.
          </p>
        </div>
        <div className={styles.templateActions}>
          <button
            type="button"
            className="button"
            onClick={() => downloadCalendarEventImportTemplate('xlsx')}
          >
            <Download size={16} aria-hidden="true" /> Excel template
          </button>
          <button
            type="button"
            className="button"
            onClick={() => downloadCalendarEventImportTemplate('csv')}
          >
            <Download size={16} aria-hidden="true" /> CSV template
          </button>
        </div>
      </div>

      <section className={`card ${styles.section}`} aria-labelledby="calendar-school-year-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className="page-eyebrow">Step 1</p>
            <h3 id="calendar-school-year-heading">Choose the destination School Year</h3>
          </div>
        </div>
        {activeSchoolYears.length > 0 ? (
          <label className={styles.inlineField} htmlFor="calendar-import-school-year">
            <span>Active School Year</span>
            <select
              id="calendar-import-school-year"
              value={selectedSchoolYearId}
              disabled={busy}
              onChange={(event) => {
                setSelectedSchoolYearId(event.target.value);
                resetReview();
              }}
            >
              <option value="">Choose School Year</option>
              {activeSchoolYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.label} · {year.startsOn} through {year.endsOn}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className={styles.warning} role="alert">
            Create or activate a School Year before importing Calendar Events.{' '}
            <Link to="/settings#school-years">Manage School Years</Link>
          </p>
        )}
      </section>

      <ImportSourcePanel
        headingId="calendar-event-source-heading"
        stepLabel="Step 2"
        title="Choose the source"
        description="ICS, CSV, or XLSX"
        fileLabel={fileLabel}
        accept=".ics,.csv,.xlsx,text/calendar,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        inputLabel="Choose Calendar Events import file"
        busy={busy}
        workbook={workbook}
        selectedSheetIndex={selectedSheetIndex}
        worksheetInputId="calendar-event-worksheet"
        onChooseFile={chooseFile}
        onSelectWorksheet={selectWorksheet}
      />

      {parsedIcs?.diagnostics.length ? (
        <section
          className={`card ${styles.section}`}
          aria-labelledby="calendar-ics-diagnostics-heading"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">ICS diagnostics</p>
              <h3 id="calendar-ics-diagnostics-heading">Ignored or retained source details</h3>
            </div>
          </div>
          <ul className={styles.reasonList}>
            {parsedIcs.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.sourceRow ?? 0}-${index}`}>{diagnostic.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {sourceKind === 'ics' && parsedIcs ? (
        <section
          className={`card ${styles.section}`}
          aria-labelledby="calendar-ics-preview-heading"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Step 3</p>
              <h3 id="calendar-ics-preview-heading">Review parsed ICS Events</h3>
            </div>
            <span className={styles.meta}>{parsedIcs.componentCount} VEVENT components</span>
          </div>
          <p className={styles.helpText}>
            Supported recurrence and one-off exceptions expand into reviewed discrete Events.
            Unsupported recurrence, incompatible date-time forms, and lossy seconds are blocked.
            VALARM data is ignored and never creates reminders.
          </p>
          <button
            type="button"
            className="button button-primary"
            disabled={busy || !selectedSchoolYear}
            onClick={generatePreview}
          >
            <Import size={16} aria-hidden="true" /> Generate reviewed preview
          </button>
        </section>
      ) : null}

      {table && (sourceKind === 'csv' || sourceKind === 'xlsx') ? (
        <>
          <section
            className={`card ${styles.section}`}
            aria-labelledby="calendar-source-default-heading"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className="page-eyebrow">Tabular identity</p>
                <h3 id="calendar-source-default-heading">Review the source namespace</h3>
              </div>
            </div>
            <label className={styles.inlineField} htmlFor="calendar-source-default">
              <span>Default external source</span>
              <input
                id="calendar-source-default"
                value={defaults.externalSource ?? ''}
                disabled={busy}
                onChange={(event) => {
                  setDefaults({ externalSource: event.target.value });
                  markReviewDirty();
                }}
                placeholder="District calendar"
              />
            </label>
            <p className={styles.helpText}>
              Used only when a row has no mapped external_source value. File names are never
              identity.
            </p>
          </section>
          <ImportMappingTable
            headingId="calendar-event-mapping-heading"
            stepLabel="Step 3"
            title="Map Calendar Event fields"
            helpText="Dates use YYYY-MM-DD; tabular end_date is inclusive. Blank times mean all day."
            headers={table.headers}
            fields={mappingFields}
            mapping={mapping}
            mappedCount={mappedCount}
            busy={busy}
            previewDisabled={!selectedSchoolYear}
            onChange={(field, column) => {
              setMapping((current) => ({ ...current, [field]: column }));
              markReviewDirty();
            }}
            onReset={() => {
              setMapping(suggestCalendarEventImportMapping(table.headers));
              markReviewDirty();
            }}
            onPreview={generatePreview}
          />
        </>
      ) : null}

      {preview ? (
        <>
          <section
            className={`card ${styles.section}`}
            aria-labelledby="calendar-event-preview-heading"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className="page-eyebrow">Step 4</p>
                <h3 id="calendar-event-preview-heading">Reviewed preview</h3>
              </div>
              <span className={styles.meta}>
                {preview.summary.createCount} create · {preview.summary.updateCount} update ·{' '}
                {preview.summary.removeCount} remove · {preview.summary.skipCount} skip ·{' '}
                {preview.summary.reviewCount} review · {preview.summary.blockedCount} blocked
              </span>
            </div>
            {reviewDirty ? (
              <p className={styles.warning} role="status">
                Review decisions changed. Generate the preview again before commit.
              </p>
            ) : null}
            <ImportPreviewTable
              label="Calendar Event import preview"
              rows={preview.rows}
              columns={previewColumns}
              rowKey={(row) => row.rowKey}
            />
          </section>

          {duplicateReviewRows.length ||
          recurrenceReviewRows.length ||
          tentativeReviewRows.length ||
          classificationReviews.length ? (
            <section
              className={`card ${styles.reviewCard}`}
              aria-labelledby="calendar-event-decisions-heading"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <p className="page-eyebrow">Explicit decisions</p>
                  <h3 id="calendar-event-decisions-heading">Resolve every Review Event</h3>
                </div>
              </div>
              <div className={styles.reviewGrid}>
                {duplicateReviewRows.map((row) => (
                  <label key={`duplicate-${row.rowKey}`}>
                    <span>
                      {row.normalized.eventOrdinal
                        ? `Event ${row.normalized.eventOrdinal}`
                        : `Row ${row.sourceRow}`}
                      : {row.normalized.title}
                      <small>{row.duplicateReview?.message}</small>
                    </span>
                    <select
                      value={encodeDuplicateDecision(duplicateDecisions[row.rowKey])}
                      disabled={busy}
                      onChange={(event) => {
                        setDuplicateDecisions((current) => ({
                          ...current,
                          [row.rowKey]: decodeDuplicateDecision(event.target.value),
                        }));
                        markReviewDirty();
                      }}
                    >
                      <option value="">Choose decision</option>
                      <option value="create">Create separate imported Event</option>
                      <option value="skip">Skip source Event</option>
                      {row.duplicateReview?.candidates
                        .filter((candidate) => candidate.canUpdate)
                        .map((candidate) => (
                          <option key={candidate.id} value={`update:${candidate.id}`}>
                            Update and adopt manual Event: {candidate.title}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
                {recurrenceReviewRows.map((row) => (
                  <label key={`recurrence-${row.rowKey}`}>
                    <span>
                      Event {row.normalized.eventOrdinal ?? row.sourceRow}: {row.normalized.title}
                      <small>{row.reasons[0]}</small>
                    </span>
                    <select
                      value={
                        recurrenceDecisions[row.recurrenceReview!.occurrenceIdentityKey]?.action ??
                        ''
                      }
                      disabled={busy}
                      onChange={(event) => {
                        const action = event.target.value as
                          CalendarEventRecurrenceDecision['action'] | '';
                        setRecurrenceDecisions((current) => ({
                          ...current,
                          [row.recurrenceReview!.occurrenceIdentityKey]: action
                            ? { action }
                            : undefined,
                        }));
                        markReviewDirty();
                      }}
                    >
                      <option value="">Choose recurrence decision</option>
                      {row.recurrenceReview?.options.map((option) => (
                        <option key={option.action} value={option.action}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                {tentativeReviewRows.map((row) => (
                  <label key={`tentative-${row.sourceRow}`} className={styles.confirmation}>
                    <input
                      type="checkbox"
                      checked={Boolean(tentativeAcknowledgements[row.sourceRow])}
                      disabled={busy}
                      onChange={(event) => {
                        setTentativeAcknowledgements((current) => ({
                          ...current,
                          [row.sourceRow]: event.target.checked,
                        }));
                        markReviewDirty();
                      }}
                    />
                    <span>
                      Import {row.normalized.title} as a normal Event despite STATUS:TENTATIVE.
                    </span>
                  </label>
                ))}
                <ImportClassificationReview
                  reviews={classificationReviews}
                  decisions={classificationDecisions}
                  mappingPersistenceDecisions={mappingPersistenceDecisions}
                  categoryValues={data?.categoryValues ?? []}
                  disabled={busy}
                  onDecision={(key, decision) => {
                    setClassificationDecisions((current) => ({ ...current, [key]: decision }));
                    markReviewDirty();
                  }}
                  onMappingPersistenceDecision={(key, decision) => {
                    setMappingPersistenceDecisions((current) => ({ ...current, [key]: decision }));
                    markReviewDirty();
                  }}
                />
              </div>
              <button type="button" className="button" onClick={generatePreview}>
                <Import size={16} aria-hidden="true" /> Regenerate reviewed preview
              </button>
            </section>
          ) : null}

          <section
            className={`card ${styles.commitCard}`}
            aria-labelledby="calendar-event-commit-heading"
          >
            <div>
              <p className="page-eyebrow">Step 5</p>
              <h3 id="calendar-event-commit-heading">Atomic commit</h3>
              <p>
                One transaction and one global Undo action. The selected School Year is revalidated
                inside commit.
              </p>
            </div>
            {preview.summary.updateCount > 0 ? (
              <label className={styles.confirmation}>
                <input
                  type="checkbox"
                  checked={confirmUpdates}
                  onChange={(event) => setConfirmUpdates(event.target.checked)}
                />
                <span>Confirm the reviewed Calendar Event updates.</span>
              </label>
            ) : null}
            {preview.summary.removeCount > 0 ? (
              <label className={styles.confirmation}>
                <input
                  type="checkbox"
                  checked={confirmRemovals}
                  onChange={(event) => setConfirmRemovals(event.target.checked)}
                />
                <span>Confirm the reviewed Calendar Event removals.</span>
              </label>
            ) : null}
            <label className={styles.confirmation}>
              <input
                type="checkbox"
                checked={confirmCommit}
                onChange={(event) => setConfirmCommit(event.target.checked)}
              />
              <span>Commit the complete reviewed Calendar Event preview.</span>
            </label>
            <button
              type="button"
              className="button button-primary"
              disabled={
                busy ||
                reviewDirty ||
                !preview.canCommit ||
                preview.summary.createCount +
                  preview.summary.updateCount +
                  preview.summary.removeCount ===
                  0 ||
                !confirmCommit ||
                (preview.summary.updateCount > 0 && !confirmUpdates) ||
                (preview.summary.removeCount > 0 && !confirmRemovals)
              }
              onClick={() => void commit()}
            >
              <Import size={16} aria-hidden="true" /> Commit reviewed Calendar Events
            </button>
          </section>
        </>
      ) : null}

      {error ? (
        <div className={styles.errorBanner} role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className={styles.successBanner} role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{success}</span>
          <Link to={successDate ? `/calendar?date=${successDate}` : '/calendar'}>
            Open Calendar
          </Link>
          <Link to="/settings#school-years">Manage School Years</Link>
        </div>
      ) : null}
    </section>
  );
}
