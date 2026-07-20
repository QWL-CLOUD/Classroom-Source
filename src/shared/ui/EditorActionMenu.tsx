import { ChevronDown } from 'lucide-react';
import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import styles from './EditorActionMenu.module.css';

export function EditorActionMenu({
  children,
  label = 'More',
}: {
  children: ReactNode;
  label?: string;
}) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  function closeMenu(): void {
    if (rootRef.current) rootRef.current.open = false;
  }

  function closeAfterAction(event: MouseEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    const action = target.closest('button, a');
    if (!action) return;
    if (action instanceof HTMLButtonElement && action.disabled) return;
    closeMenu();
  }

  function closeOnEscape(event: KeyboardEvent<HTMLDetailsElement>): void {
    if (event.key !== 'Escape' || !rootRef.current?.open) return;
    event.preventDefault();
    closeMenu();
    summaryRef.current?.focus();
  }

  return (
    <details ref={rootRef} className={styles.root} onKeyDown={closeOnEscape}>
      <summary ref={summaryRef} className={`button ${styles.summary}`}>
        {label} <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div
        className={styles.menu}
        role="group"
        aria-label={`${label} editor actions`}
        onClick={closeAfterAction}
      >
        {children}
      </div>
    </details>
  );
}
