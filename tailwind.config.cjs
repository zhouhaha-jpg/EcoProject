/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ── 完全对齐 power_dashboard.html 色板 ── */
        'bg0': '#070c14',
        'bg1': '#0d1422',
        'bg2': '#111b2e',
        'bg3': '#172240',
        'border-cyber': '#1e3256',
        'glow': '#00d4ff',
        /* 保留旧别名以防其余页面引用 */
        'cyber-black': '#070c14',
        'cyber-blue': '#111b2e',
        'cyber-panel': '#0d1422',
        'neon-cyan': '#00d4ff',
        'neon-cyan-dim': 'rgba(0,212,255,0.06)',
        'neon-pink': '#ff5252',
        'neon-yellow': '#ffd740',
        'matrix-green': '#69f0ae',
        'text-primary': '#e8f4ff',
        'text-secondary': '#8ba9cc',
        'text-muted': '#3d6080',
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        body: ['Noto Sans SC', 'Rajdhani', 'sans-serif'],
        mono: ['Share Tech Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'logo-pulse': 'logo-pulse 2s ease-in-out infinite',
        'fade-in-up': 'fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        'logo-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.7)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
