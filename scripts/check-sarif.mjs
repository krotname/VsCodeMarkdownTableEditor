import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function sarifFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sarifFiles(path));
    else if (entry.name.endsWith('.sarif')) files.push(path);
  }
  return files;
}

const directory = resolve(process.argv[2] ?? 'codeql-results');
const files = await sarifFiles(directory);
if (files.length === 0) throw new Error(`No SARIF files found in ${directory}`);

const findings = [];
for (const file of files) {
  const sarif = JSON.parse(await readFile(file, 'utf8'));
  for (const run of sarif.runs ?? []) {
    for (const result of run.results ?? []) {
      if ((result.level ?? 'warning') === 'note' || (result.level ?? 'warning') === 'none') continue;
      const location = result.locations?.[0]?.physicalLocation;
      findings.push({
        rule: result.ruleId ?? 'unknown-rule',
        level: result.level ?? 'warning',
        message: result.message?.text ?? 'CodeQL finding',
        file: location?.artifactLocation?.uri ?? 'unknown-file',
        line: location?.region?.startLine ?? 0,
      });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) console.error(`${finding.level}: ${finding.rule} ${finding.file}:${finding.line} ${finding.message}`);
  throw new Error(`CodeQL reported ${findings.length} actionable finding(s)`);
}
console.log(`CodeQL SARIF is clean (${files.length} file(s)).`);
