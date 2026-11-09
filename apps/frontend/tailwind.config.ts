import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#150E56',
        accentTeal: '#00917C',
        accentBlue: '#150E56',
        bgCream: '#FFFBF9',
        bgPeach: '#FFF6F0',
        bgSand: '#F5EBE6',
        surface: '#FFFFFF',
        surface2: '#FFF9F5',
        glow: '#00917C',
        neon: '#150E56',
      },
      boxShadow: {
        clay: '12px 12px 24px rgba(180, 160, 150, 0.18), -10px -10px 20px rgba(255, 255, 255, 0.95), inset -4px -4px 8px rgba(180, 160, 150, 0.05), inset 4px 4px 8px rgba(255, 255, 255, 0.9)',
        clayBtn: '6px 6px 12px rgba(180, 160, 150, 0.15), -6px -6px 12px rgba(255, 255, 255, 0.95), inset -2px -2px 6px rgba(180, 160, 150, 0.05), inset 2px 2px 6px rgba(255, 255, 255, 0.9)',
        clayBtnHover: '8px 8px 16px rgba(180, 160, 150, 0.2), -8px -8px 16px rgba(255, 255, 255, 0.95), inset -3px -3px 8px rgba(180, 160, 150, 0.05), inset 3px 3px 8px rgba(255, 255, 255, 0.95)',
        clayBtnActive: 'inset 4px 4px 8px rgba(180, 160, 150, 0.15), inset -4px -4px 8px rgba(255, 255, 255, 0.9)',
        glow: '0 10px 30px rgba(21, 14, 86, 0.04)',
      },
      backgroundImage: {
        'futuristic-grid': 'radial-gradient(circle at top left, rgba(0, 145, 124, 0.04), transparent 45%), radial-gradient(circle at bottom right, rgba(21, 14, 86, 0.03), transparent 45%)',
        'clay-gradient': 'linear-gradient(135deg, #FFFDFB 0%, #FFF7F2 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
