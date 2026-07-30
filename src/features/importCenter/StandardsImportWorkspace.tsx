import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Import } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import { standardSchema } from '@/domain/models/entities';
import {
  parseStandardImportFile,
  type StandardImportWorkbook,
} from '@/features/standardImport/standardImportFileParser';
import {
  buildStandardImportPreview,
  buildStandardImportTable,
  createEmptyColumnMapping,
  standardImportClassificationLabels,
  standardImportFieldKeys,
  standardImportFieldLabels,
  suggestStandardImportMapping,
  type StandardImportColumnMapping,
  type StandardImportPreview,
  type StandardImportSourceValues,
  type StandardImportTable,
} from '@/features/standardImport/standardImportModel';
import { standardImportMutationService } from '@/features/standardImport/standardImportMutationService';

import { ImportMappingTable, type ImportMappingField } from './ImportMappingTable';
import { ImportPreviewTable, type ImportPreviewColumn } from './ImportPreviewTable';
import { ImportSourcePanel } from './ImportSourcePanel';
import styles from './ImportCenterShared.module.css';

const emptySource: StandardImportSourceValues = {
  sourceName: '',
  issuingOrganization: '',
  frameworkTitle: '',
  jurisdiction: '',
  version: '',
  importNote: '',
};

const mappingFields: Array<ImportMappingField<(typeof standardImportFieldKeys)[number]>> =
  standardImportFieldKeys.map((key) => ({
    key,
    label: standardImportFieldLabels[key],
    required: key === 'code' || key === 'statement',
  }));

function previewTone(classification: StandardImportPreview['rows'][number]['classification']) {
  if (classification === 'valid-new') return 'new';
  if (classification === 'exact-duplicate') return 'duplicate';
  if (classification === 'reviewed-update') return 'update';
  return 'blocked';
}

const previewColumns: Array<ImportPreviewColumn<StandardImportPreview['rows'][number]>> = [
  { key: 'row', label: 'Row', render: (row) => row.rowNumber },
  {
    key: 'classification',
    label: 'Classification',
    render: (row) => (
      <span className={styles.classification} data-tone={previewTone(row.classification)}>
        {standardImportClassificationLabels[row.classification]}
      </span>
    ),
  },
  {
    key: 'code',
    label: 'Code',
    render: (row) => (
      <>
        <strong>{row.code || '—'}</strong>
        <small>{row.frameworkLabel}</small>
      </>
    ),
  },
  { key: 'statement', label: 'Statement', render: (row) => row.statement || '—' },
  { key: 'parent', label: 'Parent', render: (row) => row.parentCode || '—' },
  { key: 'reason', label: 'Review result', render: (row) => row.reason },
];

export function StandardsImportWorkspace() {
  const standards = useLiveQuery(async () => {
    const values = await classroomDb.standards.toArray();
    return values.map((value) => standardSchema.parse(value));
  }, []);
  const [workbook, setWorkbook] = useState<StandardImportWorkbook | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [fileLabel, setFileLabel] = useState('');
  const [table, setTable] = useState<StandardImportTable | null>(null);
  const [mapping, setMapping] = useState<StandardImportColumnMapping>(createEmptyColumnMapping);
  const [source, setSource] = useState<StandardImportSourceValues>(emptySource);
  const [preview, setPreview] = useState<StandardImportPreview | null>(null);
  const [confirmUpdates, setConfirmUpdates] = useState(false);
  const [confirmCommit, setConfirmCommit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedSheet = workbook?.worksheets[selectedSheetIndex] ?? null;
  const mappedCount = useMemo(
    () => standardImportFieldKeys.filter((key) => mapping[key] !== null).length,
    [mapping],
  );

  function invalidatePreview(): void {
    setPreview(null);
    setConfirmUpdates(false);
    setConfirmCommit(false);
    setSuccess(null);
  }

  function loadSheet(nextWorkbook: StandardImportWorkbook, sheetIndex: number): void {
    const sheet = nextWorkbook.worksheets[sheetIndex];
    if (!sheet) throw new Error('The selected worksheet is no longer available.');
    const nextTable = buildStandardImportTable(sheet.rows);
    setSelectedSheetIndex(sheetIndex);
    setTable(nextTable);
    setMapping(suggestStandardImportMapping(nextTable.headers));
    invalidatePreview();
  }

  async function chooseFile(file: File | undefined): Promise<void> {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setFileLabel(file.name);
    try {
      const parsed = await parseStandardImportFile(file);
      setWorkbook(parsed);
      try {
        loadSheet(parsed, 0);
      } catch (cause) {
        setSelectedSheetIndex(0);
        setTable(null);
        setMapping(createEmptyColumnMapping());
        invalidatePreview();
        setError(
          cause instanceof Error
            ? cause.message
            : 'Select another worksheet to continue the review.',
        );
      }
    } catch (cause) {
      setWorkbook(null);
      setTable(null);
      setFileLabel('');
      setMapping(createEmptyColumnMapping());
      invalidatePreview();
      setError(cause instanceof Error ? cause.message : 'The import file could not be read.');
    } finally {
      setBusy(false);
    }
  }

  function updateSource(key: keyof StandardImportSourceValues, value: string): void {
    setSource((current) => ({ ...current, [key]: value }));
    invalidatePreview();
  }

  function generatePreview(): void {
    if (!table || standards === undefined) return;
    setError(null);
    setSuccess(null);
    try {
      setPreview(
        buildStandardImportPreview({ table, mapping, source, existingStandards: standards }),
      );
      setConfirmUpdates(false);
      setConfirmCommit(false);
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'The reviewed preview could not be built.');
    }
  }

  async function commitPreview(): Promise<void> {
    if (!preview || !workbook || !selectedSheet || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await standardImportMutationService.commit(preview, {
        fileKind: workbook.kind,
        sourceLabel: workbook.sourceLabel ?? fileLabel,
        worksheetName: selectedSheet.name,
        confirmUpdates,
        confirmCommit,
      });
      setSuccess(
        `Committed ${result.created.length} new and ${result.updated.length} updated Standards. ${result.duplicateCount} exact duplicates were left unchanged.`,
      );
      setPreview(null);
      setConfirmUpdates(false);
      setConfirmCommit(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The reviewed import could not be committed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.workspace} aria-labelledby="standards-import-title">
      <div className={styles.workspaceHeader}>
        <div>
          <p className="page-eyebrow">Canonical workspace</p>
          <h2 id="standards-import-title">Import Standards</h2>
          <p>
            Review source attribution, hierarchy, duplicates, and updates before one atomic commit.
          </p>
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
          <Link to="/standards">Open Standards</Link>
        </div>
      ) : null}

      <ImportSourcePanel
        headingId="standard-import-file-heading"
        stepLabel="Step 1"
        title="Choose the reviewed source file"
        description="CSV or XLSX, up to 20 MB"
        fileLabel={fileLabel}
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        inputLabel="Choose CSV or XLSX Standards file"
        busy={busy}
        workbook={workbook}
        selectedSheetIndex={selectedSheetIndex}
        worksheetInputId="standard-import-worksheet"
        onChooseFile={chooseFile}
        onSelectWorksheet={(index) => {
          try {
            setError(null);
            if (!workbook) return;
            loadSheet(workbook, index);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The worksheet could not be read.');
          }
        }}
      />

      {table ? (
        <>
          <section className={`card ${styles.section}`} aria-labelledby="standard-source-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className="page-eyebrow">Step 2</p>
                <h3 id="standard-source-heading">Record source attribution</h3>
              </div>
              <span className={styles.meta}>
                {table.rows.length.toLocaleString('en-US')} data rows
              </span>
            </div>
            <div className={styles.formGrid}>
              <label>
                <span>Source name *</span>
                <input
                  value={source.sourceName}
                  onChange={(event) => updateSource('sourceName', event.target.value)}
                  placeholder="Reviewed document or publication title"
                />
              </label>
              <label>
                <span>Issuing organization *</span>
                <input
                  value={source.issuingOrganization}
                  onChange={(event) => updateSource('issuingOrganization', event.target.value)}
                  placeholder="Publisher, agency, or organization"
                />
              </label>
              <label>
                <span>Framework title *</span>
                <input
                  value={source.frameworkTitle}
                  onChange={(event) => updateSource('frameworkTitle', event.target.value)}
                  placeholder="Framework or standards set"
                />
              </label>
              <label>
                <span>Jurisdiction or scope</span>
                <input
                  value={source.jurisdiction}
                  onChange={(event) => updateSource('jurisdiction', event.target.value)}
                  placeholder="State, district, program, or scope"
                />
              </label>
              <label>
                <span>Version or year</span>
                <input
                  value={source.version}
                  onChange={(event) => updateSource('version', event.target.value)}
                  placeholder="2026 or adopted version"
                />
              </label>
              <label className={styles.wideField}>
                <span>Source note</span>
                <textarea
                  value={source.importNote}
                  onChange={(event) => updateSource('importNote', event.target.value)}
                  rows={3}
                  placeholder="Optional reviewed provenance or import note"
                />
              </label>
            </div>
          </section>

          <ImportMappingTable
            headingId="standard-mapping-heading"
            stepLabel="Step 3"
            title="Map worksheet columns"
            helpText="Standard code and statement are required. Source fields mapped from the file override the reviewed source values row by row."
            headers={table.headers}
            fields={mappingFields}
            mapping={mapping}
            mappedCount={mappedCount}
            busy={busy}
            previewDisabled={standards === undefined}
            onChange={(field, column) => {
              setMapping((current) => ({ ...current, [field]: column }));
              invalidatePreview();
            }}
            onReset={() => {
              setMapping(suggestStandardImportMapping(table.headers));
              invalidatePreview();
            }}
            onPreview={generatePreview}
          />
        </>
      ) : null}

      {preview ? (
        <section className={`card ${styles.section}`} aria-labelledby="standard-preview-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Step 4</p>
              <h3 id="standard-preview-heading">Review every classified row</h3>
            </div>
            <span className={styles.meta}>No database writes yet</span>
          </div>
          <div className={styles.summary} aria-label="Import preview summary">
            <div>
              <strong>{preview.summary.newCount}</strong>
              <span>New</span>
            </div>
            <div>
              <strong>{preview.summary.updateCount}</strong>
              <span>Updates</span>
            </div>
            <div>
              <strong>{preview.summary.duplicateCount}</strong>
              <span>Duplicates</span>
            </div>
            <div>
              <strong>
                {preview.summary.invalidCount +
                  preview.summary.unresolvedParentCount +
                  preview.summary.hierarchyConflictCount +
                  preview.summary.identityConflictCount}
              </strong>
              <span>Blocked</span>
            </div>
          </div>

          <ImportPreviewTable
            label="Scrollable Standards import preview"
            rows={preview.rows}
            columns={previewColumns}
            rowKey={(row) => `${row.rowNumber}-${row.code}`}
          />

          {!preview.canCommit ? (
            <div className={styles.blocked} role="status">
              <AlertTriangle size={19} aria-hidden="true" />
              <span>
                {preview.hasChanges
                  ? 'Resolve all blocked rows, then generate a new preview.'
                  : 'This file contains only exact duplicates; there is nothing to commit.'}
              </span>
            </div>
          ) : (
            <div className={styles.confirmation} aria-label="Commit confirmations">
              {preview.summary.updateCount > 0 ? (
                <label>
                  <input
                    type="checkbox"
                    checked={confirmUpdates}
                    onChange={(event) => setConfirmUpdates(event.target.checked)}
                  />
                  I reviewed and approve the {preview.summary.updateCount} existing Standard
                  updates.
                </label>
              ) : null}
              <label>
                <input
                  type="checkbox"
                  checked={confirmCommit}
                  onChange={(event) => setConfirmCommit(event.target.checked)}
                />
                Commit this complete preview as one atomic, globally undoable import.
              </label>
              <button
                className="button button-primary"
                type="button"
                disabled={
                  busy || !confirmCommit || (preview.summary.updateCount > 0 && !confirmUpdates)
                }
                onClick={() => void commitPreview()}
              >
                <Import size={16} aria-hidden="true" /> Commit reviewed import
              </button>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
