export type AppearanceMode = 'light' | 'dark' | 'system';

export type ResolvedAppearance = Exclude<AppearanceMode, 'system'>;

export type ThemeId = 'default' | 'energy' | 'calm';

export type SemanticColors = {
  background: string;
  foreground: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  success: string;
  warning: string;
  danger: string;
  focus: string;
  pressed: string;
  disabled: string;
  disabledForeground: string;
};

export type ThemeTokens = {
  id: ThemeId;
  appearance: ResolvedAppearance;
  colors: SemanticColors;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
  };
  typography: {
    body: number;
    title: number;
    caption: number;
  };
};

const foundation = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 6,
    md: 8,
    lg: 12,
  },
  typography: {
    body: 16,
    title: 24,
    caption: 13,
  },
} satisfies Pick<ThemeTokens, 'spacing' | 'radius' | 'typography'>;

export const themes: Record<
  ThemeId,
  Record<ResolvedAppearance, ThemeTokens>
> = {
  default: {
    light: {
      id: 'default',
      appearance: 'light',
      ...foundation,
      colors: {
        background: '#F8FAFC',
        foreground: '#0F172A',
        surface: '#FFFFFF',
        surfaceRaised: '#F1F5F9',
        border: '#CBD5E1',
        primary: '#2563EB',
        primaryForeground: '#FFFFFF',
        secondary: '#0F766E',
        secondaryForeground: '#FFFFFF',
        muted: '#E2E8F0',
        mutedForeground: '#475569',
        success: '#15803D',
        warning: '#B45309',
        danger: '#B91C1C',
        focus: '#7C3AED',
        pressed: '#DBEAFE',
        disabled: '#E5E7EB',
        disabledForeground: '#6B7280',
      },
    },
    dark: {
      id: 'default',
      appearance: 'dark',
      ...foundation,
      colors: {
        background: '#020617',
        foreground: '#F8FAFC',
        surface: '#0F172A',
        surfaceRaised: '#1E293B',
        border: '#334155',
        primary: '#93C5FD',
        primaryForeground: '#082F49',
        secondary: '#5EEAD4',
        secondaryForeground: '#042F2E',
        muted: '#1E293B',
        mutedForeground: '#CBD5E1',
        success: '#86EFAC',
        warning: '#FCD34D',
        danger: '#FCA5A5',
        focus: '#C4B5FD',
        pressed: '#1D4ED8',
        disabled: '#334155',
        disabledForeground: '#94A3B8',
      },
    },
  },
  energy: {
    light: {
      id: 'energy',
      appearance: 'light',
      ...foundation,
      colors: {
        background: '#FFF7ED',
        foreground: '#1C1917',
        surface: '#FFFFFF',
        surfaceRaised: '#FFEDD5',
        border: '#FDBA74',
        primary: '#C2410C',
        primaryForeground: '#FFFFFF',
        secondary: '#7C2D12',
        secondaryForeground: '#FFFFFF',
        muted: '#FED7AA',
        mutedForeground: '#7C2D12',
        success: '#166534',
        warning: '#A16207',
        danger: '#B91C1C',
        focus: '#7C3AED',
        pressed: '#FED7AA',
        disabled: '#E7E5E4',
        disabledForeground: '#78716C',
      },
    },
    dark: {
      id: 'energy',
      appearance: 'dark',
      ...foundation,
      colors: {
        background: '#1C1917',
        foreground: '#FFF7ED',
        surface: '#292524',
        surfaceRaised: '#431407',
        border: '#7C2D12',
        primary: '#FDBA74',
        primaryForeground: '#431407',
        secondary: '#FDE68A',
        secondaryForeground: '#422006',
        muted: '#44403C',
        mutedForeground: '#FED7AA',
        success: '#86EFAC',
        warning: '#FDE68A',
        danger: '#FCA5A5',
        focus: '#C4B5FD',
        pressed: '#7C2D12',
        disabled: '#44403C',
        disabledForeground: '#A8A29E',
      },
    },
  },
  calm: {
    light: {
      id: 'calm',
      appearance: 'light',
      ...foundation,
      colors: {
        background: '#F0FDFA',
        foreground: '#042F2E',
        surface: '#FFFFFF',
        surfaceRaised: '#CCFBF1',
        border: '#5EEAD4',
        primary: '#0F766E',
        primaryForeground: '#FFFFFF',
        secondary: '#155E75',
        secondaryForeground: '#FFFFFF',
        muted: '#CCFBF1',
        mutedForeground: '#115E59',
        success: '#15803D',
        warning: '#A16207',
        danger: '#B91C1C',
        focus: '#2563EB',
        pressed: '#99F6E4',
        disabled: '#E2E8F0',
        disabledForeground: '#64748B',
      },
    },
    dark: {
      id: 'calm',
      appearance: 'dark',
      ...foundation,
      colors: {
        background: '#042F2E',
        foreground: '#F0FDFA',
        surface: '#134E4A',
        surfaceRaised: '#115E59',
        border: '#0F766E',
        primary: '#5EEAD4',
        primaryForeground: '#042F2E',
        secondary: '#67E8F9',
        secondaryForeground: '#083344',
        muted: '#115E59',
        mutedForeground: '#CCFBF1',
        success: '#86EFAC',
        warning: '#FDE68A',
        danger: '#FCA5A5',
        focus: '#93C5FD',
        pressed: '#0F766E',
        disabled: '#334155',
        disabledForeground: '#94A3B8',
      },
    },
  },
};

export const themeIds = Object.keys(themes) as ThemeId[];

export const appearanceModes: AppearanceMode[] = ['light', 'dark', 'system'];
