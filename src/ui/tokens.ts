export type CssVarName = `--${string}`;
export type CssVarRef = `var(${CssVarName})`;

export function cssVar(name: CssVarName): CssVarRef {
  return `var(${name})` as CssVarRef;
}

export const primitiveTokens = {
  colorSlate950: '--primitive-color-slate-950',
  colorSlate900: '--primitive-color-slate-900',
  colorSlate850: '--primitive-color-slate-850',
  colorSlate800: '--primitive-color-slate-800',
  colorSlate100: '--primitive-color-slate-100',
  colorSlate200: '--primitive-color-slate-200',
  colorGray50: '--primitive-color-gray-50',
  colorGray100: '--primitive-color-gray-100',
  colorGray900: '--primitive-color-gray-900',
  colorGreen500: '--primitive-color-green-500',
  colorCyan300: '--primitive-color-cyan-300',
  colorBlue500: '--primitive-color-blue-500',
  colorRed400: '--primitive-color-red-400',
  colorRed600: '--primitive-color-red-600',
  space0: '--primitive-space-0',
  space1: '--primitive-space-1',
  space2: '--primitive-space-2',
  space3: '--primitive-space-3',
  space4: '--primitive-space-4',
  space5: '--primitive-space-5',
  space6: '--primitive-space-6',
  space7: '--primitive-space-7',
  space8: '--primitive-space-8',
  space9: '--primitive-space-9',
  space10: '--primitive-space-10',
  radius10: '--primitive-radius-10',
  radius12: '--primitive-radius-12',
  radius14: '--primitive-radius-14',
  radius999: '--primitive-radius-999',
  shadowDark: '--primitive-shadow-dark',
  shadowLight: '--primitive-shadow-light',
  shadowPopover: '--primitive-shadow-popover',
  fontSans: '--primitive-font-sans',
  fontSize12: '--primitive-font-size-12',
  fontSize13: '--primitive-font-size-13',
  fontSize14: '--primitive-font-size-14',
  fontSize16: '--primitive-font-size-16',
} as const satisfies Record<string, CssVarName>;

export type PrimitiveToken = (typeof primitiveTokens)[keyof typeof primitiveTokens];

export const semanticTokens = {
  colorBg: '--color-bg',
  colorSurface: '--color-surface',
  colorSurface2: '--color-surface-2',
  colorBorder: '--color-border',
  colorBorderSubtle: '--color-border-subtle',
  colorText: '--color-text',
  colorTextMuted: '--color-text-muted',
  colorPrimary: '--color-primary',
  colorPrimary2: '--color-primary-2',
  colorDanger: '--color-danger',
  shadowElevation: '--shadow-elevation',
  focusRing: '--focus-ring',
  focusRingOffset: '--focus-ring-offset',
  layoutPopupWidth: '--layout-popup-width',
  layoutPopupHeight: '--layout-popup-height',
  layoutRail: '--layout-rail',
  layoutDrawer: '--layout-drawer',
  spacingXs: '--spacing-xs',
  spacingSm: '--spacing-sm',
  spacingMd: '--spacing-md',
  spacingLg: '--spacing-lg',
  spacingXl: '--spacing-xl',
  radiusSm: '--radius-sm',
  radiusMd: '--radius-md',
  radiusLg: '--radius-lg',
  toastScreenInset: '--toast-screen-inset',
  toastSurfaceInset: '--toast-surface-inset',
} as const satisfies Record<string, CssVarName>;

export type SemanticToken = (typeof semanticTokens)[keyof typeof semanticTokens];

export const componentTokens = {
  buttonRadius: '--button-radius',
  buttonPadding: '--button-padding',
  buttonPaddingSm: '--button-padding-sm',
  buttonRadiusSm: '--button-radius-sm',
  buttonFontWeight: '--button-font-weight',
  buttonBgPrimary: '--button-bg-primary',
  buttonTextPrimary: '--button-text-primary',
  buttonShadowPrimary: '--button-shadow-primary',
  buttonBgGhost: '--button-bg-ghost',
  buttonTextGhost: '--button-text-ghost',
  buttonBorderGhost: '--button-border-ghost',
  inputPadding: '--input-padding',
  inputRadius: '--input-radius',
  inputBorder: '--input-border',
  inputBg: '--input-bg',
  inputText: '--input-text',
  inputPlaceholder: '--input-placeholder',
  cardBg: '--card-bg',
  cardBorder: '--card-border',
  cardRadius: '--card-radius',
  cardShadow: '--card-shadow',
  cardPadding: '--card-padding',
  overlayShadow: '--overlay-shadow',
} as const satisfies Record<string, CssVarName>;

export type ComponentToken = (typeof componentTokens)[keyof typeof componentTokens];
