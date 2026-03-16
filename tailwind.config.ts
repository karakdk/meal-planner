import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream:  { DEFAULT: '#FAF9F6', 50: '#FDFCFA', 100: '#F5F3EE', 200: '#EAE8E0' },
        sage:   { 50: '#EAF3DE', 100: '#C0DD97', 200: '#97C459', 400: '#639922', 600: '#3B6D11', 800: '#27500A', 900: '#173404' },
        stone:  { 100: '#F1EFE8', 200: '#E8E6E0', 300: '#D3D1C7', 400: '#B4B2A9', 500: '#888780', 600: '#5F5E5A', 800: '#444441', 900: '#2C2C2A' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
export default config
