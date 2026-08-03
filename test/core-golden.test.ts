import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Action, apply, fromDelimited, type EditResult } from '../src/core.js';

interface ConversionScenario {
  name: string;
  input: string;
  ok?: boolean;
  lines?: string[];
}

interface EditScenario {
  name: string;
  action: keyof typeof Action;
  row: number;
  column: number;
  input: string[];
  ok?: boolean;
  lines?: string[];
  targetRow?: number;
  targetColumn?: number;
}

interface GoldenFixtures {
  schemaVersion: number;
  conversion: ConversionScenario[];
  edits: EditScenario[];
}

const fixturePath = join(process.cwd(), 'test-fixtures', 'markdown-table-core-golden.json');
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as GoldenFixtures;

function assertScenario(result: EditResult, scenario: ConversionScenario | EditScenario): void {
  assert.equal(result.ok, scenario.ok ?? true);
  if (scenario.lines) assert.deepEqual(result.lines, scenario.lines);
  if ('targetRow' in scenario && scenario.targetRow !== undefined) assert.equal(result.targetRow, scenario.targetRow);
  if ('targetColumn' in scenario && scenario.targetColumn !== undefined) assert.equal(result.targetColumn, scenario.targetColumn);
}

test('fixture schema is the shared core schema', () => assert.equal(fixtures.schemaVersion, 1));

for (const scenario of fixtures.conversion) {
  test(`golden conversion: ${scenario.name}`, () => assertScenario(fromDelimited(scenario.input), scenario));
}

for (const scenario of fixtures.edits) {
  test(`golden edit: ${scenario.name}`, () => {
    assertScenario(apply(scenario.input, scenario.row, scenario.column, Action[scenario.action]), scenario);
  });
}
