/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050816',
        panel: 'rgba(10, 17, 33, 0.72)',
        panelStrong: 'rgba(9, 14, 28, 0.92)',
        greenGlow: '#20e3a2',
        emeraldGlow: '#20e3a2',
        cyanGlow: '#7cf7c8',
        muted: '#8da0c6'
      },
      boxShadow: {
        glass: '0 24px 80px rgba(0, 0, 0, 0.45)',
        glow: '0 0 0 1px rgba(32, 227, 162, 0.18), 0 20px 60px rgba(32, 227, 162, 0.16)'
      },
      backgroundImage: {
        aurora:
          'radial-gradient(circle at top left, rgba(32, 227, 162, 0.24), transparent 35%), radial-gradient(circle at top right, rgba(124, 247, 200, 0.18), transparent 28%), linear-gradient(180deg, rgba(7, 16, 14, 1), rgba(5, 8, 22, 1))'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: 0.7 },
          '50%': { opacity: 1 }
        },
        shine: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' }
        }
      },
      animation: {
        float: 'float 8s ease-in-out infinite',
        pulseSoft: 'pulseSoft 3s ease-in-out infinite',
        shine: 'shine 1.8s linear infinite'
      }
    }
  },
  plugins: []
};