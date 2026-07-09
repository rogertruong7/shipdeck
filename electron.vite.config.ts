import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          agent: resolve(__dirname, 'src/agent/agent.ts'),
        },
      },
    },
  },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react()] },
})
