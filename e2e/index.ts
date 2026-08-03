import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 30_000 });
  mocha.suite.emit('pre-require', globalThis, 'extension.test.ts', mocha);
  await import('./extension.test.js');
  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => failures > 0 ? reject(new Error(`${failures} E2E test(s) failed`)) : resolve());
  });
}
