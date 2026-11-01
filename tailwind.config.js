/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef5ff', 100: '#d9e8ff', 200: '#bcd7ff', 300: '#8ebdff', 400: '#5998ff',
          500: '#3374fb', 600: '#1d55f0', 700: '#1641d6', 800: '#1836ad', 900: '#1a3388', 950: '#0f1f52',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
};
