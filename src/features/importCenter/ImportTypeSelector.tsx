import {
  ClipboardCheck,
  FileText,
  Library,
  PackageOpen,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { buildImportCenterHref } from './importRouteState';
import type { ImportType } from './importTypes';
import styles from './ImportCenterShared.module.css';

const options: Array<{
  type: ImportType;
  label: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
}> = [
  {
    type: 'roster',
    label: 'Rosters',
    description: 'Add canonical Students to one Class or Group roster.',
    icon: Users,
    available: true,
  },
  {
    type: 'standards',
    label: 'Standards',
    description: 'Review framework rows, hierarchy, updates, and duplicates.',
    icon: FileText,
    available: true,
  },
  {
    type: 'activities',
    label: 'Activities',
    description: 'Create reviewed Library Activity records from structured sources.',
    icon: Library,
    available: true,
  },
  {
    type: 'resources',
    label: 'Resources',
    description: 'Create reviewed Library Resource records from metadata and references.',
    icon: PackageOpen,
    available: true,
  },
  {
    type: 'assessments',
    label: 'Assessments',
    description: 'Assessment import arrives in Phase 3I-0.5E.',
    icon: ClipboardCheck,
    available: false,
  },
];

export function ImportTypeSelector({ selectedType }: { selectedType?: ImportType }) {
  return (
    <nav className={`card ${styles.typeSelector}`} aria-label="Import types">
      {options.map((option) => {
        const Icon = option.icon;
        if (!option.available) {
          return (
            <div key={option.type} className={styles.typePlanned} aria-disabled="true">
              <span className={styles.typeIcon}>
                <Icon aria-hidden="true" size={18} />
              </span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
              <span className={styles.plannedBadge}>Planned</span>
            </div>
          );
        }
        return (
          <Link
            key={option.type}
            className={styles.typeLink}
            to={buildImportCenterHref(option.type)}
            aria-current={selectedType === option.type ? 'page' : undefined}
          >
            <span className={styles.typeIcon}>
              <Icon aria-hidden="true" size={18} />
            </span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </Link>
        );
      })}
    </nav>
  );
}
