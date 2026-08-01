import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Download, Import } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import { libraryCatalogItemSchema, type LibraryAssessmentKind } from '@/domain/models/entities';
import {
  assessmentImportFieldKeys,
  assessmentImportFieldLabels,
  buildAssessmentImportPreview,
  createEmptyAssessmentImportMapping,
  listReviewableAssessmentUnmappedColumns,
  suggestAssessmentImportMapping,
  type AssessmentDuplicateDecision,
  type AssessmentDuplicateDecisions,
  type AssessmentImportColumnMapping,
  type AssessmentImportDefaults,
  type AssessmentImportPreview,
  type AssessmentImportPreviewRow,
  type AssessmentKindDecisions,
  type UnmappedColumnDecisions,
} from '@/features/assessmentImport/assessmentImportModel';
import { assessmentImportMutationService } from '@/features/assessmentImport/assessmentImportMutationService';
import { downloadAssessmentImportTemplate } from '@/features/assessmentImport/assessmentImportTemplate';

import { ImportMappingTable, type ImportMappingField } from './ImportMappingTable';
import { ImportPreviewTable, type ImportPreviewColumn } from './ImportPreviewTable';
import { ImportSourcePanel, type ImportSourcePanelMode } from './ImportSourcePanel';
import { parseImportFile, parsePastedImportTable } from './importSourceAdapters';
import { buildImportTable, type ImportTable } from './importTableModel';
import type { ImportWorkbook } from './importTypes';
import styles from './ImportCenterShared.module.css';

const kinds: Array<{ value: LibraryAssessmentKind; label: string }> = [
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'formative', label: 'Formative' },
  { value: 'summative', label: 'Summative' },
  { value: 'self-assessment', label: 'Self-assessment' },
  { value: 'other', label: 'Other' },
];

const mappingFields: Array<ImportMappingField<(typeof assessmentImportFieldKeys)[number]>> =
  assessmentImportFieldKeys.map((key) => ({
    key,
    label: assessmentImportFieldLabels[key],
    required: key === 'title',
  }));

const classificationLabels: Record<AssessmentImportPreviewRow['classification'], string> = {
  create: 'Create',
  update: 'Update',
  skip: 'Skip',
  review: 'Review',
  blocked: 'Blocked',
};

function previewTone(classification: AssessmentImportPreviewRow['classification']) {
  if (classification === 'create') return 'new';
  if (classification === 'update') return 'update';
  if (classification === 'skip') return 'skip';
  return 'blocked';
}

const previewColumns: Array<ImportPreviewColumn<AssessmentImportPreviewRow>> = [
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
    label: 'Assessment',
    render: (row) => (
      <>
        <strong>{row.normalized.title || 'Untitled row'}</strong>
        <small>{row.normalized.assessmentKind ?? 'Kind requires review'}</small>
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

function encodeDuplicateDecision(decision: AssessmentDuplicateDecision | undefined): string {
  if (!decision) return '';
  if (decision.action === 'create' || decision.action === 'skip') return decision.action;
  return `${decision.action}:${decision.targetId}`;
}

function decodeDuplicateDecision(value: string): AssessmentDuplicateDecision | undefined {
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

export function AssessmentsImportWorkspace() {
  const existingItems = useLiveQuery(async () => {
    const items = await classroomDb.libraryItems.toArray();
    return items.map((value) => libraryCatalogItemSchema.parse(value));
  }, []);
  const [sourceMode, setSourceMode] = useState<ImportSourcePanelMode>('file');
  const [pastedText, setPastedText] = useState('');
  const [workbook, setWorkbook] = useState<ImportWorkbook | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [fileLabel, setFileLabel] = useState('');
  const [table, setTable] = useState<ImportTable | null>(null);
  const [mapping, setMapping] = useState<AssessmentImportColumnMapping>(
    createEmptyAssessmentImportMapping,
  );
  const [defaults, setDefaults] = useState<AssessmentImportDefaults>({});
  const [unmappedDecisions, setUnmappedDecisions] = useState<UnmappedColumnDecisions>({});
  const [duplicateDecisions, setDuplicateDecisions] = useState<AssessmentDuplicateDecisions>({});
  const [kindDecisions, setKindDecisions] = useState<AssessmentKindDecisions>({});
  const [preview, setPreview] = useState<AssessmentImportPreview | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [confirmUpdates, setConfirmUpdates] = useState(false);
  const [confirmCommit, setConfirmCommit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedSheet = workbook?.worksheets[selectedSheetIndex] ?? null;
  const mappedCount = useMemo(
    () => assessmentImportFieldKeys.filter((key) => mapping[key] !== null).length,
    [mapping],
  );
  const reviewableUnmappedColumns = useMemo(
    () => (table ? listReviewableAssessmentUnmappedColumns(table, mapping) : []),
    [mapping, table],
  );
  const unresolvedUnmappedCount = reviewableUnmappedColumns.filter(
    (column) => !unmappedDecisions[column.column],
  ).length;

  function markReviewDirty(): void {
    if (preview) setReviewDirty(true);
    setSuccess(null);
  }

  function loadWorkbook(next: ImportWorkbook, label: string): void {
    setWorkbook(next);
    setSelectedSheetIndex(0);
    setFileLabel(label);
    const sheet = next.worksheets[0];
    const nextTable = sheet ? buildImportTable(sheet.rows) : null;
    setTable(nextTable);
    setMapping(
      nextTable
        ? suggestAssessmentImportMapping(nextTable.headers)
        : createEmptyAssessmentImportMapping(),
    );
    setUnmappedDecisions({});
    setDuplicateDecisions({});
    setKindDecisions({});
    setPreview(null);
    setReviewDirty(false);
    setConfirmUpdates(false);
    setConfirmCommit(false);
  }

  async function chooseFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      loadWorkbook(await parseImportFile(file), file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not parse the Assessment source.');
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
        ? suggestAssessmentImportMapping(nextTable.headers)
        : createEmptyAssessmentImportMapping(),
    );
    setUnmappedDecisions({});
    setDuplicateDecisions({});
    setKindDecisions({});
    setPreview(null);
    setReviewDirty(false);
  }

  function parsePaste(): void {
    try {
      loadWorkbook(parsePastedImportTable(pastedText), 'Pasted assessment table');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not parse the pasted table.');
    }
  }

  function generatePreview(): void {
    if (!table || !existingItems) return;
    setError(null);
    setSuccess(null);
    try {
      setPreview(
        buildAssessmentImportPreview({
          table,
          mapping,
          defaults,
          unmappedDecisions,
          duplicateDecisions,
          kindDecisions,
          existingItems,
        }),
      );
      setReviewDirty(false);
      setConfirmUpdates(false);
      setConfirmCommit(false);
    } catch (cause) {
      setPreview(null);
      setError(
        cause instanceof Error ? cause.message : 'The Assessment preview could not be built.',
      );
    }
  }

  async function commit(): Promise<void> {
    if (!preview || !workbook || !selectedSheet || reviewDirty) return;
    if (!['csv', 'xlsx', 'json', 'paste-table'].includes(workbook.kind)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await assessmentImportMutationService.commit(preview, {
        sourceKind: workbook.kind as 'csv' | 'xlsx' | 'json' | 'paste-table',
        sourceLabel: workbook.sourceLabel ?? fileLabel,
        worksheetName: selectedSheet.name,
        confirmUpdates,
        confirmCommit,
      });
      setSuccess(
        `Committed ${result.created.length} new and ${result.updated.length} updated Assessments as one global Undo action.`,
      );
      setPreview(null);
      setConfirmUpdates(false);
      setConfirmCommit(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Assessment import failed.');
    } finally {
      setBusy(false);
    }
  }

  const kindReviewRows = preview?.rows.filter((row) => row.kindReview) ?? [];
  const duplicateReviewRows = preview?.rows.filter((row) => row.duplicateReview) ?? [];

  return (
    <section className={styles.workspace} aria-labelledby="assessment-import-heading">
      <div className={`card ${styles.workspaceIntro}`}>
        <div>
          <p className="page-eyebrow">Phase 3I-0.5E</p>
          <h2 id="assessment-import-heading">Import Assessments</h2>
          <p>
            Create reviewed reusable Assessment definitions. Student Evidence, scores, Rubrics, and
            Standard alignments are outside this import.
          </p>
        </div>
        <div className={styles.templateActions}>
          <button
            type="button"
            className="button"
            onClick={() => downloadAssessmentImportTemplate('csv')}
          >
            <Download size={16} aria-hidden="true" /> CSV template
          </button>
          <button
            type="button"
            className="button"
            onClick={() => downloadAssessmentImportTemplate('xlsx')}
          >
            <Download size={16} aria-hidden="true" /> Excel template
          </button>
        </div>
      </div>

      <ImportSourcePanel
        headingId="assessment-source-heading"
        stepLabel="Step 1"
        title="Choose the source"
        description="CSV, XLSX, JSON, or a pasted table"
        fileLabel={fileLabel}
        accept=".csv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        inputLabel="Choose Assessment import file"
        busy={busy}
        workbook={workbook}
        selectedSheetIndex={selectedSheetIndex}
        worksheetInputId="assessment-worksheet"
        onChooseFile={chooseFile}
        onSelectWorksheet={selectWorksheet}
        sourceModes={['file', 'paste-table']}
        sourceMode={sourceMode}
        onSourceModeChange={(mode) => {
          setSourceMode(mode);
          setWorkbook(null);
          setTable(null);
          setPreview(null);
          setFileLabel('');
          setReviewDirty(false);
        }}
        pasteInputId="assessment-paste-table"
        pasteValue={pastedText}
        pasteLabel="Paste Assessment rows with one header row"
        onPasteValueChange={setPastedText}
        onParsePaste={parsePaste}
      />

      {table ? (
        <>
          <section
            className={`card ${styles.section}`}
            aria-labelledby="assessment-defaults-heading"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className="page-eyebrow">Source defaults</p>
                <h3 id="assessment-defaults-heading">Apply only when a row is blank</h3>
              </div>
            </div>
            <div className={styles.mappingGrid}>
              <label>
                <span>External Source</span>
                <input
                  value={defaults.externalSource ?? ''}
                  onChange={(event) => {
                    setDefaults((value) => ({ ...value, externalSource: event.target.value }));
                    markReviewDirty();
                  }}
                />
              </label>
              <label>
                <span>Source Reference</span>
                <input
                  value={defaults.sourceReference ?? ''}
                  onChange={(event) => {
                    setDefaults((value) => ({ ...value, sourceReference: event.target.value }));
                    markReviewDirty();
                  }}
                />
              </label>
              <label>
                <span>Default Assessment Kind</span>
                <select
                  value={defaults.assessmentKind ?? ''}
                  onChange={(event) => {
                    setDefaults((value) => ({
                      ...value,
                      assessmentKind: (event.target.value || undefined) as
                        LibraryAssessmentKind | undefined,
                    }));
                    markReviewDirty();
                  }}
                >
                  <option value="">Review required</option>
                  {kinds.map((kind) => (
                    <option key={kind.value} value={kind.value}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <ImportMappingTable
            headingId="assessment-mapping-heading"
            stepLabel="Step 2"
            title="Map Assessment fields"
            helpText="Title is required. Assessment Kind must resolve to one of the five controlled values."
            headers={table.headers}
            fields={mappingFields}
            mapping={mapping}
            mappedCount={mappedCount}
            busy={busy}
            previewDisabled={
              !table.rows.length || mapping.title === null || unresolvedUnmappedCount > 0
            }
            onChange={(field, column) => {
              setMapping((value) => ({ ...value, [field]: column }));
              markReviewDirty();
            }}
            onReset={() => {
              setMapping(suggestAssessmentImportMapping(table.headers));
              markReviewDirty();
            }}
            onPreview={generatePreview}
          />

          {reviewableUnmappedColumns.length > 0 ? (
            <section
              className={`card ${styles.section}`}
              aria-labelledby="assessment-unmapped-heading"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <p className="page-eyebrow">Required review</p>
                  <h3 id="assessment-unmapped-heading">Resolve non-empty unmapped columns</h3>
                </div>
                <span className={styles.meta}>{reviewableUnmappedColumns.length} columns</span>
              </div>
              <p className={styles.helpText}>
                No non-empty source column is silently discarded. Preserve its values in Assessment
                notes or explicitly confirm that the column should be ignored.
              </p>
              <div className={styles.unmappedGrid}>
                {reviewableUnmappedColumns.map((column) => (
                  <label key={column.column}>
                    <span>
                      {column.header} <small>({column.nonEmptyCount} non-empty rows)</small>
                    </span>
                    <select
                      value={unmappedDecisions[column.column] ?? ''}
                      disabled={busy}
                      onChange={(event) => {
                        const decision =
                          event.target.value === ''
                            ? undefined
                            : (event.target.value as 'notes' | 'ignore');
                        setUnmappedDecisions((value) => ({
                          ...value,
                          [column.column]: decision,
                        }));
                        markReviewDirty();
                      }}
                    >
                      <option value="">Review required</option>
                      <option value="notes">Preserve values in Assessment notes</option>
                      <option value="ignore">Ignore this column — confirmed</option>
                    </select>
                  </label>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {preview ? (
        <>
          <section
            className={`card ${styles.section}`}
            aria-labelledby="assessment-preview-heading"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className="page-eyebrow">Step 3</p>
                <h3 id="assessment-preview-heading">Reviewed preview</h3>
              </div>
              <span className={styles.meta}>
                {preview.summary.createCount} create · {preview.summary.updateCount} update ·{' '}
                {preview.summary.reviewCount} review · {preview.summary.blockedCount} blocked
              </span>
            </div>
            {reviewDirty ? (
              <p className={styles.warning} role="status">
                Review decisions changed. Generate the preview again before commit.
              </p>
            ) : null}
            <ImportPreviewTable
              label="Assessment import preview"
              rows={preview.rows}
              columns={previewColumns}
              rowKey={(row) => String(row.sourceRow)}
            />
          </section>

          {kindReviewRows.length || duplicateReviewRows.length ? (
            <section
              className={`card ${styles.reviewCard}`}
              aria-labelledby="assessment-decisions-heading"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <p className="page-eyebrow">Explicit decisions</p>
                  <h3 id="assessment-decisions-heading">Resolve every Review row</h3>
                </div>
              </div>
              <div className={styles.reviewGrid}>
                {kindReviewRows.map((row) => (
                  <label key={`kind-${row.sourceRow}`}>
                    <span>
                      Row {row.sourceRow}: {row.normalized.title || 'Untitled row'}
                      <small>{row.kindReview?.message}</small>
                    </span>
                    <select
                      value={kindDecisions[row.sourceRow]?.kind ?? ''}
                      onChange={(event) => {
                        setKindDecisions((value) => ({
                          ...value,
                          [row.sourceRow]: event.target.value
                            ? { action: 'use', kind: event.target.value as LibraryAssessmentKind }
                            : undefined,
                        }));
                        markReviewDirty();
                      }}
                    >
                      <option value="">Choose Assessment Kind</option>
                      {kinds.map((kind) => (
                        <option key={kind.value} value={kind.value}>
                          {kind.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                {duplicateReviewRows.map((row) => (
                  <label key={`duplicate-${row.sourceRow}`}>
                    <span>
                      Row {row.sourceRow}: {row.normalized.title || 'Untitled row'}
                      <small>{row.duplicateReview?.message}</small>
                    </span>
                    <select
                      value={encodeDuplicateDecision(duplicateDecisions[row.sourceRow])}
                      onChange={(event) => {
                        setDuplicateDecisions((value) => ({
                          ...value,
                          [row.sourceRow]: decodeDuplicateDecision(event.target.value),
                        }));
                        markReviewDirty();
                      }}
                    >
                      <option value="">Choose decision</option>
                      <option value="create">Create separate Assessment</option>
                      <option value="skip">Skip row</option>
                      {row.duplicateReview?.candidates.map((candidate) => (
                        <option
                          key={candidate.id}
                          value={`${candidate.status === 'archived' ? 'restore-update' : 'update'}:${candidate.id}`}
                        >
                          {candidate.status === 'archived' ? 'Restore and update' : 'Update'}:{' '}
                          {candidate.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button type="button" className="button" onClick={generatePreview}>
                <Import size={16} aria-hidden="true" /> Regenerate reviewed preview
              </button>
            </section>
          ) : null}

          <section
            className={`card ${styles.commitCard}`}
            aria-labelledby="assessment-commit-heading"
          >
            <div>
              <p className="page-eyebrow">Step 4</p>
              <h3 id="assessment-commit-heading">Atomic commit</h3>
              <p>One transaction and one global Undo action. Student Evidence is not written.</p>
            </div>
            {preview.summary.updateCount > 0 ? (
              <label className={styles.confirmation}>
                <input
                  type="checkbox"
                  checked={confirmUpdates}
                  onChange={(event) => setConfirmUpdates(event.target.checked)}
                />
                <span>Confirm the reviewed Assessment updates.</span>
              </label>
            ) : null}
            <label className={styles.confirmation}>
              <input
                type="checkbox"
                checked={confirmCommit}
                onChange={(event) => setConfirmCommit(event.target.checked)}
              />
              <span>Commit the complete reviewed Assessment preview.</span>
            </label>
            <button
              type="button"
              className="button button-primary"
              disabled={
                busy ||
                reviewDirty ||
                !preview.canCommit ||
                !confirmCommit ||
                (preview.summary.updateCount > 0 && !confirmUpdates)
              }
              onClick={() => void commit()}
            >
              <Import size={16} aria-hidden="true" /> Commit reviewed Assessments
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
          <Link to="/library?tab=assessments">Open Library Assessments</Link>
        </div>
      ) : null}
    </section>
  );
}
