import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
