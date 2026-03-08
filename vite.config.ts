import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', 'postprocessing'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (id.includes('three') || id.includes('@react-three')) {
            return 'vendor-three'
          }

          if (id.includes('echarts')) {
            return 'vendor-echarts'
          }

          if (id.includes('react') || id.includes('scheduler')) {
            return 'vendor-react'
          }

          return 'vendor-misc'
        },
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', 'postprocessing'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      three: path.resolve(__dirname, './node_modules/three'),
      '@react-three/fiber': path.resolve(__dirname, './node_modules/@react-three/fiber'),
      '@react-three/drei': path.resolve(__dirname, './node_modules/@react-three/drei'),
      postprocessing: path.resolve(__dirname, './node_modules/postprocessing'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
})
