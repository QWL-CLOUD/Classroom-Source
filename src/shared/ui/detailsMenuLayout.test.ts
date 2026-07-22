import { describe, expect, it } from 'vitest';

import { resolveDetailsMenuLayout } from './detailsMenuLayout';

describe('resolveDetailsMenuLayout', () => {
  it('keeps a preferred bottom menu below when enough room is available', () => {
    expect(
      resolveDetailsMenuLayout({
        triggerTop: 80,
        triggerBottom: 120,
        viewportHeight: 700,
        panelHeight: 240,
        preferredPlacement: 'bottom',
      }),
    ).toEqual({ placement: 'bottom', maxHeight: 560 });
  });

  it('moves a menu above when the lower viewport cannot hold a useful panel', () => {
    expect(
      resolveDetailsMenuLayout({
        triggerTop: 520,
        triggerBottom: 560,
        viewportHeight: 620,
        panelHeight: 220,
        preferredPlacement: 'bottom',
      }),
    ).toEqual({ placement: 'top', maxHeight: 500 });
  });

  it('chooses the larger side automatically and keeps a viewport-bounded maximum height', () => {
    expect(
      resolveDetailsMenuLayout({
        triggerTop: 250,
        triggerBottom: 290,
        viewportHeight: 360,
        panelHeight: 300,
      }),
    ).toEqual({ placement: 'top', maxHeight: 230 });
  });
});
