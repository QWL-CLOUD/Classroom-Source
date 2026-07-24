import { LayoutTemplate, WandSparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { LessonTemplate, LessonTemplateApplication } from '@/domain/models/entities';

import styles from './LessonTemplateApplyPanel.module.css';

function formatSourceDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}

export function LessonTemplateApplyPanel({
  templates,
  currentApplication,
  disabled = false,
  onApply,
}: {
  templates: readonly LessonTemplate[];
  currentApplication?: LessonTemplateApplication;
  disabled?: boolean;
  onApply: (template: LessonTemplate) => void;
}) {
  const activeTemplates = useMemo(
    () =>
      templates
        .filter((template) => template.status === 'active')
        .sort(
          (first, second) =>
            first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }) ||
            first.id.localeCompare(second.id),
        ),
    [templates],
  );
  const [selectedId, setSelectedId] = useState(activeTemplates[0]?.id ?? '');

  useEffect(() => {
    if (activeTemplates.length === 0) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!activeTemplates.some((template) => template.id === selectedId)) {
      setSelectedId(activeTemplates[0]!.id);
    }
  }, [activeTemplates, selectedId]);

  const selected = activeTemplates.find((template) => template.id === selectedId);

  return (
    <section className={styles.panel} aria-label="Apply lesson template">
      <div className={styles.heading}>
        <div className={styles.icon}>
          <LayoutTemplate size={20} aria-hidden="true" />
        </div>
        <div>
          <p className="page-eyebrow">Reusable structure</p>
          <h2>Lesson template</h2>
          <p>
            Applying a template replaces this draft’s lesson content and flow. Context, series,
            schedule, and workflow state stay unchanged.
          </p>
        </div>
        <a href="#/templates">Manage templates</a>
      </div>

      {currentApplication ? (
        <p className={styles.source} role="status">
          Applied from <strong>{currentApplication.templateTitle}</strong> · source version{' '}
          {formatSourceDate(currentApplication.sourceUpdatedAt)}
        </p>
      ) : null}

      {activeTemplates.length === 0 ? (
        <div className={styles.empty}>
          <span>No active templates are available.</span>
          <a href="#/templates">Create the first template</a>
        </div>
      ) : (
        <div className={styles.controls}>
          <label>
            <span>Template</span>
            <select
              value={selectedId}
              disabled={disabled}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {activeTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            type="button"
            disabled={disabled || !selected}
            onClick={() => {
              if (selected) onApply(selected);
            }}
          >
            <WandSparkles size={17} aria-hidden="true" /> Apply to draft
          </button>
        </div>
      )}

      {selected ? (
        <div className={styles.preview}>
          <strong>{selected.title}</strong>
          <span>
            {selected.lessonFlow.length} {selected.lessonFlow.length === 1 ? 'step' : 'steps'}
            {selected.durationMinutes ? ` · ${selected.durationMinutes} min` : ''}
            {selected.subject ? ` · ${selected.subject}` : ''}
          </span>
          {selected.description ? <p>{selected.description}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
