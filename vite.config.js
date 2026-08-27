import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Serves /api/coins in local dev by invoking the same edge handler Vercel
// runs in production (api/coins.js uses only web-standard APIs, which Node 18+
// provides). Production deploys are untouched — Vercel handles /api itself.
function localApiPlugin() {
  return {
    name: 'cmvng-local-api',
    configureServer(server) {
      server.middlewares.use('/api/coins', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/api/coins.js')
          const request = new Request(`http://localhost${req.originalUrl || req.url}`, {
            method: req.method,
            headers: req.headers,
          })
          const response = await mod.default(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          const buf = Buffer.from(await response.arrayBuffer())
          res.end(buf)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Local API error: ' + e.message }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
})
