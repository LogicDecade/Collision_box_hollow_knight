import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const rp = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  server: {
    port: 5173,
    // 把 /api 代理到本地 Fastify(3001)，生产走同源托管，天然免 CORS
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        // 生产只发游戏主页；编辑器(editor.html)是开发工具，不随构建产物上传
        main: rp('index.html'),
      },
    },
  },
});
