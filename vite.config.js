import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 6001,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:6000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:6000',
        ws: true,
        changeOrigin: true,
        // A browser tab reconnecting to /ws without a valid token makes the
        // upstream drop the socket; http-proxy then spams ECONNABORTED/ECONNRESET
        // stack traces. Swallow those specific transport errors quietly.
        configure: (proxy) => {
          const quiet = new Set(['ECONNABORTED', 'ECONNRESET', 'EPIPE'])
          proxy.on('error', (err) => {
            if (!quiet.has(err && err.code)) console.error('[ws proxy]', err.message)
          })
        },
      },
    },
  },
})
