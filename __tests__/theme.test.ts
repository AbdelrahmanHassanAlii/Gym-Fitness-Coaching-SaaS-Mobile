import { describe, expect, it } from '@jest/globals';

import { appearanceModes, themeIds, themes } from '../src/theme/tokens';

describe('theme foundation', () => {
  it('defines the expected appearance modes and semantic theme IDs', () => {
    expect(appearanceModes).toEqual(['light', 'dark', 'system']);
    expect(themeIds).toEqual(['default', 'energy', 'calm']);
  });

  it('provides light and dark semantic status colors for every theme', () => {
    for (const themeId of themeIds) {
      for (const appearance of ['light', 'dark'] as const) {
        const theme = themes[themeId][appearance];

        expect(theme.colors.success).toBeTruthy();
        expect(theme.colors.warning).toBeTruthy();
        expect(theme.colors.danger).toBeTruthy();
        expect(theme.colors.background).not.toBe(theme.colors.foreground);
      }
    }
  });
});
