import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'auth/index': 'src/auth/index.ts', 'react/index': 'src/react/index.ts', 'header/index': 'src/header/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', '@supabase/supabase-js'],
});
