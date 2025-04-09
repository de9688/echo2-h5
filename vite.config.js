import { fileURLToPath, URL } from 'node:url'
import { defineConfig, splitVendorChunkPlugin, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import OptimizationPersist from 'vite-plugin-optimize-persist'
import PkgConfig from 'vite-plugin-package-config'
import path from 'path'

import postCssPxToRem from 'postcss-pxtorem'
import autoprefixer from 'autoprefixer'
import { VantResolver } from 'unplugin-vue-components/resolvers'
import nodePolyfills from 'rollup-plugin-polyfill-node'
import { customHtmlPlugin } from './vite.html.plugin.js'
import ViteCompressionPlugin from 'vite-plugin-compression'
import legacy from '@vitejs/plugin-legacy'

export default ({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd());
  // 调试代码，输出加载的环境变量，确保它们正确加载
  console.log('Loaded Environment Variables:', env);
  console.log('VITE_APP_META_TITLE:', env.VITE_APP_META_TITLE); // 输出特定环境变量
  
  return defineConfig({

    // 定义全局变量，通过 import.meta.env 访问
    define: {
      'process.env': env // 使用环境变量
    },
    publicDir: 'public',
    base: '',
    clearScreen: true,
    plugins: [
      vue(),
      legacy({
        targets: ['defaults', 'not IE 11']
      }),
      PkgConfig(),
      OptimizationPersist(),
      nodePolyfills({ include: ['buffer'] }),
      Components({
        dts: true,
        resolvers: [VantResolver()]
      }),
      AutoImport({ imports: ['vue', 'vue-router', 'pinia'] }),
      splitVendorChunkPlugin(),
      customHtmlPlugin(mode), // 使用自定义 HTML 插件
      ViteCompressionPlugin({
        algorithm: 'gzip',
        disable: true,
        verbose: false,
        deleteOriginFile: false
      })
    ],
    server: {
      host: true,
      https: false,
      cors: true,
      open: false,
      port: 9000,
      proxy: {
        '/api': {
          target: 'https://webapi.icleidevelop.com', // 确认这个地址是否正确
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    css: {
      postcss: {
        plugins: [
          autoprefixer(),
          postCssPxToRem({
            rootValue: 37.5,
            unitToConvert: 'px',
            viewportWidth: 375,
            unitPrecision: 6,
            viewportUnit: 'vw',
            fontViewportUnit: 'vw',
            exclude: [/node_modules/],
            minPixelValue: 1,
            propList: ['*'],
            selectorBlackList: ['px-'],
            mediaQuery: false,
            replace: true,
            landscape: false
          })
        ]
      }
    },
    resolve: {
      alias: {
        'vue-i18n': 'vue-i18n/dist/vue-i18n.esm-bundler.js',
        '@': path.resolve(__dirname, 'src')
      }
    },
    json: {
      namedExports: false,
      stringify: false
    },
    build: {
      outDir: 'dist',
      assetsInlineLimit: 500,
      cssCodeSplit: true,
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        mangle: true,
        toplevel: true,
        module: true,
        compress: {
          drop_console: true,
          drop_debugger: true
        },
        format: {
          comments: false
        }
      },
      write: true,
      emptyOutDir: true,
      brotliSize: true,
      chunkSizeWarningLimit: 500,
      reportCompressedSize: false
    },
    rollupOptions: {
      preserveEntrySignatures: false,
      output: {
        minify: true,
        compact: true,
        minifyInternalExports: true,
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            return 'vendor';
          } else if (id.includes('/src/views/')) {
            return 'views';
          }
        }
      }
    }
  });
};