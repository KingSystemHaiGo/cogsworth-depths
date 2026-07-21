import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base './' + 单文件内联:构建产物可直接双击在浏览器打开
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    chunkSizeWarningLimit: 4000,
  },
});
