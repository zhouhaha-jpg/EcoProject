/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'cyber-black': '#050B14',
        'cyber-blue': '#091833',
        'cyber-panel': '#0D1F3C',
        'neon-cyan': '#00F3FF',
        'neon-cyan-dim': 'rgba(0,243,255,0.12)',
        'neon-pink': '#FF0099',
        'neon-yellow': '#F3E600',
        'matrix-green': '#00FF41',
        'border-cyber': 'rgba(0,243,255,0.2)',
        'text-primary': '#E8F4FF',
        'text-secondary': '#8BA9CC',
        'text-muted': '#3D6080',
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body: ['Rajdhani', 'Noto Sans SC', 'sans-serif'],
        mono: ['Share Tech Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scanline': 'scanline 10s linear infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'fade-in-up': 'fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'data-stream': 'data-stream 0.8s ease-in-out',
      },
      keyframes: {
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 6px currentColor' },
          '50%': { opacity: '0.5', boxShadow: '0 0 20px currentColor, 0 0 40px currentColor' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'data-stream': {
          '0%': { opacity: '0', transform: 'scaleY(0)', transformOrigin: 'top' },
          '100%': { opacity: '1', transform: 'scaleY(1)' },
        },
      },
      boxShadow: {
        'neon-cyan': '0 0 8px rgba(0,243,255,0.6), 0 0 20px rgba(0,243,255,0.3)',
        'neon-pink': '0 0 8px rgba(255,0,153,0.6), 0 0 20px rgba(255,0,153,0.3)',
        'panel': 'inset 0 0 30px rgba(0,243,255,0.03), 0 0 0 1px rgba(0,243,255,0.15)',
      },
      backgroundImage: {
        'grid-cyber': "linear-gradient(rgba(0,243,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,243,255,0.03) 1px, transparent 1px)",
        'gradient-panel': 'linear-gradient(135deg, rgba(0,243,255,0.05) 0%, transparent 50%)',
      },
      backgroundSize: {
        'grid-40': '40px 40px',
      },
    },
  },
  plugins: [],
}
