// src/theme.ts

export const Theme = {
  colors: {
    background: '#FAF9F6',
    text: '#1A1A1A',
    accent: '#C4654A',
    secondary: '#8C8C8C',
  },
  fonts: {
    body: 'Georgia',
    // UI font uses system default, no need to specify a fontFamily for UI components
  },
  sizes: {
    horizontalPadding: 24,
    lineSpacing: 8,
  },
} as const;
