import { useCallback, useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from 'react';

import { resolveDetailsMenuLayout, type DetailsMenuPlacementPreference } from './detailsMenuLayout';

const detailsMenuOpenEvent = 'classroom:details-menu-open';

export function useDismissibleDetailsMenu<TPanel extends HTMLElement = HTMLDivElement>({
  preferredPlacement = 'auto',
}: {
  preferredPlacement?: DetailsMenuPlacementPreference;
} = {}) {
  const rootRef = useRef<HTMLDetailsElement | null>(null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<TPanel | null>(null);
  const placementFrameRef = useRef<number | null>(null);

  const close = useCallback((restoreFocus = false): void => {
    const root = rootRef.current;
    if (!root) return;
    root.open = false;
    if (restoreFocus) summaryRef.current?.focus();
  }, []);

  const updatePlacement = useCallback((): void => {
    const root = rootRef.current;
    const summary = summaryRef.current;
    const panel = panelRef.current;
    if (!root?.open || !summary || !panel) return;

    const triggerRect = summary.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const layout = resolveDetailsMenuLayout({
      triggerTop: triggerRect.top,
      triggerBottom: triggerRect.bottom,
      viewportHeight: window.innerHeight,
      panelHeight: Math.max(panelRect.height, panel.scrollHeight),
      preferredPlacement,
    });

    root.dataset.menuPlacement = layout.placement;
    root.style.setProperty('--details-menu-max-height', `${layout.maxHeight}px`);
  }, [preferredPlacement]);

  const onToggle = useCallback(
    (event: SyntheticEvent<HTMLDetailsElement>): void => {
      if (!event.currentTarget.open) return;
      window.dispatchEvent(
        new CustomEvent<HTMLDetailsElement>(detailsMenuOpenEvent, {
          detail: event.currentTarget,
        }),
      );

      // The native toggle event fires after the <details> element changes its
      // open state, so the panel can be measured immediately. A second pass on
      // the next frame catches font/layout settling without exposing one frame
      // of the default downward placement.
      updatePlacement();
      if (placementFrameRef.current !== null) {
        window.cancelAnimationFrame(placementFrameRef.current);
      }
      placementFrameRef.current = window.requestAnimationFrame(() => {
        placementFrameRef.current = null;
        updatePlacement();
      });
    },
    [updatePlacement],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDetailsElement>): void => {
      if (event.key !== 'Escape' || !event.currentTarget.open) return;
      event.preventDefault();
      close(true);
    },
    [close],
  );

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent): void {
      const root = rootRef.current;
      const target = event.target;
      if (!root?.open || !(target instanceof Node) || root.contains(target)) return;
      close();
    }

    function closeWhenAnotherMenuOpens(event: Event): void {
      const root = rootRef.current;
      if (!root?.open) return;
      const openedRoot = (event as CustomEvent<HTMLDetailsElement>).detail;
      if (openedRoot !== root) close();
    }

    function refreshOpenMenu(): void {
      if (rootRef.current?.open) updatePlacement();
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    window.addEventListener(detailsMenuOpenEvent, closeWhenAnotherMenuOpens);
    window.addEventListener('resize', refreshOpenMenu);
    window.addEventListener('scroll', refreshOpenMenu, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      window.removeEventListener(detailsMenuOpenEvent, closeWhenAnotherMenuOpens);
      window.removeEventListener('resize', refreshOpenMenu);
      window.removeEventListener('scroll', refreshOpenMenu, true);
      if (placementFrameRef.current !== null) {
        window.cancelAnimationFrame(placementFrameRef.current);
      }
    };
  }, [close, updatePlacement]);

  return {
    rootRef,
    summaryRef,
    panelRef,
    close,
    onToggle,
    onKeyDown,
  };
}
