import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Publishes pdf.js character maps and standard font data at /pdfjs/.
 *
 * pdf.js only ships these as files on disk; without them any PDF using a
 * CID-keyed or Devanagari font extracts as blank or as replacement characters,
 * which is exactly what a Hindi FIR copy uses. Serving them from the app
 * rather than a CDN keeps extraction working offline and under a strict CSP.
 */
function pdfjsAssets() {
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'))
  const sources = [
    { dir: path.join(root, 'cmaps'), route: '/pdfjs/cmaps/' },
    { dir: path.join(root, 'standard_fonts'), route: '/pdfjs/standard_fonts/' }
  ].filter((s) => fs.existsSync(s.dir))

  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const hit = sources.find((s) => url.startsWith(s.route))
        if (!hit) return next()
        // decodeURIComponent + basename: never let a request escape the directory.
        const file = path.join(hit.dir, path.basename(decodeURIComponent(url)))
        if (!fs.existsSync(file)) return next()
        res.setHeader('Content-Type', 'application/octet-stream')
        return fs.createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      sources.forEach((s) => {
        fs.readdirSync(s.dir).forEach((name) => {
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${path.basename(s.dir)}/${name}`,
            source: fs.readFileSync(path.join(s.dir, name))
          })
        })
      })
    }
  }
}

/**
 * Serves the Netlify search function from the Vite dev server.
 *
 * Without this, `npm run dev` has no /api/search endpoint (the function only
 * exists once deployed), so local development silently falls back to
 * manual-links-only mode and the live search path never gets exercised.
 * This runs the exact same module the deployed function runs.
 */
function netlifyFunctionsDev(env) {
  return {
    name: 'netlify-functions-dev',
    apply: 'serve',
    configureServer(server) {
      // The function reads its provider keys from process.env, which is how
      // Netlify supplies them in production. Vite only exposes .env values to
      // the client bundle (VITE_-prefixed), so without this the local dev
      // server runs the function with no keys and the optional providers stay
      // dark — which looks identical to them being unconfigured.
      //
      // Server-side only: these never reach the client bundle.
      ['SERPER_API_KEY', 'GOOGLE_CSE_KEY', 'GOOGLE_CSE_CX'].forEach((name) => {
        if (!process.env[name] && env[name]) process.env[name] = env[name]
      })

      server.middlewares.use('/api/search', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/netlify/functions/search.mjs')

          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const body = Buffer.concat(chunks)

          const request = new Request(`http://localhost${req.originalUrl || req.url}`, {
            method: req.method,
            headers: req.headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : body
          })

          const response = await mod.default(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(err?.message || err), results: [] }))
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Third argument '' loads every key, not just the VITE_-prefixed ones. The
  // repository root is one level up from `frontend`, which is where .env lives.
  const env = { ...loadEnv(mode, path.resolve(process.cwd(), '..'), ''), ...loadEnv(mode, process.cwd(), '') }

  return {
  plugins: [react(), netlifyFunctionsDev(env), pdfjsAssets()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      // /api/search is handled by the middleware above; everything else under
      // /api belongs to the optional FastAPI backend.
      '^/api/(?!search$)': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/static': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
  }
})
