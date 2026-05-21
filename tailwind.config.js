import forms from '@tailwindcss/forms';

export default {
  content: ['./src/**/*.{html,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif']
      },
      boxShadow: {
        glow: '0 18px 70px rgba(80, 70, 229, 0.25)',
        panel: '0 24px 80px rgba(15, 23, 42, 0.18)'
      },
      keyframes: {
        floatIn: {
          '0%': { transform: 'translateY(8px) scale(.98)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' }
        }
      },
      animation: {
        floatIn: 'floatIn 220ms ease-out both'
      }
    }
  },
  plugins: [forms]
};
