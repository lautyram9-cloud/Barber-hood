import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// base relativa: la app funciona igual en /Barber-hood/next/ (vista previa)
// y en /Barber-hood/ (cuando reemplace a la versión estable).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // supabase-js ocupa la mayor parte del bundle (~150 kB gzip en total): aceptable para esta etapa.
  build: { outDir: 'dist', sourcemap: false, target: 'es2020', chunkSizeWarningLimit: 600 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/parity/**/*.test.ts'],
    environment: 'node',
    env: { TZ: 'America/Argentina/Salta' },
  },
});
