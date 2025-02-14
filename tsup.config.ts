import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'asset/index': 'src/asset/index.ts',
        'cose/index': 'src/cose/index.ts',
        'crypto/index': 'src/crypto/index.ts',
        'jumbf/index': 'src/jumbf/index.ts',
        'manifest/index': 'src/manifest/index.ts',
        'rfc3161/index': 'src/rfc3161/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
});
