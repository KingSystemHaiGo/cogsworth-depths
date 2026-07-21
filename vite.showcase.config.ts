import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';

// 展示台单独构建(单文件插件不支持多输入,需分开跑)
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    chunkSizeWarningLimit: 4000,
    emptyOutDir: false, // 不清空,保留游戏本体 index.html
    rollupOptions: {
      input: resolve(__dirname, 'showcase.html'),
      output: {
        entryFileNames: 'assets/showcase.js',
      },
    },
  },
});
