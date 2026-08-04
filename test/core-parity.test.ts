// Regression guards for behaviour that must stay identical to the shared JetBrains/Notepad++ core.
// Every expectation below was taken from the reference implementation
// (name.krot.markdowntable.core.MarkdownTableCore 0.3.1).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Action,
  apply,
  applyWrappedToWidth,
  findTableRanges,
  fromDelimited,
  isPotentialSeparatorLine,
  newTable,
} from '../src/core.js';

test('a table stops before prose that merely contains a pipe', () => {
  const lines = ['| A | B |', '| --- | --- |', '| x | y |', 'tail | prose'];
  assert.deepEqual(findTableRanges(lines), [{ found: true, firstRow: 0, lastRow: 2 }]);
  const result = apply(lines, 0, 0, Action.ALIGN);
  assert.deepEqual(result.lines, ['| A   | B   |', '| --- | --- |', '| x   | y   |']);
});

test('a row with more cells than the separator grows the table instead of losing data', () => {
  assert.deepEqual(apply(['| A | B |', '| --- | --- |', '| x | y | z |'], 2, 0, Action.ALIGN).lines, [
    '| A   | B   |     |', '| --- | --- | --- |', '| x   | y   | z   |',
  ]);
  assert.deepEqual(apply(['| A | B |', '| --- | --- |', '| x|y | 0 |'], 2, 0, Action.ALIGN).lines, [
    '| A   | B   |     |', '| --- | --- | --- |', '| x   | y   | 0   |',
  ]);
});

test('deleting the row above the separator is refused so the table keeps a header', () => {
  const header = apply(['| A |', '| --- |', '| x |'], 0, 0, Action.DELETE_ROW);
  assert.deepEqual(header.lines, ['| A   |', '| --- |', '| x   |']);
  const data = apply(['| A |', '| --- |', '| x |', '| y |'], 2, 0, Action.DELETE_ROW);
  assert.deepEqual(data.lines, ['| A   |', '| --- |', '| y   |']);
  assert.equal(data.targetRow, 2);
});

test('targetColumnOffset addresses the cell content inside the formatted line', () => {
  const right = apply(['| A | Bee |', '| --- | ---: |', '| x | 2 |'], 2, 1, Action.ALIGN);
  assert.deepEqual(right.lines, ['| A   | Bee |', '| --- | --: |', '| x   |   2 |']);
  assert.equal(right.targetColumnOffset, 10);
  assert.equal((right.lines[right.targetRow] ?? '')[right.targetColumnOffset], '2');

  const center = apply(['| A | Bees |', '| --- | :---: |', '| x | 2 |'], 2, 1, Action.ALIGN);
  assert.deepEqual(center.lines, ['| A   | Bees |', '| --- | :--: |', '| x   |  2   |']);
  assert.equal(center.targetColumnOffset, 9);
  assert.equal((center.lines[center.targetRow] ?? '')[center.targetColumnOffset], '2');
});

test('separator syntax accepts spaced dashes, equals rules and short separator lines', () => {
  assert.equal(isPotentialSeparatorLine('| -- - | --- |'), true);
  assert.equal(isPotentialSeparatorLine('|===|'), true);
  assert.equal(isPotentialSeparatorLine('| :: |'), false);
  assert.deepEqual(findTableRanges(['| A | B |', '| -- - | --- |', '| x | y |']), [
    { found: true, firstRow: 0, lastRow: 2 },
  ]);
  assert.deepEqual(findTableRanges(['| A |', '|===|', '| x |']), [{ found: true, firstRow: 0, lastRow: 2 }]);
});

test('a pipe block without a separator row is not a Markdown table', () => {
  const result = apply(['| A | B |', '| x | y |'], 0, 0, Action.ALIGN);
  assert.equal(result.ok, false);
  assert.equal(result.message, 'No Markdown table found');
});

test('new tables carry named header cells and put the caret on the first data row', () => {
  const withRows = newTable(3, 2);
  assert.deepEqual(withRows.lines, [
    '| Column 1 | Column 2 | Column 3 |',
    '| -------- | -------- | -------- |',
    '|          |          |          |',
    '|          |          |          |',
  ]);
  assert.equal(withRows.targetRow, 2);
  assert.deepEqual(newTable(2, 0).lines, ['| Column 1 | Column 2 |', '| -------- | -------- |']);
  assert.equal(newTable(2, 0).targetRow, 0);
  assert.equal(newTable(0, 1).message, 'Invalid table size');
});

test('fitting a width unwraps earlier continuation rows so repeating it is stable', () => {
  const source = ['| Key | Description |', '| --- | --- |', '| x | alpha beta gamma delta epsilon zeta |'];
  const once = applyWrappedToWidth(source, 2, 0, 28);
  assert.deepEqual(once.lines, [
    '| Key | Description        |',
    '| --- | ------------------ |',
    '| x   | alpha beta gamma   |',
    '|     | delta epsilon zeta |',
  ]);
  const twice = applyWrappedToWidth(once.lines, 2, 0, 28);
  assert.deepEqual(twice.lines, once.lines);
  assert.equal(twice.changed, false);
});

test('manual column resizing follows the content instead of a fixed three column floor', () => {
  assert.deepEqual(apply(['|A|B|', '|-|-|', '|x|y|'], 0, 0, Action.NARROW_COLUMN).lines, [
    '| A | B |', '| - | - |', '| x | y |',
  ]);
  assert.deepEqual(apply(['|A|B|', '|-|-|', '|x|y|'], 0, 0, Action.WIDEN_COLUMN).lines, [
    '| A  | B |', '| -- | - |', '| x  | y |',
  ]);
});

test('delimited conversion keeps cell text verbatim and reports the shared messages', () => {
  assert.deepEqual(fromDelimited('a  b,c\td').lines, ['| a  b,c | d   |', '| ------ | --- |']);
  assert.equal(fromDelimited('').message, 'No CSV or TSV data found');
  assert.equal(fromDelimited('no delimiter').message, 'No CSV or TSV data found');
});

test('fitting keeps sparse rows that wrapping could not have produced', () => {
  // The third row sets the column width, so "second" would still have fitted after "short".
  // Wrapping is greedy and never leaves that room, so these are two records, not one wrapped row.
  const table = [
    '| Name  | Note                     |',
    '| ----- | ------------------------ |',
    '| Alice | short                    |',
    '|       | second                   |',
    '| Bob   | a much longer value here |',
  ];
  const result = applyWrappedToWidth(table, 0, 0, 200);
  assert.deepEqual(result.lines, table);
  assert.equal(result.changed, false);

  // Wrapping fills a cell's segments from the top, so "b" cannot be the second segment of an
  // empty cell.
  const underEmpty = applyWrappedToWidth(['| A | B |', '| --- | --- |', '| a |  |', '|  | b |'], 0, 0, 200);
  assert.deepEqual(underEmpty.lines, ['| A   | B   |', '| --- | --- |', '| a   |     |', '|     | b   |']);
});

test('fitting still rejoins rows that wrapping produced', () => {
  const wrapped = [
    '| Key | Description        |',
    '| --- | ------------------ |',
    '| x   | alpha beta gamma   |',
    '|     | delta epsilon zeta |',
  ];
  const result = applyWrappedToWidth(wrapped, 0, 0, 120);
  assert.equal(result.lines.length, 3);
  assert.ok((result.lines[2] ?? '').includes('alpha beta gamma delta epsilon zeta'), result.lines.join('\n'));
});

test('a hand split word is still rejoined even when the table is not aligned', () => {
  const result = applyWrappedToWidth(['| A | B |', '| --- | --- |', '| scrip | keep |', '| t already | |'], 0, 0, 80);
  assert.ok((result.lines[2] ?? '').includes('script already'), result.lines.join('\n'));
});

test('fitting rejoins a body that was wrapped below the header width', () => {
  // The header is wider than the wrap target, so the rendered column is wider than the width the
  // body segments were actually split at.
  const narrow = applyWrappedToWidth(
    ['| Identifier | Description |', '| --- | --- |', '| x | alpha beta gamma delta epsilon |'],
    2, 0, 15,
  );
  assert.ok(narrow.lines.length > 3, narrow.lines.join('\n'));
  assert.equal(applyWrappedToWidth(narrow.lines, 0, 0, 200).lines.length, 3);
});

test('fitting rejoins constructs that were hard split mid token', () => {
  // Wrapping cuts an over-wide link mid-token, so a fragment no longer parses as a link.
  const narrow = applyWrappedToWidth(
    ['| A | B |', '| --- | --- |', '| [x y](url) [x y](url) | a |'],
    2, 0, 18,
  );
  assert.ok(narrow.lines.length > 3, narrow.lines.join('\n'));
  const wide = applyWrappedToWidth(narrow.lines, 0, 0, 200);
  assert.equal(wide.lines.length, 3);
  assert.ok((wide.lines[2] ?? '').includes('[x y](url) [x y](url)'), wide.lines.join('\n'));
});
