import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

try {
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'dist', 'e2e', 'index.js'),
    launchArgs: [root, '--disable-extensions'],
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
