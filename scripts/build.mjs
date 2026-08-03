import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
  await esbuild.build({
    entryPoints: ['e2e/index.ts'],
    bundle: true,
    outfile: 'dist/e2e/index.js',
    external: ['vscode', 'mocha'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: true,
    logLevel: 'info',
  });
}
