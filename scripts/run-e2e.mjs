import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

try {
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'dist', 'e2e', 'index.js'),
    // Container /dev/shm is small; let Chromium use the job's temporary disk.
    launchArgs: [root, '--disable-extensions', ...(process.platform === 'linux' ? ['--disable-dev-shm-usage'] : [])],
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
