export const Theme = {
  colors: {
    background: '#121212',           // Near-black — app chrome, video slot bg
    surface: '#1A1A1A',              // Charcoal — sheets, elevated cards
    surfaceAlt: '#222222',           // Slightly lighter charcoal, subtle depth

    accent: '#E8E4DF',               // Off-white — primary actions
    accentMuted: 'rgba(232,228,223,0.15)', // Subtle glow, highlights
    secondary: '#3A3A3A',            // Mid-grey — secondary actions, seam

    textPrimary: '#E8E4DF',          // Off-white on dark bg
    textSecondary: 'rgba(232,228,223,0.50)',
    textTertiary: 'rgba(232,228,223,0.30)',
    textOnAccent: '#121212',         // Dark text on off-white buttons

    danger: '#8B4040',               // Muted red
    success: 'rgba(232,228,223,0.6)',

    buttonBackground: 'rgba(255,255,255,0.08)',
    buttonBorder: 'rgba(255,255,255,0.10)',

    overlay: 'rgba(0,0,0,0.6)',
    overlayHeavy: 'rgba(0,0,0,0.90)',

    seam: '#2A2A2A',                 // Dark grey divider
    seamGlow: '#E8E4DF',             // Off-white glow on touch
    audioBorder: '#FFFFFF',           // White outline on card with audio

    sheetBackground: 'rgba(26,26,26,0.95)',  // Charcoal, translucent
    sheetHandle: 'rgba(232,228,223,0.20)',

    inputBackground: 'rgba(255,255,255,0.05)',
    inputBorder: 'rgba(255,255,255,0.08)',
  },

  fonts: {
    base: 'Verdana',
    mono: 'Menlo',
  },
} as const;
