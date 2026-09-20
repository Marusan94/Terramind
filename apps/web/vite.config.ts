import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'maplibre-vendor': ['maplibre-gl'],
          'deckgl-vendor': ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/geo-layers'],
          'icons-vendor': ['lucide-react'],
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  esbuild: {
    drop: ['console', 'debugger'],
    legalComments: 'none',
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    open: false,
    // Permite ver la app desde túneles públicos (Cloudflare) en el celular
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      // LLMs por mismo origen: evita CORS/bloqueos en el navegador del celular.
      // Si el proxy no existe (preview/prod sin backend), el chat usa directo.
      "/api/llm/groq": {
        target: "https://api.groq.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llm\/groq/, "/openai/v1")
      },
      "/api/llm/openrouter": {
        target: "https://openrouter.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llm\/openrouter/, "/api/v1")
      },
      "/api/llm/gemini": {
        target: "https://generativelanguage.googleapis.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/llm\/gemini/, "/v1beta")
      },
      // SIATA publica JSON sin CORS: se proxea para leerlo desde el navegador
      "/api/siata": {
        target: "https://siata.gov.co",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/siata/, "")
      },
      // Geoportal SIATA (niveles en vivo): mismo trato, sin llave.
      // OJO: va antes de "/api" para que no lo capture el proxy del backend.
      "/api/geoportal": {
        target: "https://geoportal.siata.gov.co",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/geoportal/, "")
      },
      // Alcaldía de Medellín (comunas oficiales, GeoJSON sin llave).
      "/api/medellin": {
        target: "https://www.medellin.gov.co/servidormapas",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/medellin/, "")
      },
      // NASA FIRMS (focos de incendio en vivo): requiere VITE_FIRMS_MAP_KEY.
      // OJO: va antes de "/api" para que no lo capture el proxy del backend.
      "/api/firms": {
        target: "https://firms.modaps.eosdis.nasa.gov",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/firms/, "")
      },
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true
      },
      "/carto-tiles": {
        target: "https://basemaps.cartocdn.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/carto-tiles/, "")
      },
      "/dem-tiles": {
        target: "https://s3.amazonaws.com/elevation-tiles-prod",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dem-tiles/, "")
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true
  }
})
