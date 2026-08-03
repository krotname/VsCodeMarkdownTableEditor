import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runVSCodeCommand } from '@vscode/test-electron';

const root = process.cwd();
const vsix = join(root, 'build', 'markdown-table-editor.vsix');
const extensionsDirectory = join(root, 'build', 'vsix-extensions');
const userDataDirectory = join(root, 'build', 'vsix-user-data');
const profileArgs = ['--extensions-dir', extensionsDirectory, '--user-data-dir', userDataDirectory];

await runVSCodeCommand(['--install-extension', vsix, '--force', ...profileArgs], { version: 'stable' });
const { stdout } = await runVSCodeCommand(['--list-extensions', '--show-versions', ...profileArgs], { version: 'stable' });
assert.match(stdout, /^krotname\.markdown-table-editor@0\.1\.0$/mu);
console.log('Packaged VSIX installed and enumerated successfully.');
