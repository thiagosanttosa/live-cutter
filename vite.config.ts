import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

const developmentCsp = {
  name: 'live-cutter-development-csp',
  transformIndexHtml(html: string, context: { server?: unknown }) {
    if (!context.server) return html
    return html.replace("connect-src 'self'", "connect-src 'self' http://localhost:5173 ws://localhost:5173")
  },
}

// O plugin inicia o Electron com `--no-sandbox` por padrão, o que desliga o
// sandbox do Chromium. Aqui o sandbox fica LIGADO. A flag só é aplicada se
// LIVE_CUTTER_NO_SANDBOX=1 estiver definida (necessário apenas em ambientes
// Linux sem permissão de sandbox, como contêineres/CI; nunca no Windows).
const electronArgs = process.env.LIVE_CUTTER_NO_SANDBOX === '1' ? ['.', '--no-sandbox'] : ['.']

export default defineConfig({
  // Caminhos relativos no build: o index.html funciona a partir de qualquer
  // pasta (necessário para carregar via file:// no app empacotado).
  base: './',

  server: {
    port: 5173,
    strictPort: true, // falha em vez de trocar de porta silenciosamente
  },

  build: {
    outDir: 'dist', // frontend React compilado
  },

  plugins: [
    developmentCsp,
    react(),
    electron({
      main: {
        // Processo principal -> dist-electron/main.js
        entry: 'electron/main.ts',
        onstart({ startup }) {
          void startup(electronArgs)
        },
      },
      preload: {
        // Preload -> dist-electron/preload.cjs
        // Com sandbox ativo o preload precisa ser CommonJS, por isso `.cjs`.
        input: 'electron/preload.ts',
        vite: {
          build: {
            rolldownOptions: {
              output: {
                entryFileNames: '[name].cjs',
                chunkFileNames: '[name].cjs',
              },
            },
          },
        },
      },
      // `renderer` (Node dentro do React) fica propositalmente DESATIVADO.
    }),
  ],
})
