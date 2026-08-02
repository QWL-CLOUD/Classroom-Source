import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Download, Import, RefreshCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import {
  categoryAssignmentSchema,
  categoryValueSchema,
  libraryCatalogItemSchema,
  type CategoryValue,
} from '@/domain/models/entities';
import {
  activityImportFieldKeys,
  activityImportFieldLabels,
  buildActivityImportPreview,
  createEmptyActivityImportMapping,
  listReviewableUnmappedColumns,
  suggestActivityImportMapping,
  type ActivityCategoryDecision,
  type ActivityCategoryDecisions,
  type ActivityDuplicateDecision,
  type ActivityDuplicateDecisions,
  type ActivityImportColumnMapping,
  type ActivityImportPreview,
  type ActivityImportPreviewRow,
  type ActivityImportDefaults,
  type UnmappedColumnDecisions,
} from '@/features/activityImport/activityImportModel';
import { downloadActivityImportTemplate } from '@/features/activityImport/activityImportTemplate';
import { activityImportMutationService } from '@/features/activityImport/activityImportMutationService';

import { ImportMappingTable, type ImportMappingField } from './ImportMappingTable';
import { ImportPreviewTable, type ImportPreviewColumn } from './ImportPreviewTable';
import { ImportSourcePanel, type ImportSourcePanelMode } from './ImportSourcePanel';
import { ImportUnmappedColumnsReview } from './ImportUnmappedColumnsReview';
import { parseImportFile, parsePastedImportTable } from './importSourceAdapters';
import { buildImportTable, type ImportTable } from './importTableModel';
import type { ImportWorkbook } from './importTypes';
import styles from './ImportCenterShared.module.css';

const mappingFields: Array<ImportMappingField<(typeof activityImportFieldKeys)[number]>> =
  activityImportFieldKeys.map((key) => ({
    key,
    label: activityImportFieldLabels[key],
    required: key === 'title',
  }));

const emptyDefaults: ActivityImportDefaults = {
  externalSource: '',
  sourceReference: '',
};

const classificationLabels: Record<ActivityImportPreviewRow['classification'], string> = {
  create: 'Create',
  update: 'Update',
  skip: 'Skip',
  review: 'Review',
  blocked: 'Blocked',
};

function previewTone(classification: ActivityImportPreviewRow['classification']) {
  if (classification === 'create') return 'new';
  if (classification === 'update') return 'update';
  if (classification === 'skip') return 'skip';
  return 'blocked';
}

const previewColumns: Array<ImportPreviewColumn<ActivityImportPreviewRow>> = [
  { key: 'row', label: 'Row', render: (row) => row.sourceRow },
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
    key: 'title',
    label: 'Activity',
    render: (row) => (
      <>
        <strong>{row.normalized.title || 'Untitled row'}</strong>
        <small>
          {row.normalized.grouping ?? 'Flexible'}
          {row.normalized.durationMinutes ? ` · ${row.normalized.durationMinutes} min` : ''}
        </small>
      </>
    ),
  },
  {
    key: 'identity',
    label: 'Stable identity',
    render: (row) =>
      row.normalized.externalSource && row.normalized.externalKey ? (
        <>
          <strong>{row.normalized.externalKey}</strong>
          <small>{row.normalized.externalSource}</small>
        </>
      ) : (
        'No stable external identity'
      ),
  },
  {
    key: 'categories',
    label: 'Purpose / focus',
    render: (row) => (
      <>
        <strong>{row.normalized.purposeValues.join('; ') || 'No purpose values'}</strong>
        <small>{row.normalized.focusValues.join('; ') || 'No focus values'}</small>
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

function encodeDuplicateDecision(decision: ActivityDuplicateDecision | undefined): string {
  if (!decision) return '';
  if (decision.action === 'create' || decision.action === 'skip') return decision.action;
  return `${decision.action}:${decision.targetId}`;
}

function decodeDuplicateDecision(value: string): ActivityDuplicateDecision | undefined {
  if (!value) return undefined;
  if (value === 'create' || value === 'skip') return { action: value };
  const separator = value.indexOf(':');
  if (separator < 0) return undefined;
  const action = value.slice(0, separator);
  const targetId = value.slice(separator + 1);
  if (action === 'update' || action === 'update-archived' || action === 'restore-update') {
    return { action, targetId };
  }
  return undefined;
}

function encodeCategoryDecision(decision: ActivityCategoryDecision | undefined): string {
  if (!decision) return '';
  if (
    decision.action === 'create' ||
    decision.action === 'generic-tag' ||
    decision.action === 'ignore'
  ) {
    return decision.action;
  }
  return `${decision.action}:${decision.categoryValueId}`;
}

function decodeCategoryDecision(value: string): ActivityCategoryDecision | undefined {
  if (!value) return undefined;
  if (value === 'create' || value === 'generic-tag' || value === 'ignore') {
    return { action: value };
  }
  const separator = value.indexOf(':');
  if (separator < 0) return undefined;
  const action = value.slice(0, separator);
  const categoryValueId = value.slice(separator + 1);
  if (action === 'use' || action === 'restore') return { action, categoryValueId };
  return undefined;
}

export function ActivitiesImportWorkspace() {
  const data = useLiveQuery(async () => {
    const [items, values, assignments] = await Promise.all([
      classroomDb.libraryItems.toArray(),
      classroomDb.categoryValues.toArray(),
      classroomDb.categoryAssignments.where('entityType').equals('library-item').toArray(),
    ]);
    return {
      items: items.map((value) => libraryCatalogItemSchema.parse(value)),
      categoryValues: values.map((value) => categoryValueSchema.parse(value)),
      categoryAssignments: assignments.map((value) => categoryAssignmentSchema.parse(value)),
    };
  }, []);

  const [sourceMode, setSourceMode] = useState<ImportSourcePanelMode>('file');
  const [pastedText, setPastedText] = useState('');
  const [workbook, setWorkbook] = useState<ImportWorkbook | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [fileLabel, setFileLabel] = useState('');
  const [table, setTable] = useState<ImportTable | null>(null);
  const [mapping, setMapping] = useState<ActivityImportColumnMapping>(
    createEmptyActivityImportMapping,
  );
  const [defaults, setDefaults] = useState<ActivityImportDefaults>(emptyDefaults);
  const [unmappedDecisions, setUnmappedDecisions] = useState<UnmappedColumnDecisions>({});
  const [duplicateDecisions, setDuplicateDecisions] = useState<ActivityDuplicateDecisions>({});
  const [categoryDecisions, setCategoryDecisions] = useState<ActivityCategoryDecisions>({});
  const [preview, setPreview] = useState<ActivityImportPreview | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [confirmUpdates, setConfirmUpdates] = useState(false);
  const [confirmCommit, setConfirmCommit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedSheet = workbook?.worksheets[selectedSheetIndex] ?? null;
  const mappedCount = useMemo(
    () => activityImportFieldKeys.filter((key) => mapping[key] !== null).length,
    [mapping],
  );
  const unresolvedUnmappedCount = useMemo(
    () =>
      table
        ? listReviewableUnmappedColumns(table, mapping).filter(
            (column) => !unmappedDecisions[column.column],
          ).length
        : 0,
    [mapping, table, unmappedDecisions],
  );

  function invalidatePreview(): void {
    setPreview(null);
    setReviewDirty(false);
    setConfirmUpdates(false);
    setConfirmCommit(false);
    setSuccess(null);
  }

  function clearSource(): void {
    setWorkbook(null);
    setSelectedSheetIndex(0);
    setFileLabel('');
    setTable(null);
    setMapping(createEmptyActivityImportMapping());
    setUnmappedDecisions({});
    setDuplicateDecisions({});
    setCategoryDecisions({});
    invalidatePreview();
  }

  function loadSheet(nextWorkbook: ImportWorkbook, sheetIndex: number): void {
    const sheet = nextWorkbook.worksheets[sheetIndex];
    if (!sheet) throw new Error('The selected worksheet is no longer available.');
    const nextTable = buildImportTable(sheet.rows);
    setSelectedSheetIndex(sheetIndex);
    setTable(nextTable);
    setMapping(suggestActivityImportMapping(nextTable.headers));
    setUnmappedDecisions({});
    setDuplicateDecisions({});
    setCategoryDecisions({});
    invalidatePreview();
  }

  async function chooseFile(file: File | undefined): Promise<void> {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setFileLabel(file.name);
    try {
      const parsed = await parseImportFile(file);
      setWorkbook(parsed);
      try {
        loadSheet(parsed, 0);
      } catch (cause) {
        setTable(null);
        setMapping(createEmptyActivityImportMapping());
        setError(
          cause instanceof Error ? cause.message : 'Select another worksheet to continue review.',
        );
      }
    } catch (cause) {
      clearSource();
      setError(cause instanceof Error ? cause.message : 'The Activity source could not be read.');
    } finally {
      setBusy(false);
    }
  }

  function parsePaste(): void {
    if (busy) return;
    setError(null);
    setSuccess(null);
    try {
      const parsed = parsePastedImportTable(pastedText);
      setWorkbook(parsed);
      setFileLabel('Pasted table');
      loadSheet(parsed, 0);
    } catch (cause) {
      clearSource();
      setSourceMode('paste-table');
      setError(cause instanceof Error ? cause.message : 'The pasted table could not be read.');
    }
  }

  function updateDefaults(key: keyof ActivityImportDefaults, value: string): void {
    setDefaults((current) => ({ ...current, [key]: value }));
    invalidatePreview();
  }

  function generatePreview(): void {
    if (!table || !data) return;
    setError(null);
    setSuccess(null);
    try {
      setPreview(
        buildActivityImportPreview({
          table,
          mapping,
          defaults,
          unmappedDecisions,
          duplicateDecisions,
          categoryDecisions,
          existingItems: data.items,
          categoryValues: data.categoryValues,
          categoryAssignments: data.categoryAssignments,
        }),
      );
      setReviewDirty(false);
      setConfirmUpdates(false);
      setConfirmCommit(false);
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'The Activity preview could not be built.');
    }
  }

  async function commitPreview(): Promise<void> {
    if (!preview || !workbook || !selectedSheet || busy || reviewDirty) return;
    if (!['csv', 'xlsx', 'json', 'paste-table'].includes(workbook.kind)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await activityImportMutationService.commit(preview, {
        sourceKind: workbook.kind as 'csv' | 'xlsx' | 'json' | 'paste-table',
        sourceLabel: workbook.sourceLabel ?? fileLabel,
        worksheetName: selectedSheet.name,
        confirmUpdates,
        confirmCommit,
      });
      setSuccess(
        `Committed ${result.created.length} new and ${result.updated.length} updated Activities. ${result.skippedCount} rows were skipped.`,
      );
      setPreview(null);
      setReviewDirty(false);
      setConfirmUpdates(false);
      setConfirmCommit(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The Activity import could not be committed.',
      );
    } finally {
      setBusy(false);
    }
  }

  const duplicateReviewRows =
    preview?.rows.filter((row) => row.classification === 'review' && row.duplicateReview) ?? [];
  const categoryReviews =
    preview?.rows
      .filter((row) => row.classification === 'review')
      .flatMap((row) => row.categoryReviews)
      .filter(
        (review, index, values) => values.findIndex((value) => value.key === review.key) === index,
      ) ?? [];

  return (
    <section className={styles.workspace} aria-labelledby="activities-import-title">
      <div className={styles.workspaceHeader}>
        <div>
          <p className="page-eyebrow">Canonical workspace</p>
          <h2 id="activities-import-title">Import Activities</h2>
          <p>
            Create real Library Activities from reviewed CSV, XLSX, JSON, or pasted tables. Title
            equality never overwrites an existing record.
          </p>
        </div>
        <div className={styles.templateActions}>
          <button
            className="button"
            type="button"
            onClick={() => downloadActivityImportTemplate('xlsx')}
          >
            <Download aria-hidden="true" size={16} /> Excel template
          </button>
          <button
            className="button"
            type="button"
            onClick={() => downloadActivityImportTemplate('csv')}
          >
            <Download aria-hidden="true" size={16} /> CSV template
          </button>
        </div>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <div className={styles.success} role="status">
          <CheckCircle2 size={20} aria-hidden="true" />
          <span>{success}</span>
          <Link to="/library?tab=activities">Open Library Activities</Link>
        </div>
      ) : null}

      <ImportSourcePanel
        headingId="activity-import-source-heading"
        stepLabel="Step 1"
        title="Choose or paste the reviewed Activity source"
        description="CSV, XLSX, or JSON, up to 20 MB"
        fileLabel={fileLabel}
        accept=".csv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        inputLabel="Choose CSV, XLSX, or JSON Activities file"
        busy={busy}
        workbook={workbook}
        selectedSheetIndex={selectedSheetIndex}
        worksheetInputId="activity-import-worksheet"
        onChooseFile={chooseFile}
        onSelectWorksheet={(index) => {
          try {
            setError(null);
            if (workbook) loadSheet(workbook, index);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The worksheet could not be read.');
          }
        }}
        sourceModes={['file', 'paste-table']}
        sourceMode={sourceMode}
        onSourceModeChange={(mode) => {
          setSourceMode(mode);
          clearSource();
        }}
        pasteInputId="activity-import-paste-table"
        pasteValue={pastedText}
        onPasteValueChange={(value) => {
          setPastedText(value);
          if (sourceMode === 'paste-table') invalidatePreview();
        }}
        onParsePaste={parsePaste}
      />

      {table ? (
        <>
          <section
            className={`card ${styles.section}`}
            aria-labelledby="activity-source-defaults-heading"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className="page-eyebrow">Step 2</p>
                <h3 id="activity-source-defaults-heading">Review source identity defaults</h3>
              </div>
              <span className={styles.meta}>
                {table.rows.length.toLocaleString('en-US')} data rows
              </span>
            </div>
            <p className={styles.helpText}>
              External source is the stable publisher or catalog namespace used with Activity ID.
              Source reference is a document, URL, or citation and does not create update identity.
            </p>
            <div className={styles.formGrid}>
              <label>
                <span>Default external source namespace</span>
                <input
                  value={defaults.externalSource ?? ''}
                  maxLength={500}
                  onChange={(event) => updateDefaults('externalSource', event.target.value)}
                  placeholder="District Activity Catalog"
                />
              </label>
              <label>
                <span>Default source reference</span>
                <input
                  value={defaults.sourceReference ?? ''}
                  maxLength={2000}
                  onChange={(event) => updateDefaults('sourceReference', event.target.value)}
                  placeholder="Curriculum guide, URL, or document title"
                />
              </label>
            </div>
          </section>

          <ImportMappingTable
            headingId="activity-mapping-heading"
            stepLabel="Step 3"
            title="Map Activity columns"
            helpText="Title is required. Activity ID only becomes a stable update key when paired with a reviewed external source namespace."
            headers={table.headers}
            fields={mappingFields}
            mapping={mapping}
            mappedCount={mappedCount}
            busy={busy}
            previewDisabled={!data || unresolvedUnmappedCount > 0}
            onChange={(field, column) => {
              setMapping((current) => ({ ...current, [field]: column }));
              invalidatePreview();
            }}
            onReset={() => {
              setMapping(suggestActivityImportMapping(table.headers));
              setUnmappedDecisions({});
              invalidatePreview();
            }}
            onPreview={generatePreview}
          />

          <ImportUnmappedColumnsReview
            headingId="activity-unmapped-heading"
            table={table}
            mapping={mapping}
            decisions={unmappedDecisions}
            busy={busy}
            onChange={(column, decision) => {
              setUnmappedDecisions((current) => ({ ...current, [column]: decision }));
              invalidatePreview();
            }}
          />
        </>
      ) : null}

      {preview ? (
        <section className={`card ${styles.section}`} aria-labelledby="activity-preview-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Step 4</p>
              <h3 id="activity-preview-heading">Review every classified Activity row</h3>
            </div>
            <span className={styles.meta}>No database writes yet</span>
          </div>
          <div className={styles.summary} aria-label="Activity import preview summary">
            <div>
              <strong>{preview.summary.createCount}</strong>
              <span>Create</span>
            </div>
            <div>
              <strong>{preview.summary.updateCount}</strong>
              <span>Update</span>
            </div>
            <div>
              <strong>{preview.summary.skipCount}</strong>
              <span>Skip</span>
            </div>
            <div>
              <strong>{preview.summary.reviewCount}</strong>
              <span>Review</span>
            </div>
            <div>
              <strong>{preview.summary.blockedCount}</strong>
              <span>Blocked</span>
            </div>
          </div>

          <ImportPreviewTable
            label="Scrollable Activities import preview"
            rows={preview.rows}
            columns={previewColumns}
            rowKey={(row) => `${row.sourceRow}-${row.normalized.title}`}
          />

          {duplicateReviewRows.length > 0 || categoryReviews.length > 0 ? (
            <section
              className={styles.reviewCard}
              aria-labelledby="activity-review-decisions-heading"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <p className="page-eyebrow">Explicit decisions</p>
                  <h3 id="activity-review-decisions-heading">
                    Resolve probable duplicates and controlled values
                  </h3>
                </div>
                {reviewDirty ? (
                  <span className={styles.plannedBadge}>Preview needs refresh</span>
                ) : null}
              </div>
              <div className={styles.reviewGrid}>
                {duplicateReviewRows.map((row) => {
                  const review = row.duplicateReview!;
                  return (
                    <label key={`duplicate-${row.sourceRow}`}>
                      <span>
                        Row {row.sourceRow}: {row.normalized.title}
                        <small>{review.message}</small>
                      </span>
                      <select
                        value={encodeDuplicateDecision(duplicateDecisions[row.sourceRow])}
                        disabled={busy}
                        onChange={(event) => {
                          setDuplicateDecisions((current) => ({
                            ...current,
                            [row.sourceRow]: decodeDuplicateDecision(event.target.value),
                          }));
                          setReviewDirty(true);
                          setConfirmCommit(false);
                        }}
                      >
                        <option value="">Decision required</option>
                        <option value="create">Create a distinct Activity</option>
                        <option value="skip">Skip this row</option>
                        {review.candidates.map((candidate) =>
                          candidate.status === 'active' ? (
                            <option key={`update-${candidate.id}`} value={`update:${candidate.id}`}>
                              Update “{candidate.title}” — explicit reviewed match
                            </option>
                          ) : (
                            <option
                              key={`archived-${candidate.id}`}
                              value={`update-archived:${candidate.id}`}
                            >
                              Update “{candidate.title}” and keep archived
                            </option>
                          ),
                        )}
                        {review.candidates
                          .filter((candidate) => candidate.status === 'archived')
                          .map((candidate) => (
                            <option
                              key={`restore-${candidate.id}`}
                              value={`restore-update:${candidate.id}`}
                            >
                              Restore and update “{candidate.title}”
                            </option>
                          ))}
                      </select>
                    </label>
                  );
                })}

                {categoryReviews.map((review) => {
                  const activeValues = (data?.categoryValues ?? [])
                    .filter(
                      (value) =>
                        value.familyId === review.familyId && value.lifecycleState === 'active',
                    )
                    .sort(
                      (first, second) =>
                        first.sortOrder - second.sortOrder || first.name.localeCompare(second.name),
                    );
                  return (
                    <label key={review.key}>
                      <span>
                        {review.familyId === 'purpose-tag' ? 'Purpose' : 'Focus'}:{' '}
                        {review.displayValue}
                        <small>
                          {review.kind === 'unknown'
                            ? 'Unknown controlled value'
                            : review.kind === 'archived'
                              ? 'Archived controlled value'
                              : 'Merged controlled value'}
                        </small>
                      </span>
                      <select
                        value={encodeCategoryDecision(categoryDecisions[review.key])}
                        disabled={busy}
                        onChange={(event) => {
                          setCategoryDecisions((current) => ({
                            ...current,
                            [review.key]: decodeCategoryDecision(event.target.value),
                          }));
                          setReviewDirty(true);
                          setConfirmCommit(false);
                        }}
                      >
                        <option value="">Decision required</option>
                        {review.replacementValue?.lifecycleState === 'active' ? (
                          <option value={`use:${review.replacementValue.id}`}>
                            Use merged replacement “{review.replacementValue.name}”
                          </option>
                        ) : null}
                        {review.matchedValue?.lifecycleState === 'archived' ? (
                          <option value={`restore:${review.matchedValue.id}`}>
                            Restore and use “{review.matchedValue.name}”
                          </option>
                        ) : null}
                        {activeValues.map((value: CategoryValue) => (
                          <option key={value.id} value={`use:${value.id}`}>
                            Use existing “{value.name}”
                          </option>
                        ))}
                        <option value="create">Create reviewed controlled value</option>
                        <option value="generic-tag">Keep as a generic searchable tag</option>
                        <option value="ignore">Ignore this value — confirmed</option>
                      </select>
                    </label>
                  );
                })}
              </div>
              <div className={styles.reviewActions}>
                <button className="button" type="button" disabled={busy} onClick={generatePreview}>
                  <RefreshCcw size={16} aria-hidden="true" /> Apply decisions and regenerate preview
                </button>
              </div>
            </section>
          ) : null}

          {!preview.canCommit || reviewDirty ? (
            <div className={styles.blocked} role="status">
              <AlertTriangle size={19} aria-hidden="true" />
              <span>
                {reviewDirty
                  ? 'Apply the changed review decisions and regenerate the no-write preview.'
                  : preview.hasChanges
                    ? 'Resolve every Review and Blocked row, then regenerate preview.'
                    : 'Every row is skipped; there is nothing to commit.'}
              </span>
            </div>
          ) : (
            <div className={styles.confirmation} aria-label="Activity import confirmations">
              {preview.summary.updateCount > 0 ? (
                <label>
                  <input
                    type="checkbox"
                    checked={confirmUpdates}
                    onChange={(event) => setConfirmUpdates(event.target.checked)}
                  />
                  I reviewed and approve the {preview.summary.updateCount} Activity updates. No
                  update was selected by title alone.
                </label>
              ) : null}
              <label>
                <input
                  type="checkbox"
                  checked={confirmCommit}
                  onChange={(event) => setConfirmCommit(event.target.checked)}
                />
                Commit records, status, tags, Purpose/Focus values and assignments, and import
                metadata as one atomic, globally undoable transaction.
              </label>
              <button
                className="button button-primary"
                type="button"
                disabled={
                  busy || !confirmCommit || (preview.summary.updateCount > 0 && !confirmUpdates)
                }
                onClick={() => void commitPreview()}
              >
                <Import size={16} aria-hidden="true" /> Commit reviewed Activities
              </button>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
