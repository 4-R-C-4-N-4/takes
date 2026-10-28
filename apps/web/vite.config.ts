import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const isStatic = mode === 'static';
  const fontsFile = isStatic ? './src/styles/fonts-static.css' : './src/styles/fonts-full.css';
  return {
    base: isStatic ? './' : '/',
    resolve: {
      alias: [{ find: './styles/fonts.css', replacement: fileURLToPath(new URL(fontsFile, import.meta.url)) }],
    },
    plugins: [svelte(), ...(isStatic ? [viteSingleFile()] : [])],
    build: isStatic
      ? {
          outDir: 'dist-static',
          emptyOutDir: true,
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
        }
      : undefined,
    server: {
      proxy: {
        '/ws': { target: 'ws://localhost:8787', ws: true },
      },
    },
  };
});
