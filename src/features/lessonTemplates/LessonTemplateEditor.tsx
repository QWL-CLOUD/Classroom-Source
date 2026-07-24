import { Save, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';

import type { LessonTemplate, LibraryCatalogItem } from '@/domain/models/entities';
import { CategoryAssignmentFields } from '@/features/categories/CategoryAssignmentFields';
import type { CategorySelectionMap } from '@/features/categories/categoryAssignmentSelection';
import { useCategorySelectionDraft } from '@/features/categories/useCategorySelectionDraft';
import { LessonFlowEditor } from '@/features/planning/LessonFlowEditor';

import {
  createLessonTemplateEditorValues,
  type LessonTemplateEditorValues,
} from './lessonTemplateModel';
import styles from './LessonTemplateEditor.module.css';

export function LessonTemplateEditor({
  template,
  libraryItems,
  busy,
  onCancel,
  onSubmit,
}: {
  template?: LessonTemplate;
  libraryItems: readonly LibraryCatalogItem[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (
    values: LessonTemplateEditorValues,
    categorySelections: CategorySelectionMap,
  ) => Promise<void>;
}) {
  const id = useId();
  const [values, setValues] = useState<LessonTemplateEditorValues>(() =>
    createLessonTemplateEditorValues(template),
  );
  const [error, setError] = useState<string | null>(null);
  const categoryDraft = useCategorySelectionDraft('lesson-template', template?.id);

  function update<K extends keyof LessonTemplateEditorValues>(
    key: K,
    value: LessonTemplateEditorValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit(values, categoryDraft.selections);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The lesson template could not be saved.');
    }
  }

  return (
    <form
      className={styles.editor}
      aria-label="Lesson template editor"
      onSubmit={(event) => void submit(event)}
    >
      <div className={styles.grid}>
        <label className={styles.fullWidth} htmlFor={`${id}-title`}>
          <span>Template title</span>
          <input
            id={`${id}-title`}
            value={values.title}
            maxLength={240}
            autoFocus
            required
            disabled={busy}
            onChange={(event) => update('title', event.target.value)}
            placeholder="For example, Mini-lesson with guided practice"
          />
        </label>

        <label className={styles.fullWidth} htmlFor={`${id}-description`}>
          <span>Description</span>
          <textarea
            id={`${id}-description`}
            value={values.description}
            maxLength={5000}
            rows={3}
            disabled={busy}
            onChange={(event) => update('description', event.target.value)}
            placeholder="When and why this reusable structure is useful."
          />
        </label>

        <label htmlFor={`${id}-default-plan-title`}>
          <span>Suggested plan title</span>
          <input
            id={`${id}-default-plan-title`}
            value={values.defaultPlanTitle}
            maxLength={240}
            disabled={busy}
            onChange={(event) => update('defaultPlanTitle', event.target.value)}
            placeholder="Optional"
          />
        </label>

        <label htmlFor={`${id}-subject`}>
          <span>Subject</span>
          <input
            id={`${id}-subject`}
            value={values.subject}
            maxLength={240}
            disabled={busy}
            onChange={(event) => update('subject', event.target.value)}
          />
        </label>

        <label htmlFor={`${id}-duration`}>
          <span>Duration in minutes</span>
          <input
            id={`${id}-duration`}
            inputMode="numeric"
            value={values.durationMinutes}
            disabled={busy}
            onChange={(event) => update('durationMinutes', event.target.value)}
            placeholder="Optional"
          />
        </label>
      </div>

      <CategoryAssignmentFields
        snapshot={categoryDraft.snapshot}
        selectedSets={categoryDraft.selectedSets}
        disabled={busy}
        onToggle={categoryDraft.toggle}
      />

      <LessonFlowEditor
        idPrefix="lesson-template"
        values={{
          learningTarget: values.learningTarget,
          notes: values.notes,
          libraryLinks: values.libraryLinks,
          lessonFlow: values.lessonFlow,
        }}
        disabled={busy}
        libraryItems={libraryItems}
        onChange={(change) =>
          setValues((current) => {
            const content = change({
              learningTarget: current.learningTarget,
              notes: current.notes,
              libraryLinks: current.libraryLinks ?? [],
              lessonFlow: current.lessonFlow,
            });
            return { ...current, ...content };
          })
        }
      />

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button className="button button-primary" type="submit" disabled={busy}>
          <Save size={17} aria-hidden="true" />
          {busy ? 'Saving…' : template ? 'Save template' : 'Create template'}
        </button>
        <button className="button" type="button" disabled={busy} onClick={onCancel}>
          <X size={17} aria-hidden="true" /> Cancel
        </button>
      </div>
    </form>
  );
}
