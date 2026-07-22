export type DetailsMenuPlacement = 'top' | 'bottom';
export type DetailsMenuPlacementPreference = DetailsMenuPlacement | 'auto';

export interface DetailsMenuLayoutInput {
  triggerTop: number;
  triggerBottom: number;
  viewportHeight: number;
  panelHeight: number;
  preferredPlacement?: DetailsMenuPlacementPreference;
  viewportPadding?: number;
  gap?: number;
  minimumUsefulHeight?: number;
}

export interface DetailsMenuLayout {
  placement: DetailsMenuPlacement;
  maxHeight: number;
}

export function resolveDetailsMenuLayout({
  triggerTop,
  triggerBottom,
  viewportHeight,
  panelHeight,
  preferredPlacement = 'auto',
  viewportPadding = 12,
  gap = 8,
  minimumUsefulHeight = 120,
}: DetailsMenuLayoutInput): DetailsMenuLayout {
  const spaceAbove = Math.max(0, triggerTop - viewportPadding);
  const spaceBelow = Math.max(0, viewportHeight - triggerBottom - viewportPadding);
  const desiredHeight = Math.max(0, panelHeight);
  const usefulHeight = Math.min(desiredHeight, minimumUsefulHeight);

  let placement: DetailsMenuPlacement;
  if (preferredPlacement === 'top') {
    placement = spaceAbove >= usefulHeight || spaceAbove >= spaceBelow ? 'top' : 'bottom';
  } else if (preferredPlacement === 'bottom') {
    placement = spaceBelow >= usefulHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';
  } else {
    placement = spaceBelow >= desiredHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';
  }

  const availableSpace = placement === 'bottom' ? spaceBelow : spaceAbove;
  return {
    placement,
    maxHeight: Math.max(56, Math.floor(availableSpace - gap)),
  };
}
