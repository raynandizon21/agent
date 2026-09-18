import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createLogger, defineConfig } from 'vite'

// A browser tab reconnecting to /ws without a valid token makes the upstream
// drop the socket; Vite's http-proxy then prints an ECONNABORTED stack trace on
// every retry. Those lines carry no signal here, so drop them from the logger.
const logger = createLogger()
const origError = logger.error
logger.error = (msg, opts) => {
  const s = typeof msg === 'string' ? msg : ''
  if (s.includes('ws proxy') || s.includes('http proxy error') || s.includes('ECONNABORTED')) {
    return
  }
  origError(msg, opts)
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  customLogger: logger,
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
