import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FilePlus2,
  Import,
  Link2,
  RefreshCcw,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import {
  categoryAssignmentSchema,
  categoryValueSchema,
  libraryCatalogItemSchema,
} from '@/domain/models/entities';
import {
  buildResourceImportPreview,
  createEmptyResourceImportMapping,
  listReviewableResourceUnmappedColumns,
  resourceImportFieldKeys,
  resourceImportFieldLabels,
  suggestResourceImportMapping,
  type ResourceDuplicateDecision,
  type ResourceDuplicateDecisions,
  type ResourceClassificationDecisions,
  type ResourceImportColumnMapping,
  type ResourceImportDefaults,
  type ResourceImportPreview,
  type ResourceImportPreviewRow,
  type ResourceSourceDecision,
  type ResourceSourceDecisions,
  type UnmappedColumnDecisions,
} from '@/features/resourceImport/resourceImportModel';
import { resourceImportMutationService } from '@/features/resourceImport/resourceImportMutationService';
import {
  buildResourceFileMetadataWorkbook,
  buildResourceUrlWorkbook,
  type ResourceUrlSourceInput,
} from '@/features/resourceImport/resourceImportSourceAdapters';
import { downloadResourceImportTemplate } from '@/features/resourceImport/resourceImportTemplate';

import { ImportClassificationReview } from './ImportClassificationReview';
import { ImportMappingTable, type ImportMappingField } from './ImportMappingTable';
import { ImportPreviewTable, type ImportPreviewColumn } from './ImportPreviewTable';
import { ImportSourcePanel } from './ImportSourcePanel';
import { parseImportFile, parsePastedImportTable } from './importSourceAdapters';
import { buildImportTable, type ImportTable } from './importTableModel';
import type { ImportSourceKind, ImportWorkbook } from './importTypes';
import styles from './ImportCenterShared.module.css';

const mappingFields: Array<ImportMappingField<(typeof resourceImportFieldKeys)[number]>> =
  resourceImportFieldKeys.map((key) => ({
    key,
    label: resourceImportFieldLabels[key],
    required: key === 'title',
  }));

const emptyDefaults: ResourceImportDefaults = {
  externalSource: '',
  sourceReference: '',
};

const emptyUrl: ResourceUrlSourceInput = {
  title: '',
  url: '',
  resourceFormat: '',
  usageNotes: '',
  externalSource: '',
  externalKey: '',
  sourceReference: '',
};

type ResourceSourceMode = 'file' | 'paste-table' | 'paste-url' | 'file-metadata';

const classificationLabels: Record<ResourceImportPreviewRow['classification'], string> = {
  create: 'Create',
  update: 'Update',
  skip: 'Skip',
  review: 'Review',
  blocked: 'Blocked',
};

function previewTone(classification: ResourceImportPreviewRow['classification']) {
  if (classification === 'create') return 'new';
  if (classification === 'update') return 'update';
  if (classification === 'skip') return 'skip';
  return 'blocked';
}

const previewColumns: Array<ImportPreviewColumn<ResourceImportPreviewRow>> = [
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
    label: 'Resource',
    render: (row) => (
      <>
        <strong>{row.normalized.title || 'Untitled row'}</strong>
        <small>{row.normalized.resourceFormat || 'No reviewed format'}</small>
      </>
    ),
  },
  {
    key: 'location',
    label: 'Source or location',
    render: (row) => row.normalized.sourceLocation || 'Not specified',
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

function encodeDuplicateDecision(decision: ResourceDuplicateDecision | undefined): string {
  if (!decision) return '';
  if (decision.action === 'create' || decision.action === 'skip') return decision.action;
  return `${decision.action}:${decision.targetId}`;
}

function decodeDuplicateDecision(value: string): ResourceDuplicateDecision | undefined {
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

function encodeSourceDecision(decision: ResourceSourceDecision | undefined): string {
  return decision?.action ?? '';
}

function sourceKind(workbook: ImportWorkbook): ImportSourceKind {
  return workbook.kind;
}

export function ResourcesImportWorkspace() {
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

  const [sourceMode, setSourceMode] = useState<ResourceSourceMode>('file');
  const [pastedText, setPastedText] = useState('');
  const [urlInput, setUrlInput] = useState<ResourceUrlSourceInput>(emptyUrl);
  const [metadataFiles, setMetadataFiles] = useState<File[]>([]);
  const [locationLabel, setLocationLabel] = useState('');
  const [workbook, setWorkbook] = useState<ImportWorkbook | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [fileLabel, setFileLabel] = useState('');
  const [table, setTable] = useState<ImportTable | null>(null);
  const [mapping, setMapping] = useState<ResourceImportColumnMapping>(
    createEmptyResourceImportMapping,
  );
  const [defaults, setDefaults] = useState<ResourceImportDefaults>(emptyDefaults);
  const [unmappedDecisions, setUnmappedDecisions] = useState<UnmappedColumnDecisions>({});
  const [duplicateDecisions, setDuplicateDecisions] = useState<ResourceDuplicateDecisions>({});
  const [classificationDecisions, setClassificationDecisions] =
    useState<ResourceClassificationDecisions>({});
  const [sourceDecisions, setSourceDecisions] = useState<ResourceSourceDecisions>({});
  const [preview, setPreview] = useState<ResourceImportPreview | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [confirmUpdates, setConfirmUpdates] = useState(false);
  const [confirmCommit, setConfirmCommit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedSheet = workbook?.worksheets[selectedSheetIndex] ?? null;
  const mappedCount = useMemo(
    () => resourceImportFieldKeys.filter((key) => mapping[key] !== null).length,
    [mapping],
  );
  const reviewableColumns = useMemo(
    () => (table ? listReviewableResourceUnmappedColumns(table, mapping) : []),
    [mapping, table],
  );
  const unresolvedUnmappedCount = reviewableColumns.filter(
    (column) => !unmappedDecisions[column.column],
  ).length;

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
    setMapping(createEmptyResourceImportMapping());
    setUnmappedDecisions({});
    setDuplicateDecisions({});
    setClassificationDecisions({});
    setSourceDecisions({});
    invalidatePreview();
  }

  function changeSourceMode(mode: ResourceSourceMode): void {
    clearSource();
    setSourceMode(mode);
    setError(null);
  }

  function loadSheet(nextWorkbook: ImportWorkbook, sheetIndex: number): void {
    const sheet = nextWorkbook.worksheets[sheetIndex];
    if (!sheet) throw new Error('The selected worksheet is no longer available.');
    const nextTable = buildImportTable(sheet.rows);
    setSelectedSheetIndex(sheetIndex);
    setTable(nextTable);
    setMapping(suggestResourceImportMapping(nextTable.headers));
    setUnmappedDecisions({});
    setDuplicateDecisions({});
    setClassificationDecisions({});
    setSourceDecisions({});
    invalidatePreview();
  }

  function acceptWorkbook(nextWorkbook: ImportWorkbook, label: string): void {
    setWorkbook(nextWorkbook);
    setFileLabel(label || nextWorkbook.sourceLabel || 'Resource source');
    loadSheet(nextWorkbook, 0);
  }

  async function chooseFile(file: File | undefined): Promise<void> {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = await parseImportFile(file);
      acceptWorkbook(parsed, file.name);
    } catch (cause) {
      clearSource();
      setError(cause instanceof Error ? cause.message : 'The Resource source could not be read.');
    } finally {
      setBusy(false);
    }
  }

  function parsePaste(): void {
    setError(null);
    try {
      const parsed = parsePastedImportTable(pastedText);
      acceptWorkbook(parsed, 'Pasted table');
    } catch (cause) {
      clearSource();
      setSourceMode('paste-table');
      setError(cause instanceof Error ? cause.message : 'The pasted table could not be read.');
    }
  }

  function parseUrl(): void {
    setError(null);
    try {
      const parsed = buildResourceUrlWorkbook(urlInput);
      acceptWorkbook(parsed, parsed.sourceLabel ?? 'URL Resource');
    } catch (cause) {
      clearSource();
      setSourceMode('paste-url');
      setError(cause instanceof Error ? cause.message : 'The URL Resource could not be prepared.');
    }
  }

  function parseMetadataFiles(): void {
    setError(null);
    try {
      const parsed = buildResourceFileMetadataWorkbook({ files: metadataFiles, locationLabel });
      acceptWorkbook(parsed, parsed.sourceLabel ?? 'Local file metadata');
    } catch (cause) {
      clearSource();
      setSourceMode('file-metadata');
      setError(cause instanceof Error ? cause.message : 'The file metadata could not be prepared.');
    }
  }

  function updateDefaults(key: keyof ResourceImportDefaults, value: string): void {
    setDefaults((current) => ({ ...current, [key]: value }));
    invalidatePreview();
  }

  function generatePreview(): void {
    if (!table || !data) return;
    setError(null);
    setSuccess(null);
    try {
      setPreview(
        buildResourceImportPreview({
          table,
          mapping,
          defaults,
          unmappedDecisions,
          duplicateDecisions,
          formatDecisions: {},
          classificationDecisions,
          sourceDecisions,
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
      setError(cause instanceof Error ? cause.message : 'The Resource preview could not be built.');
    }
  }

  async function commitPreview(): Promise<void> {
    if (!preview || !workbook || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await resourceImportMutationService.commit(preview, {
        sourceKind: sourceKind(workbook),
        sourceLabel: fileLabel || workbook.sourceLabel,
        worksheetName: selectedSheet?.name,
        confirmUpdates,
        confirmCommit,
      });
      setSuccess(
        `Committed ${result.created.length} new and ${result.updated.length} updated Resources. One global Undo reverses the complete import.`,
      );
      setConfirmCommit(false);
      setConfirmUpdates(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The Resource import could not be committed.',
      );
    } finally {
      setBusy(false);
    }
  }

  const duplicateReviewRows = preview?.rows.filter((row) => row.duplicateReview) ?? [];
  const sourceReviewRows = preview?.rows.filter((row) => row.sourceReview) ?? [];
  const classificationReviews = preview?.classificationReviews ?? [];

  return (
    <section className={styles.workspace} aria-labelledby="resources-import-title">
      <div className={styles.workspaceHeader}>
        <div>
          <p className="page-eyebrow">Canonical workspace</p>
          <h2 id="resources-import-title">Import Resources</h2>
          <p>
            Create real Library Resources from reviewed metadata and references. Classroom never
            stores file contents, and title, URL, or file-name equality never overwrites a record.
          </p>
        </div>
        <div className={styles.templateActions}>
          <button
            className="button"
            type="button"
            onClick={() => downloadResourceImportTemplate('xlsx')}
          >
            <Download aria-hidden="true" size={16} /> Excel template
          </button>
          <button
            className="button"
            type="button"
            onClick={() => downloadResourceImportTemplate('csv')}
          >
            <Download aria-hidden="true" size={16} /> CSV template
          </button>
        </div>
      </div>

      <fieldset className={`card ${styles.section} ${styles.sourceMethodCard}`}>
        <legend>Step 1 · Choose a Resource source method</legend>
        <div className={styles.sourceMethodGrid}>
          {(
            [
              ['file', 'Structured file', 'CSV, XLSX, or JSON'],
              ['paste-table', 'Pasted table', 'Copy rows from a spreadsheet'],
              ['paste-url', 'Add URL', 'Local metadata only; no network request'],
              ['file-metadata', 'Local file metadata', 'Name, type, size, and modified date only'],
            ] as const
          ).map(([mode, label, description]) => (
            <label key={mode}>
              <input
                type="radio"
                name="resource-source-method"
                value={mode}
                checked={sourceMode === mode}
                disabled={busy}
                onChange={() => changeSourceMode(mode)}
              />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {sourceMode === 'file' ? (
        <ImportSourcePanel
          headingId="resource-file-source"
          stepLabel="Step 1A"
          title="Choose a structured Resource file"
          description="Review CSV, XLSX, or JSON metadata"
          fileLabel={fileLabel}
          accept=".csv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          inputLabel="Choose CSV, XLSX, or JSON Resources file"
          busy={busy}
          workbook={workbook}
          selectedSheetIndex={selectedSheetIndex}
          worksheetInputId="resource-import-worksheet"
          onChooseFile={chooseFile}
          onSelectWorksheet={(index) => {
            if (workbook) loadSheet(workbook, index);
          }}
        />
      ) : null}

      {sourceMode === 'paste-table' ? (
        <section className={`card ${styles.section}`} aria-labelledby="resource-paste-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Step 1A</p>
              <h3 id="resource-paste-heading">Paste a Resource table</h3>
            </div>
            {fileLabel ? <span className={styles.fileBadge}>{fileLabel}</span> : null}
          </div>
          <div className={styles.pastePanel}>
            <label htmlFor="resource-pasted-table">Paste a table with one header row</label>
            <textarea
              id="resource-pasted-table"
              rows={9}
              value={pastedText}
              disabled={busy}
              onChange={(event) => setPastedText(event.target.value)}
              placeholder="title\tresource_format\tsource_location\nWeather deck\tSlides\tShared Drive / Weather.pptx"
            />
            <div className={styles.actions}>
              <button
                className="button button-primary"
                type="button"
                disabled={busy || !pastedText.trim()}
                onClick={parsePaste}
              >
                <ClipboardPaste size={16} aria-hidden="true" /> Review pasted table
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {sourceMode === 'paste-url' ? (
        <section className={`card ${styles.section}`} aria-labelledby="resource-url-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Step 1A</p>
              <h3 id="resource-url-heading">Add one URL as local metadata</h3>
            </div>
            <span className={styles.meta}>No webpage fetch</span>
          </div>
          <p className={styles.helpText}>
            Classroom validates the URL locally and creates one reviewable row. It does not request
            the page, download a file, or extract a title, image, or description.
          </p>
          <div className={styles.formGrid}>
            <label>
              <span>Title *</span>
              <input
                value={urlInput.title}
                onChange={(event) =>
                  setUrlInput((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label>
              <span>URL *</span>
              <input
                type="url"
                value={urlInput.url}
                onChange={(event) =>
                  setUrlInput((current) => ({ ...current, url: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Resource Format suggestion</span>
              <input
                value={urlInput.resourceFormat ?? ''}
                onChange={(event) =>
                  setUrlInput((current) => ({ ...current, resourceFormat: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Resource ID</span>
              <input
                value={urlInput.externalKey ?? ''}
                onChange={(event) =>
                  setUrlInput((current) => ({ ...current, externalKey: event.target.value }))
                }
              />
            </label>
            <label>
              <span>External source namespace</span>
              <input
                value={urlInput.externalSource ?? ''}
                onChange={(event) =>
                  setUrlInput((current) => ({ ...current, externalSource: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Source reference</span>
              <input
                value={urlInput.sourceReference ?? ''}
                onChange={(event) =>
                  setUrlInput((current) => ({ ...current, sourceReference: event.target.value }))
                }
              />
            </label>
            <label className={styles.wideField}>
              <span>Usage notes</span>
              <textarea
                rows={4}
                value={urlInput.usageNotes ?? ''}
                onChange={(event) =>
                  setUrlInput((current) => ({ ...current, usageNotes: event.target.value }))
                }
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button
              className="button button-primary"
              type="button"
              disabled={busy || !urlInput.title.trim() || !urlInput.url.trim()}
              onClick={parseUrl}
            >
              <Link2 size={16} aria-hidden="true" /> Prepare reviewed URL row
            </button>
          </div>
        </section>
      ) : null}

      {sourceMode === 'file-metadata' ? (
        <section className={`card ${styles.section}`} aria-labelledby="resource-metadata-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Step 1A</p>
              <h3 id="resource-metadata-heading">Create metadata-only rows from local files</h3>
            </div>
            <span className={styles.meta}>{metadataFiles.length} files selected</span>
          </div>
          <div className={styles.metadataNotice}>
            <FilePlus2 size={19} aria-hidden="true" />
            <span>
              Classroom reads only file name, MIME type, size, and last-modified date. It never
              reads or stores file contents, a Blob, base64, or the full local path.
            </span>
          </div>
          <div className={styles.formGrid}>
            <label>
              <span>Location label</span>
              <input
                value={locationLabel}
                onChange={(event) => setLocationLabel(event.target.value)}
                placeholder="Shared Drive / Grade 3 / Unit 1"
              />
            </label>
            <label>
              <span>Choose local files</span>
              <input
                type="file"
                multiple
                aria-label="Choose Resource files for metadata only"
                onChange={(event) => setMetadataFiles(Array.from(event.target.files ?? []))}
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button
              className="button button-primary"
              type="button"
              disabled={busy || metadataFiles.length === 0}
              onClick={parseMetadataFiles}
            >
              <FilePlus2 size={16} aria-hidden="true" /> Review file metadata rows
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <div className={styles.success} role="status">
          <CheckCircle2 size={19} aria-hidden="true" />
          <span>{success}</span>
          <Link className="button" to="/library?tab=resources">
            Open Library Resources
          </Link>
        </div>
      ) : null}

      {table ? (
        <>
          <section className={`card ${styles.section}`} aria-labelledby="resource-defaults-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className="page-eyebrow">Step 2</p>
                <h3 id="resource-defaults-heading">Review source provenance defaults</h3>
              </div>
              <span className={styles.meta}>{table.rows.length} data rows</span>
            </div>
            <div className={styles.formGrid}>
              <label>
                <span>Default external source namespace</span>
                <input
                  value={defaults.externalSource ?? ''}
                  disabled={busy}
                  onChange={(event) => updateDefaults('externalSource', event.target.value)}
                />
              </label>
              <label>
                <span>Default source reference</span>
                <input
                  value={defaults.sourceReference ?? ''}
                  disabled={busy}
                  onChange={(event) => updateDefaults('sourceReference', event.target.value)}
                />
              </label>
            </div>
            <p className={styles.helpText}>
              External Source plus Resource ID forms stable update identity. Source Reference stores
              a citation or provenance note and never creates update identity by itself.
            </p>
          </section>

          <ImportMappingTable
            headingId="resource-mapping-heading"
            stepLabel="Step 3"
            title="Map Resource columns"
            helpText="Review every suggested mapping. Title is required; no non-empty unmapped column is silently discarded."
            headers={table.headers}
            fields={mappingFields}
            mapping={mapping}
            mappedCount={mappedCount}
            busy={busy}
            previewDisabled={mapping.title === null || unresolvedUnmappedCount > 0 || !data}
            onChange={(field, column) => {
              setMapping((current) => ({ ...current, [field]: column }));
              setUnmappedDecisions({});
              invalidatePreview();
            }}
            onReset={() => {
              setMapping(suggestResourceImportMapping(table.headers));
              setUnmappedDecisions({});
              invalidatePreview();
            }}
            onPreview={generatePreview}
          />

          {reviewableColumns.length ? (
            <section
              className={`card ${styles.section}`}
              aria-labelledby="resource-unmapped-heading"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <p className="page-eyebrow">Required review</p>
                  <h3 id="resource-unmapped-heading">Resolve non-empty unmapped columns</h3>
                </div>
                <span className={styles.meta}>{reviewableColumns.length} columns</span>
              </div>
              <p className={styles.helpText}>
                Preserve values in Resource usage notes or explicitly confirm that the column should
                be ignored.
              </p>
              <div className={styles.unmappedGrid}>
                {reviewableColumns.map((column) => (
                  <label key={column.column}>
                    <span>
                      {column.header} <small>({column.nonEmptyCount} non-empty rows)</small>
                    </span>
                    <select
                      value={unmappedDecisions[column.column] ?? ''}
                      disabled={busy}
                      onChange={(event) => {
                        const value = event.target.value;
                        setUnmappedDecisions((current) => ({
                          ...current,
                          [column.column]: value === '' ? undefined : (value as 'notes' | 'ignore'),
                        }));
                        invalidatePreview();
                      }}
                    >
                      <option value="">Review required</option>
                      <option value="notes">Preserve values in usage notes</option>
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
        <section className={`card ${styles.section}`} aria-labelledby="resource-preview-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Step 4</p>
              <h3 id="resource-preview-heading">Review every classified Resource row</h3>
            </div>
            <span className={styles.meta}>No database writes yet</span>
          </div>
          <div className={styles.summary} aria-label="Resource import preview summary">
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
            label="Scrollable Resources import preview"
            rows={preview.rows}
            columns={previewColumns}
            rowKey={(row) => `${row.sourceRow}-${row.normalized.title}`}
          />

          {duplicateReviewRows.length || classificationReviews.length || sourceReviewRows.length ? (
            <section className={styles.reviewCard} aria-labelledby="resource-decisions-heading">
              <div className={styles.sectionHeading}>
                <div>
                  <p className="page-eyebrow">Explicit decisions</p>
                  <h3 id="resource-decisions-heading">
                    Resolve duplicates, URLs, and controlled classifications
                  </h3>
                </div>
                {reviewDirty ? (
                  <span className={styles.plannedBadge}>Preview needs refresh</span>
                ) : null}
              </div>
              <div className={styles.reviewGrid}>
                {sourceReviewRows.map((row) => (
                  <label key={`source-${row.sourceRow}`}>
                    <span>
                      Row {row.sourceRow}: possible credential URL
                      <small>{row.sourceReview?.message}</small>
                    </span>
                    <select
                      value={encodeSourceDecision(sourceDecisions[row.sourceRow])}
                      disabled={busy}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSourceDecisions((current) => ({
                          ...current,
                          [row.sourceRow]: value
                            ? ({ action: value } as ResourceSourceDecision)
                            : undefined,
                        }));
                        setReviewDirty(true);
                        setConfirmCommit(false);
                      }}
                    >
                      <option value="">Decision required</option>
                      <option value="keep">Keep this URL after review</option>
                      <option value="skip">Skip this row</option>
                    </select>
                  </label>
                ))}

                {duplicateReviewRows.map((row) => (
                  <label key={`duplicate-${row.sourceRow}`}>
                    <span>
                      Row {row.sourceRow}: {row.normalized.title}
                      <small>{row.duplicateReview?.message}</small>
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
                      <option value="create">Create a distinct Resource</option>
                      <option value="skip">Skip this row</option>
                      {row.duplicateReview?.candidates.map((candidate) =>
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
                      {row.duplicateReview?.candidates
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
                ))}

                <ImportClassificationReview
                  reviews={classificationReviews}
                  decisions={classificationDecisions}
                  categoryValues={data?.categoryValues ?? []}
                  disabled={busy}
                  onDecision={(key, decision) => {
                    setClassificationDecisions((current) => ({
                      ...current,
                      [key]: decision,
                    }));
                    setReviewDirty(true);
                    setConfirmCommit(false);
                  }}
                />
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
                  ? 'Apply changed decisions and regenerate the no-write preview.'
                  : preview.hasChanges
                    ? 'Resolve every Review and Blocked row, then regenerate preview.'
                    : 'Every row is skipped; there is nothing to commit.'}
              </span>
            </div>
          ) : (
            <div className={styles.confirmation} aria-label="Resource import confirmations">
              {preview.summary.updateCount > 0 ? (
                <label>
                  <input
                    type="checkbox"
                    checked={confirmUpdates}
                    onChange={(event) => setConfirmUpdates(event.target.checked)}
                  />
                  I reviewed and approve the {preview.summary.updateCount} Resource updates. No
                  update was selected by title, URL, or file name alone.
                </label>
              ) : null}
              <label>
                <input
                  type="checkbox"
                  checked={confirmCommit}
                  onChange={(event) => setConfirmCommit(event.target.checked)}
                />
                Commit Resources, status, tags, Resource Format changes, references, and import
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
                <Import size={16} aria-hidden="true" /> Commit reviewed Resources
              </button>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
