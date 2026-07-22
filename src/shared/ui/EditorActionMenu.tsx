import { ChevronDown } from 'lucide-react';
import { type MouseEvent, type ReactNode } from 'react';

import { useDismissibleDetailsMenu } from './useDismissibleDetailsMenu';
import styles from './EditorActionMenu.module.css';

export function EditorActionMenu({
  children,
  label = 'More',
}: {
  children: ReactNode;
  label?: string;
}) {
  const menu = useDismissibleDetailsMenu({ preferredPlacement: 'top' });

  function closeAfterAction(event: MouseEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    const action = target.closest('button, a');
    if (!action) return;
    if (action instanceof HTMLButtonElement && action.disabled) return;
    menu.close();
  }

  return (
    <details
      ref={menu.rootRef}
      className={styles.root}
      onToggle={menu.onToggle}
      onKeyDown={menu.onKeyDown}
    >
      <summary ref={menu.summaryRef} className={`button ${styles.summary}`}>
        {label} <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div
        ref={menu.panelRef}
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
