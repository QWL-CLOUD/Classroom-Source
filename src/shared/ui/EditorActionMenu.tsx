import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './EditorActionMenu.module.css';

export function EditorActionMenu({
  children,
  label = 'More',
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <details className={styles.root}>
      <summary className={`button ${styles.summary}`}>
        {label} <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div className={styles.menu} aria-label={`${label} editor actions`}>
        {children}
      </div>
    </details>
  );
}
