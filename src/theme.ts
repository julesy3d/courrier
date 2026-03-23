export const Theme = {
  colors: {
    background: '#B7B3AA',           // Warm grey — app chrome, video slot bg
    surface: '#A8A49B',              // Slightly darker — sheets, elevated cards
    surfaceAlt: '#9F9B92',           // Thumbnail backgrounds, subtle depth

    accent: '#01E048',               // Primary brand green
    accentMuted: 'rgba(1,224,72,0.25)', // Glow, highlights
    secondary: '#2C7B45',            // Darker green — secondary actions, seam

    textPrimary: '#1A1A1A',          // Near-black on warm bg
    textSecondary: 'rgba(26,26,26,0.55)',
    textTertiary: 'rgba(26,26,26,0.38)',
    textOnAccent: '#1A1A1A',         // Dark text on bright green buttons

    danger: '#FF3B30',
    success: 'rgba(1,224,72,0.8)',

    buttonBackground: 'rgba(0,0,0,0.15)',
    buttonBorder: 'rgba(0,0,0,0.12)',

    overlay: 'rgba(0,0,0,0.5)',
    overlayHeavy: 'rgba(0,0,0,0.85)',

    seam: '#2C7B45',                 // Secondary green for the divider
    seamGlow: '#01E048',             // Bright green glow on touch

    sheetBackground: 'rgba(167,163,154,0.95)',  // Warm grey, translucent
    sheetHandle: 'rgba(26,26,26,0.25)',

    inputBackground: 'rgba(0,0,0,0.07)',
    inputBorder: 'rgba(0,0,0,0.12)',
  },

  fonts: {
    base: 'Verdana',
    mono: 'Menlo',
  },
} as const;
