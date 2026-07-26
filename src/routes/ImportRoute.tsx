import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Import,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
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

import styles from './ImportRoute.module.css';

const emptySource: StandardImportSourceValues = {
  sourceName: '',
  issuingOrganization: '',
  frameworkTitle: '',
  jurisdiction: '',
  version: '',
  importNote: '',
};

function previewTone(classification: StandardImportPreview['rows'][number]['classification']) {
  if (classification === 'valid-new') return 'new';
  if (classification === 'exact-duplicate') return 'duplicate';
  if (classification === 'reviewed-update') return 'update';
  return 'blocked';
}

export function ImportRoute() {
  const standards = useLiveQuery(async () => {
    const values = await classroomDb.standards.toArray();
    return values.map((value) => standardSchema.parse(value));
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const selectedSheet = workbook?.sheets[selectedSheetIndex] ?? null;
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
    const sheet = nextWorkbook.sheets[sheetIndex];
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
    try {
      const parsed = await parseStandardImportFile(file);
      setWorkbook(parsed);
      setFileLabel(file.name);
      loadSheet(parsed, 0);
    } catch (cause) {
      setWorkbook(null);
      setTable(null);
      setFileLabel('');
      setMapping(createEmptyColumnMapping());
      invalidatePreview();
      setError(cause instanceof Error ? cause.message : 'The import file could not be read.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function updateSource(key: keyof StandardImportSourceValues, value: string): void {
    setSource((current) => ({ ...current, [key]: value }));
    invalidatePreview();
  }

  function updateMapping(key: (typeof standardImportFieldKeys)[number], value: string): void {
    setMapping((current) => ({ ...current, [key]: value === '' ? null : Number(value) }));
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
    <div className={`page-shell ${styles.page}`}>
      <header className={styles.pageHeader}>
        <div>
          <p className="page-eyebrow">Settings &amp; Data</p>
          <h1>Import Center</h1>
          <p>
            Review Standards from a local CSV or XLSX file. Nothing is written until the complete
            preview passes validation and you explicitly confirm the commit.
          </p>
        </div>
        <div className={styles.privacyNote}>
          <ShieldCheck size={19} aria-hidden="true" />
          <span>
            Files stay in this browser session; file paths and workbook contents are not stored.
          </span>
        </div>
      </header>

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

      <section className={`card ${styles.section}`} aria-labelledby="import-file-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className="page-eyebrow">Step 1</p>
            <h2 id="import-file-heading">Choose the reviewed source file</h2>
          </div>
          {fileLabel ? <span className={styles.fileBadge}>{fileLabel}</span> : null}
        </div>
        <div className={styles.filePicker}>
          <FileSpreadsheet size={28} aria-hidden="true" />
          <div>
            <strong>CSV or XLSX, up to 20 MB</strong>
            <span>XLSX files are decompressed and parsed locally.</span>
          </div>
          <label className="button button-primary">
            Choose file
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={busy}
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
          </label>
        </div>
        {workbook && workbook.sheets.length > 1 ? (
          <div className={styles.inlineField}>
            <label htmlFor="standard-import-worksheet">Worksheet</label>
            <select
              id="standard-import-worksheet"
              value={selectedSheetIndex}
              onChange={(event) => {
                try {
                  setError(null);
                  loadSheet(workbook, Number(event.target.value));
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : 'The worksheet could not be read.',
                  );
                }
              }}
            >
              {workbook.sheets.map((sheet, index) => (
                <option key={`${sheet.name}-${index}`} value={index}>
                  {sheet.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </section>

      {table ? (
        <>
          <section className={`card ${styles.section}`} aria-labelledby="source-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className="page-eyebrow">Step 2</p>
                <h2 id="source-heading">Record source attribution</h2>
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

          <section className={`card ${styles.section}`} aria-labelledby="mapping-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className="page-eyebrow">Step 3</p>
                <h2 id="mapping-heading">Map worksheet columns</h2>
              </div>
              <span className={styles.meta}>{mappedCount} fields mapped</span>
            </div>
            <p className={styles.helpText}>
              Standard code and statement are required. Source fields mapped from the file override
              the reviewed source values row by row.
            </p>
            <div className={styles.mappingGrid}>
              {standardImportFieldKeys.map((key) => (
                <label key={key}>
                  <span id={`standard-import-mapping-label-${key}`}>
                    {standardImportFieldLabels[key]}
                    {key === 'code' || key === 'statement' ? ' *' : ''}
                  </span>
                  <select
                    aria-labelledby={`standard-import-mapping-label-${key}`}
                    value={mapping[key] ?? ''}
                    onChange={(event) => updateMapping(key, event.target.value)}
                  >
                    <option value="">Not mapped</option>
                    {table.headers.map((header, index) => (
                      <option key={`${key}-${index}`} value={index}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className={styles.actions}>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => {
                  setMapping(suggestStandardImportMapping(table.headers));
                  invalidatePreview();
                }}
              >
                <RefreshCcw size={16} aria-hidden="true" /> Reset suggestions
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={generatePreview}
                disabled={standards === undefined || busy}
              >
                <Import size={16} aria-hidden="true" /> Generate reviewed preview
              </button>
            </div>
          </section>
        </>
      ) : null}

      {preview ? (
        <section className={`card ${styles.section}`} aria-labelledby="preview-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Step 4</p>
              <h2 id="preview-heading">Review every classified row</h2>
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

          <div
            className={styles.tableScroller}
            tabIndex={0}
            aria-label="Scrollable Standards import preview"
          >
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Classification</th>
                  <th>Code</th>
                  <th>Statement</th>
                  <th>Parent</th>
                  <th>Review result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.code}`}>
                    <td>{row.rowNumber}</td>
                    <td>
                      <span
                        className={styles.classification}
                        data-tone={previewTone(row.classification)}
                      >
                        {standardImportClassificationLabels[row.classification]}
                      </span>
                    </td>
                    <td>
                      <strong>{row.code || '—'}</strong>
                      <small>{row.frameworkLabel}</small>
                    </td>
                    <td>{row.statement || '—'}</td>
                    <td>{row.parentCode || '—'}</td>
                    <td>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

      <section className={`card ${styles.legacy}`} aria-label="Legacy backup migration">
        <div>
          <p className="page-eyebrow">Separate workflow</p>
          <h2>Legacy Classroom backup</h2>
          <p>
            The existing v19 backup scanner remains a read-only migration preview and is not mixed
            with Standards import.
          </p>
        </div>
        <Link className="button" to="/migration">
          Open migration preview
        </Link>
      </section>
    </div>
  );
}
