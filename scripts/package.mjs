import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

await mkdir('build', { recursive: true });
const cli = join('node_modules', '@vscode', 'vsce', 'vsce');
const result = spawnSync(process.execPath, [cli, 'package', '--no-dependencies', '--out', 'build/markdown-table-editor.vsix'], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
