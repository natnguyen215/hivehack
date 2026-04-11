import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ember: '#f97316',
      },
    },
  },
  plugins: [],
};

export default config;