import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'auth/index': 'src/auth/index.ts', 'react/index': 'src/react/index.ts', 'header/index': 'src/header/index.ts', 'native/index': 'src/native/index.ts', 'whatsnew/index': 'src/whatsnew/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', '@supabase/supabase-js'],
});
