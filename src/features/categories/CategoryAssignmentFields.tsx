import type { CategoryFamilyId } from '@/domain/models/entities';

import type { CategorySelectionSnapshot } from './categoryAssignmentSelection';
import styles from './CategoryAssignmentFields.module.css';

export function CategoryAssignmentFields({
  snapshot,
  selectedSets,
  disabled = false,
  onToggle,
}: {
  snapshot: CategorySelectionSnapshot | undefined;
  selectedSets: Partial<Record<CategoryFamilyId, Set<string>>>;
  disabled?: boolean;
  onToggle: (familyId: CategoryFamilyId, valueId: string, checked: boolean) => void;
}) {
  if (!snapshot) {
    return (
      <section className={styles.panel} aria-label="Categories and labels">
        <p className={styles.loading} role="status">
          Loading categories…
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="Categories and labels">
      <div className={styles.heading}>
        <div>
          <p className="page-eyebrow">Organize</p>
          <h2>Categories &amp; Labels</h2>
        </div>
        <a className={styles.manageLink} href="#/categories">
          Manage values
        </a>
      </div>

      <div className={styles.familyGrid}>
        {snapshot.families.map(({ family, values }) => {
          const selected = selectedSets[family.id] ?? new Set<string>();
          return (
            <fieldset className={styles.family} key={family.id}>
              <legend>{family.label}</legend>
              <p>{family.description}</p>
              {values.length === 0 ? (
                <div className={styles.empty}>
                  <span>No values are available yet.</span>
                  <a href={`#/categories?family=${family.id}`}>Add {family.label}</a>
                </div>
              ) : (
                <div className={styles.options}>
                  {values.map((value) => {
                    const checked = selected.has(value.id);
                    const archived = value.lifecycleState === 'archived';
                    return (
                      <label className={styles.option} key={value.id} data-archived={archived}>
                        <input
                          type={family.selectionMode === 'single' ? 'radio' : 'checkbox'}
                          name={family.selectionMode === 'single' ? family.id : undefined}
                          checked={checked}
                          disabled={disabled || (archived && !checked)}
                          onChange={(event) =>
                            onToggle(family.id, value.id, event.currentTarget.checked)
                          }
                        />
                        <span className={styles.optionText}>
                          <span className={styles.optionName}>{value.name}</span>
                          {value.isDefault ? <span className={styles.badge}>Default</span> : null}
                          {archived ? <span className={styles.archivedBadge}>Archived</span> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      <p className={styles.help}>
        Archived values remain visible on existing records, but cannot be added to new records.
      </p>
    </section>
  );
}
