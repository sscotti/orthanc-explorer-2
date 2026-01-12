import { defineConfig } from 'vite'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  assetsInclude: './src/assets',
  base: '',
  plugins: [vue()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      // Proxy CXAS endpoints to Orthanc backend
      '/cxas': {
        target: 'http://localhost:8043',
        changeOrigin: true,
        secure: false,
      }
      // Proxy other Orthanc API endpoints
      // Match paths that don't start with /ui/app/ (to avoid proxying frontend assets)
      // '^(?!/(ui/app|@|node_modules|src))': {
      //   target: 'http://localhost:8043',
      //   changeOrigin: true,
      //   secure: false,
      // }
    }
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'token-landing.html'),
        retrieve: resolve(__dirname, 'retrieve-and-view.html'),
        inbox: resolve(__dirname, 'inbox.html')
      },
    }
  },
  css: {
    postcss: { // to avoid this warning: https://github.com/vitejs/vite/discussions/5079
      plugins: [
        {
          postcssPlugin: 'internal:charset-removal',
          AtRule: {
            charset: (atRule) => {
              if (atRule.name === 'charset') {
                atRule.remove();
              }
            }
          }
        }
      ]
    }
  }
})
