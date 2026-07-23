import { Save, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';

import type { LibraryCatalogItem, LibraryCatalogType } from '@/domain/models/entities';
import { CategoryAssignmentFields } from '@/features/categories/CategoryAssignmentFields';
import type { CategorySelectionMap } from '@/features/categories/categoryAssignmentSelection';
import { useCategorySelectionDraft } from '@/features/categories/useCategorySelectionDraft';

import { parseLibraryCatalogTags } from './libraryCatalogReadModel';
import styles from './LibraryCatalogEditor.module.css';

export interface LibraryCatalogEditorSubmission {
  catalogType: LibraryCatalogType;
  title: string;
  description: string;
  tags: string[];
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
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [tags, setTags] = useState(item?.tags.join(', ') ?? '');
  const [error, setError] = useState<string | null>(null);
  const categoryDraft = useCategorySelectionDraft('library-item', item?.id);

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
