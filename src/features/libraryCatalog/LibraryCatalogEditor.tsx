import { Save, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';

import {
  libraryCatalogTypedFieldsSchema,
  type LibraryActivityGrouping,
  type LibraryAssessmentKind,
  type LibraryCatalogItem,
  type LibraryCatalogType,
  type LibraryCatalogTypedFields,
} from '@/domain/models/entities';
import { CategoryAssignmentFields } from '@/features/categories/CategoryAssignmentFields';
import type { CategorySelectionMap } from '@/features/categories/categoryAssignmentSelection';
import { useCategorySelectionDraft } from '@/features/categories/useCategorySelectionDraft';
import {
  libraryActivityGroupingLabels,
  libraryAssessmentKindLabels,
  typedFieldsForCatalogType,
} from '@/features/libraryCatalog/libraryCatalogTypedFields';

import { parseLibraryCatalogTags } from './libraryCatalogReadModel';
import styles from './LibraryCatalogEditor.module.css';

export interface LibraryCatalogEditorSubmission {
  catalogType: LibraryCatalogType;
  title: string;
  description: string;
  tags: string[];
  typedFields?: LibraryCatalogTypedFields;
}

function optionalText(value: string): string | undefined {
  return value.trim() || undefined;
}

export function LibraryCatalogEditor({
  item,
  busy,
  onCancel,
  onSubmit,
}: {
  item?: LibraryCatalogItem;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (
    values: LibraryCatalogEditorSubmission,
    categorySelections: CategorySelectionMap,
  ) => Promise<void>;
}) {
  const id = useId();
  const [catalogType, setCatalogType] = useState<LibraryCatalogType>(
    item?.catalogType ?? 'activity',
  );
  const initialTypedFields = typedFieldsForCatalogType(catalogType, item?.typedFields);
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [tags, setTags] = useState(item?.tags.join(', ') ?? '');
  const [activityGrouping, setActivityGrouping] = useState<LibraryActivityGrouping>(
    initialTypedFields?.catalogType === 'activity' ? initialTypedFields.grouping : 'flexible',
  );
  const [activityMinutes, setActivityMinutes] = useState(
    initialTypedFields?.catalogType === 'activity'
      ? (initialTypedFields.estimatedMinutes?.toString() ?? '')
      : '',
  );
  const [activityDirections, setActivityDirections] = useState(
    initialTypedFields?.catalogType === 'activity' ? (initialTypedFields.directions ?? '') : '',
  );
  const [resourceLocation, setResourceLocation] = useState(
    initialTypedFields?.catalogType === 'resource' ? (initialTypedFields.sourceLocation ?? '') : '',
  );
  const [resourceUsageNotes, setResourceUsageNotes] = useState(
    initialTypedFields?.catalogType === 'resource' ? (initialTypedFields.usageNotes ?? '') : '',
  );
  const [assessmentKind, setAssessmentKind] = useState<LibraryAssessmentKind>(
    initialTypedFields?.catalogType === 'assessment'
      ? initialTypedFields.assessmentKind
      : 'formative',
  );
  const [assessmentPrompt, setAssessmentPrompt] = useState(
    initialTypedFields?.catalogType === 'assessment'
      ? (initialTypedFields.studentPrompt ?? '')
      : '',
  );
  const [assessmentEvidence, setAssessmentEvidence] = useState(
    initialTypedFields?.catalogType === 'assessment'
      ? (initialTypedFields.evidenceToCollect ?? '')
      : '',
  );
  const [error, setError] = useState<string | null>(null);
  const categoryDraft = useCategorySelectionDraft('library-item', item?.id);

  function buildTypedFields(): LibraryCatalogTypedFields | undefined {
    if (catalogType === 'activity') {
      const estimatedMinutes = activityMinutes.trim() ? Number(activityMinutes) : undefined;
      return libraryCatalogTypedFieldsSchema.parse({
        catalogType: 'activity',
        grouping: activityGrouping,
        estimatedMinutes,
        directions: optionalText(activityDirections),
      });
    }
    if (catalogType === 'resource') {
      return libraryCatalogTypedFieldsSchema.parse({
        catalogType: 'resource',
        sourceLocation: optionalText(resourceLocation),
        usageNotes: optionalText(resourceUsageNotes),
      });
    }
    if (catalogType === 'assessment') {
      return libraryCatalogTypedFieldsSchema.parse({
        catalogType: 'assessment',
        assessmentKind,
        studentPrompt: optionalText(assessmentPrompt),
        evidenceToCollect: optionalText(assessmentEvidence),
      });
    }
    return undefined;
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit(
        {
          catalogType,
          title,
          description,
          tags: parseLibraryCatalogTags(tags),
          typedFields: buildTypedFields(),
        },
        categoryDraft.selections,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Library item could not be saved.');
    }
  }

  return (
    <form
      className={styles.editor}
      aria-label="Library catalog editor"
      onSubmit={(event) => void submit(event)}
    >
      <div className={styles.grid}>
        <label htmlFor={`${id}-type`}>
          <span>Catalog type</span>
          <select
            id={`${id}-type`}
            value={catalogType}
            disabled={Boolean(item) || busy}
            onChange={(event) => setCatalogType(event.target.value as LibraryCatalogType)}
          >
            <option value="activity">Activity</option>
            <option value="resource">Resource</option>
            <option value="assessment">Assessment</option>
            <option value="standard">Standard</option>
          </select>
        </label>

        <label htmlFor={`${id}-title`}>
          <span>Title</span>
          <input
            id={`${id}-title`}
            value={title}
            maxLength={240}
            autoFocus
            required
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
      </div>

      <label htmlFor={`${id}-description`}>
        <span>Description</span>
        <textarea
          id={`${id}-description`}
          rows={5}
          value={description}
          maxLength={5000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A concise description of what this item is and how it is used."
        />
      </label>

      {catalogType === 'activity' ? (
        <fieldset className={styles.typeFields}>
          <legend>Activity workflow</legend>
          <div className={styles.grid}>
            <label htmlFor={`${id}-activity-grouping`}>
              <span>Grouping</span>
              <select
                id={`${id}-activity-grouping`}
                value={activityGrouping}
                disabled={busy}
                onChange={(event) =>
                  setActivityGrouping(event.target.value as LibraryActivityGrouping)
                }
              >
                {(Object.keys(libraryActivityGroupingLabels) as LibraryActivityGrouping[]).map(
                  (value) => (
                    <option key={value} value={value}>
                      {libraryActivityGroupingLabels[value]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label htmlFor={`${id}-activity-minutes`}>
              <span>Estimated minutes</span>
              <input
                id={`${id}-activity-minutes`}
                inputMode="numeric"
                value={activityMinutes}
                disabled={busy}
                onChange={(event) => setActivityMinutes(event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <label htmlFor={`${id}-activity-directions`}>
            <span>Reusable directions</span>
            <textarea
              id={`${id}-activity-directions`}
              rows={4}
              value={activityDirections}
              maxLength={5000}
              disabled={busy}
              onChange={(event) => setActivityDirections(event.target.value)}
              placeholder="Core directions that can be reused across lessons."
            />
          </label>
        </fieldset>
      ) : null}

      {catalogType === 'resource' ? (
        <fieldset className={styles.typeFields}>
          <legend>Resource workflow</legend>
          <label htmlFor={`${id}-resource-location`}>
            <span>Source or location</span>
            <input
              id={`${id}-resource-location`}
              value={resourceLocation}
              maxLength={2000}
              disabled={busy}
              onChange={(event) => setResourceLocation(event.target.value)}
              placeholder="URL, binder location, book reference, or shared-drive path"
            />
          </label>
          <label htmlFor={`${id}-resource-usage-notes`}>
            <span>Usage notes</span>
            <textarea
              id={`${id}-resource-usage-notes`}
              rows={4}
              value={resourceUsageNotes}
              maxLength={5000}
              disabled={busy}
              onChange={(event) => setResourceUsageNotes(event.target.value)}
              placeholder="Preparation, access, printing, or classroom-use notes."
            />
          </label>
        </fieldset>
      ) : null}

      {catalogType === 'assessment' ? (
        <fieldset className={styles.typeFields}>
          <legend>Assessment workflow</legend>
          <label htmlFor={`${id}-assessment-kind`}>
            <span>Assessment kind</span>
            <select
              id={`${id}-assessment-kind`}
              value={assessmentKind}
              disabled={busy}
              onChange={(event) => setAssessmentKind(event.target.value as LibraryAssessmentKind)}
            >
              {(Object.keys(libraryAssessmentKindLabels) as LibraryAssessmentKind[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {libraryAssessmentKindLabels[value]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label htmlFor={`${id}-assessment-prompt`}>
            <span>Student prompt</span>
            <textarea
              id={`${id}-assessment-prompt`}
              rows={4}
              value={assessmentPrompt}
              maxLength={5000}
              disabled={busy}
              onChange={(event) => setAssessmentPrompt(event.target.value)}
              placeholder="Question, task, or response prompt."
            />
          </label>
          <label htmlFor={`${id}-assessment-evidence`}>
            <span>Evidence to collect</span>
            <textarea
              id={`${id}-assessment-evidence`}
              rows={4}
              value={assessmentEvidence}
              maxLength={5000}
              disabled={busy}
              onChange={(event) => setAssessmentEvidence(event.target.value)}
              placeholder="What student evidence should the teacher capture?"
            />
          </label>
        </fieldset>
      ) : null}

      <label htmlFor={`${id}-tags`}>
        <span>Tags</span>
        <input
          id={`${id}-tags`}
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="Reading, speaking, Unit 1"
        />
        <small>Separate reusable search tags with commas.</small>
      </label>

      {catalogType === 'resource' ? (
        <CategoryAssignmentFields
          snapshot={categoryDraft.snapshot}
          selectedSets={categoryDraft.selectedSets}
          disabled={busy}
          onToggle={categoryDraft.toggle}
        />
      ) : null}

      {catalogType === 'standard' ? (
        <p className={styles.phaseNote}>
          Standards keep stable Catalog identities in this phase. Import, alignment, and coverage
          remain reserved for Phase 3F.
        </p>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button className="button button-primary" type="submit" disabled={busy || !title.trim()}>
          <Save size={16} aria-hidden="true" />
          {busy ? 'Saving…' : item ? 'Save item' : 'Create item'}
        </button>
        <button className="button button-quiet" type="button" disabled={busy} onClick={onCancel}>
          <X size={16} aria-hidden="true" /> Cancel
        </button>
      </div>
    </form>
  );
}
