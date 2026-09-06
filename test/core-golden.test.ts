import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  Action,
  apply,
  findTableRanges,
  fromDelimited,
  isPotentialSeparatorLine,
  type EditResult,
} from '../src/core.js';

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

interface SeparatorLineScenario {
  name: string;
  input: string;
  separator: boolean;
}

interface RangeScenario {
  name: string;
  input: string[];
  ranges: { firstRow: number; lastRow: number }[];
}

interface GoldenFixtures {
  schemaVersion: number;
  conversion: ConversionScenario[];
  edits: EditScenario[];
  separatorLines: SeparatorLineScenario[];
  ranges: RangeScenario[];
}

const fixturePath = join(process.cwd(), 'test-fixtures', 'markdown-table-core-golden.json');
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as GoldenFixtures;

function assertScenario(result: EditResult, scenario: ConversionScenario | EditScenario): void {
  assert.equal(result.ok, scenario.ok ?? true);
  if (scenario.lines) assert.deepEqual(result.lines, scenario.lines);
  if ('targetRow' in scenario && scenario.targetRow !== undefined) assert.equal(result.targetRow, scenario.targetRow);
  if ('targetColumn' in scenario && scenario.targetColumn !== undefined) assert.equal(result.targetColumn, scenario.targetColumn);
}

test('fixture schema is the shared core schema', () => assert.equal(fixtures.schemaVersion, 2));

for (const scenario of fixtures.conversion) {
  test(`golden conversion: ${scenario.name}`, () => assertScenario(fromDelimited(scenario.input), scenario));
}

for (const scenario of fixtures.edits) {
  test(`golden edit: ${scenario.name}`, () => {
    assertScenario(apply(scenario.input, scenario.row, scenario.column, Action[scenario.action]), scenario);
  });
}

for (const scenario of fixtures.separatorLines) {
  test(`golden separator line: ${scenario.name}`, () => {
    assert.equal(isPotentialSeparatorLine(scenario.input), scenario.separator);
  });
}

for (const scenario of fixtures.ranges) {
  test(`golden ranges: ${scenario.name}`, () => {
    assert.deepEqual(
      findTableRanges(scenario.input).map((range) => ({ firstRow: range.firstRow, lastRow: range.lastRow })),
      scenario.ranges,
    );
  });
}
