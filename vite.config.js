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

// Serves /api/plans in local dev with the SAME node module server.js uses in
// production (api/plans.js). PLANS_DIR defaults inside the module to
// ./node_modules/.cache/cmvng-plans so dev never pollutes the repo tree;
// production sets PLANS_DIR explicitly (e.g. /data).
function localPlansPlugin() {
  return {
    name: 'cmvng-local-plans',
    configureServer(server) {
      server.middlewares.use('/api/plans', async (req, res) => {
        try {
          // plain node import — the module is node-only, no transforms needed
          const { handlePlansRequest } = await import('./api/plans.js')
          let body = null
          if (req.method === 'POST') {
            const chunks = []
            let size = 0
            await new Promise((resolve, reject) => {
              req.on('data', c => {
                size += c.length
                if (size > 16 * 1024) { reject(new Error('Plan config too large.')); req.destroy() } else chunks.push(c)
              })
              req.on('end', resolve)
              req.on('error', reject)
            })
            try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') } catch { body = undefined }
          }
          const url = new URL(req.originalUrl || req.url, 'http://localhost')
          const out = handlePlansRequest({ method: req.method, url, body, ip: req.socket?.remoteAddress || 'local' })
          res.statusCode = out.status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(out.body))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Local plans API error: ' + e.message }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localApiPlugin(), localPlansPlugin()],
})
