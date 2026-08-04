import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runVSCodeCommand } from '@vscode/test-electron';

const root = process.cwd();
const { name, publisher, version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const expected = `${publisher}.${name}@${version}`;
const vsix = join(root, 'build', 'markdown-table-editor-plus.vsix');
const extensionsDirectory = join(root, 'build', 'vsix-extensions');
const userDataDirectory = join(root, 'build', 'vsix-user-data');
const profileArgs = ['--extensions-dir', extensionsDirectory, '--user-data-dir', userDataDirectory];

await runVSCodeCommand(['--install-extension', vsix, '--force', ...profileArgs], { version: 'stable' });
const { stdout } = await runVSCodeCommand(['--list-extensions', '--show-versions', ...profileArgs], { version: 'stable' });
assert.ok(
  stdout.split(/\r?\n/u).includes(expected),
  `Expected the installed extension list to contain ${expected}, got:\n${stdout}`,
);
console.log(`Packaged VSIX installed and enumerated successfully as ${expected}.`);
