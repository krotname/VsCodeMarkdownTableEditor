import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Action,
  apply,
  applyWrappedToWidth,
  columnFromCursor,
  displayWidth,
  findTableRange,
  findTableRanges,
  fromDelimited,
  isPotentialSeparatorLine,
  isPotentialTableLine,
  newTable,
} from '../src/core.js';

const table = ['before', '| A | B |', '| --- | ---: |', '| x | 2 |', '| y | 1 |', 'after'];

test('detects only the containing table and all non-overlapping ranges', () => {
  assert.deepEqual(findTableRange(table, 3), { found: true, firstRow: 1, lastRow: 4 });
  assert.equal(findTableRange(table, 0).found, false);
  assert.deepEqual(findTableRanges([...table, '', '| C |', '| --- |', '| z |']), [
    { found: true, firstRow: 1, lastRow: 4 },
    { found: true, firstRow: 7, lastRow: 9 },
  ]);
});

test('table predicates and cursor mapping respect escaped pipes', () => {
  assert.equal(isPotentialTableLine('a \\| b'), false);
  assert.equal(isPotentialTableLine('a | b'), true);
  assert.equal(isPotentialSeparatorLine('| :--- | ---: |'), true);
  assert.equal(columnFromCursor('| a \\| b | c |', 8), 0);
  assert.equal(columnFromCursor('| a \\| b | c |', 13), 1);
});

test('all structural row and column actions keep a valid table', () => {
  const base = table.slice(1, 5);
  for (const action of [
    Action.INSERT_ROW_BELOW, Action.DELETE_ROW, Action.INSERT_COLUMN_RIGHT, Action.DELETE_COLUMN,
    Action.MOVE_ROW_UP, Action.MOVE_ROW_DOWN, Action.MOVE_COLUMN_LEFT, Action.MOVE_COLUMN_RIGHT,
    Action.NARROW_COLUMN, Action.WIDEN_COLUMN, Action.SORT_DESCENDING,
  ]) {
    const result = apply(base, 2, 1, action);
    assert.equal(result.ok, true, action);
    assert.equal(findTableRange(result.lines, Math.min(result.targetRow, result.lines.length - 1)).found, true, action);
  }
});

test('fit operation respects the requested width when physically possible', () => {
  const result = applyWrappedToWidth([
    '| Key | Description |', '| --- | --- |', '| x | alpha beta gamma delta epsilon zeta |',
  ], 2, 1, 28);
  assert.equal(result.ok, true);
  assert.ok(result.lines.every((line) => displayWidth(line) <= 28), result.lines.join('\n'));
  assert.ok(result.lines.length > 3);
});

test('new table and delimited conversion validate inputs', () => {
  assert.equal(newTable(3, 2).lines.length, 4);
  assert.equal(newTable(0, 2).ok, false);
  assert.equal(fromDelimited('no delimiter').ok, false);
});

test('large table alignment remains linear enough for editor use', () => {
  const lines = ['| Name | Value |', '| --- | ---: |'];
  for (let index = 0; index < 10_000; index += 1) lines.push(`| item ${index} | ${10_000 - index} |`);
  const started = performance.now();
  const result = apply(lines, 5_000, 1, Action.ALIGN);
  assert.equal(result.ok, true);
  assert.ok(performance.now() - started < 2_500);
});
