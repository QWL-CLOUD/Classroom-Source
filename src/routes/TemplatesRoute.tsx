import { Archive, LayoutTemplate, Pencil, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { classroomDb } from '@/data/db/ClassroomDatabase';
import {
  categoryAssignmentSchema,
  categoryValueSchema,
  lessonTemplateSchema,
  libraryCatalogItemSchema,
  type LessonTemplateStatus,
} from '@/domain/models/entities';
import { LessonFlowPreview } from '@/features/planning/LessonFlowEditor';
import { LessonTemplateEditor } from '@/features/lessonTemplates/LessonTemplateEditor';
import { lessonTemplateMutationService } from '@/features/lessonTemplates/lessonTemplateMutationService';
import {
  buildLessonTemplateViews,
  filterLessonTemplates,
  lessonTemplateStatusLabels,
  type LessonTemplateView,
} from '@/features/lessonTemplates/lessonTemplateReadModel';

import styles from './TemplatesRoute.module.css';

function labels(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : 'None';
}

export function TemplatesRoute() {
  const data = useLiveQuery(async () => {
    const [templateValues, assignmentValues, categoryValuesRaw, libraryValues] = await Promise.all([
      classroomDb.lessonTemplates.toArray(),
      classroomDb.categoryAssignments.where('entityType').equals('lesson-template').toArray(),
      classroomDb.categoryValues.toArray(),
      classroomDb.libraryItems.toArray(),
    ]);
    const templates = templateValues.map((value) => lessonTemplateSchema.parse(value));
    const assignments = assignmentValues.map((value) => categoryAssignmentSchema.parse(value));
    const categoryValues = categoryValuesRaw.map((value) => categoryValueSchema.parse(value));
    const libraryItems = libraryValues.map((value) => libraryCatalogItemSchema.parse(value));
    return {
      templates,
      views: buildLessonTemplateViews(templates, assignments, categoryValues),
      libraryItems,
      templateFormats: categoryValues
        .filter(
          (value) => value.familyId === 'template-format' && value.lifecycleState === 'active',
        )
        .sort(
          (first, second) =>
            first.sortOrder - second.sortOrder ||
            first.name.localeCompare(second.name, 'en', { sensitivity: 'base' }),
        ),
    };
  }, []);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | LessonTemplateStatus>('active');
  const [templateFormatId, setTemplateFormatId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      filterLessonTemplates(data?.views ?? [], {
        query,
        status,
        templateFormatId,
      }),
    [data?.views, query, status, templateFormatId],
  );
  const selected =
    (data?.views ?? []).find((template) => template.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (creating) return;
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [creating, selected, selectedId]);

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The lesson template action could not be completed.',
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  const filtersActive = query.trim() || status !== 'active' || templateFormatId;

  return (
    <div className={`page-shell ${styles.page}`}>
      <header className={styles.pageHeader}>
        <div>
          <p className="page-eyebrow">Reusable planning structures</p>
          <h1>Lesson Templates</h1>
          <p>
            Build reusable Plan and Lesson Flow structures without tying them to a learner context,
            schedule, or lesson series.
          </p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            setCreating(true);
            setEditing(false);
            setError(null);
          }}
        >
          <Plus size={17} aria-hidden="true" /> New template
        </button>
      </header>

      <section className={`card ${styles.filters}`} aria-label="Lesson template filters">
        <label className={styles.searchField}>
          <span>Search</span>
          <div>
            <Search size={17} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, subjects, targets, and steps"
            />
          </div>
        </label>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as 'all' | LessonTemplateStatus)}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All statuses</option>
          </select>
        </label>
        <label>
          <span>Template Format</span>
          <select
            value={templateFormatId}
            onChange={(event) => setTemplateFormatId(event.target.value)}
          >
            <option value="">All formats</option>
            {(data?.templateFormats ?? []).map((format) => (
              <option key={format.id} value={format.id}>
                {format.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button-quiet"
          type="button"
          disabled={!filtersActive}
          onClick={() => {
            setQuery('');
            setStatus('active');
            setTemplateFormatId('');
          }}
        >
          <X size={15} aria-hidden="true" /> Clear filters
        </button>
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {creating ? (
        <section className={`card ${styles.editorPanel}`} aria-label="Create lesson template">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Reusable source record</p>
              <h2>New lesson template</h2>
            </div>
          </div>
          <LessonTemplateEditor
            busy={busy}
            libraryItems={data?.libraryItems ?? []}
            onCancel={() => setCreating(false)}
            onSubmit={async (values, categorySelections) => {
              const created = await run(() =>
                lessonTemplateMutationService.create(values, categorySelections),
              );
              if (!created) return;
              setSelectedId(created.id);
              setCreating(false);
            }}
          />
        </section>
      ) : null}

      <div className={styles.workspace}>
        <section className={`card ${styles.directory}`} aria-label="Lesson template results">
          <div className={styles.sectionHeading}>
            <div>
              <p className="page-eyebrow">Templates</p>
              <h2>{visible.length} records</h2>
            </div>
          </div>
          {data === undefined ? (
            <p className={styles.message}>Loading lesson templates…</p>
          ) : visible.length === 0 ? (
            <div className={styles.empty} role="status">
              <LayoutTemplate size={28} aria-hidden="true" />
              <strong>No matching templates</strong>
              <span>Adjust the filters or create the first reusable structure.</span>
            </div>
          ) : (
            <ul className={styles.list}>
              {visible.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    className={styles.itemButton}
                    data-selected={selected?.id === template.id}
                    onClick={() => {
                      setSelectedId(template.id);
                      setEditing(false);
                    }}
                  >
                    <span className={styles.itemIcon}>
                      <LayoutTemplate size={18} aria-hidden="true" />
                    </span>
                    <span className={styles.itemText}>
                      <strong>{template.title}</strong>
                      <small>
                        {template.templateFormatLabel ?? 'Unformatted'}
                        {template.subject ? ` · ${template.subject}` : ''}
                      </small>
                    </span>
                    <span className={styles.status} data-status={template.status}>
                      {lessonTemplateStatusLabels[template.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`card ${styles.details}`} aria-label="Lesson template details">
          {!selected ? (
            <div className={styles.empty} role="status">
              <LayoutTemplate size={28} aria-hidden="true" />
              <strong>Select a lesson template</strong>
              <span>Template details and actions will appear here.</span>
            </div>
          ) : editing ? (
            <LessonTemplateEditor
              key={selected.id}
              template={selected}
              busy={busy}
              libraryItems={data?.libraryItems ?? []}
              onCancel={() => setEditing(false)}
              onSubmit={async (values, categorySelections) => {
                const updated = await run(() =>
                  lessonTemplateMutationService.update(selected.id, values, categorySelections),
                );
                if (updated) setEditing(false);
              }}
            />
          ) : (
            <TemplateDetails
              template={selected}
              libraryItems={data?.libraryItems ?? []}
              busy={busy}
              onEdit={() => setEditing(true)}
              onArchive={() => void run(() => lessonTemplateMutationService.archive(selected.id))}
              onRestore={() => void run(() => lessonTemplateMutationService.restore(selected.id))}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function TemplateDetails({
  template,
  libraryItems,
  busy,
  onEdit,
  onArchive,
  onRestore,
}: {
  template: LessonTemplateView;
  libraryItems: Parameters<typeof LessonFlowPreview>[0]['libraryItems'];
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <article
      className={styles.detailContent}
      aria-label={`${template.title} lesson template details`}
    >
      <header className={styles.detailHeader}>
        <div>
          <p className="page-eyebrow">Lesson template</p>
          <h2>{template.title}</h2>
          <span className={styles.status} data-status={template.status}>
            {lessonTemplateStatusLabels[template.status]}
          </span>
        </div>
        <div className={styles.actions}>
          <button className="button" type="button" disabled={busy} onClick={onEdit}>
            <Pencil size={16} aria-hidden="true" /> Edit
          </button>
          {template.status === 'active' ? (
            <button className="button" type="button" disabled={busy} onClick={onArchive}>
              <Archive size={16} aria-hidden="true" /> Archive
            </button>
          ) : (
            <button className="button" type="button" disabled={busy} onClick={onRestore}>
              <RotateCcw size={16} aria-hidden="true" /> Restore
            </button>
          )}
        </div>
      </header>

      {template.description ? <p className={styles.description}>{template.description}</p> : null}

      <dl className={styles.metadata}>
        <div>
          <dt>Suggested plan title</dt>
          <dd>{template.defaultPlanTitle ?? 'Keep the current plan title'}</dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>{template.subject ?? 'Not specified'}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{template.durationMinutes ? `${template.durationMinutes} min` : 'Not specified'}</dd>
        </div>
        <div>
          <dt>Template Format</dt>
          <dd>{template.templateFormatLabel ?? 'None'}</dd>
        </div>
        <div>
          <dt>Focus</dt>
          <dd>{labels(template.focusLabels)}</dd>
        </div>
        <div>
          <dt>Purpose</dt>
          <dd>{labels(template.purposeLabels)}</dd>
        </div>
        <div>
          <dt>Theme</dt>
          <dd>{labels(template.themeLabels)}</dd>
        </div>
      </dl>

      <LessonFlowPreview
        content={{
          learningTarget: template.learningTarget,
          notes: template.notes,
          libraryLinks: template.libraryLinks ?? [],
          lessonFlow: template.lessonFlow,
        }}
        libraryItems={libraryItems ?? []}
      />

      <p className={styles.independence}>
        Applying this template copies its current structure into a Plan. Later Plan edits do not
        change this source record, and later template edits do not rewrite existing Plans.
      </p>
    </article>
  );
}
