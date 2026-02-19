/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      keyframes: {
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'scanned-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 2px rgba(16,185,129,0.3)' },
          '50%': { boxShadow: '0 0 0 3px rgba(16,185,129,0.45)' },
        },
      },
      animation: {
        'slide-in-left': 'slide-in-left 0.3s cubic-bezier(0.4,0,0.2,1) forwards',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.4,0,0.2,1) forwards',
        'scanned-pulse': 'scanned-pulse 2s ease-in-out infinite',
      },
      colors: {
        primary: {
          DEFAULT: '#10b981',
          dark: '#059669',
          deep: '#052c22',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
