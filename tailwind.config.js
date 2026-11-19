/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#388087', hover: '#2c686e', soft: '#e4f4eb' },
      },
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [],
}
