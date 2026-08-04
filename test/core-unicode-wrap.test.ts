// Width, wrapping, sorting and conversion behaviour that must match the shared
// JetBrains/Notepad++ core. Every expectation was taken from the reference implementation
// (name.krot.markdowntable.core.MarkdownTableCore 0.3.1).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Action, apply, applyWrappedToWidth, displayWidth, fromDelimited } from '../src/core.js';

test('display width follows the shared tables for emoji clusters and wide scripts', () => {
  assert.equal(displayWidth('🙂'), 2);
  assert.equal(displayWidth('👨‍👩‍👦'), 2);
  assert.equal(displayWidth('🇷🇺'), 2);
  assert.equal(displayWidth('1️⃣'), 2);
  assert.equal(displayWidth('日本語'), 6);
  assert.equal(displayWidth('é'), 1);
  assert.equal(displayWidth('é'), 1);
  assert.equal(displayWidth('​'), 0);
  assert.equal(displayWidth('👍🏽'), 2);
});

test('alignment measures emoji clusters as two columns', () => {
  const result = apply([
    '| Sym | Note |', '| --- | --- |', '| 🙂 | smile |', '| 👨‍👩‍👦 | family |',
    '| 🇷🇺 | flag |', '| 1️⃣ | keycap |', '| 日本語 | cjk |',
  ], 2, 0, Action.ALIGN);
  assert.deepEqual(result.lines, [
    '| Sym    | Note   |',
    '| ------ | ------ |',
    '| 🙂     | smile  |',
    '| 👨‍👩‍👦     | family |',
    '| 🇷🇺     | flag   |',
    '| 1️⃣     | keycap |',
    '| 日本語 | cjk    |',
  ]);
});

test('hard wrapping splits code spans and unbreakable tokens by display width', () => {
  assert.deepEqual(apply([
    '| A | B |', '| --- | --- |', '| `a very long code span inside one cell` tail | y |',
  ], 2, 0, Action.WRAP_LONG_CELLS).lines, [
    '| A                          | B   |',
    '| -------------------------- | --- |',
    '| `a very long code span ins | y   |',
    '| ide one cell` tail         |     |',
  ]);
  assert.deepEqual(apply([
    '| A | B |', '| --- | --- |', `| ${'Z'.repeat(60)} | y |`,
  ], 2, 0, Action.WRAP_LONG_CELLS).lines, [
    '| A                          | B   |',
    '| -------------------------- | --- |',
    '| ZZZZZZZZZZZZZZZZZZZZZZZZZZ | y   |',
    '| ZZZZZZZZZZZZZZZZZZZZZZZZZZ |     |',
    '| ZZZZZZZZ                   |     |',
  ]);
});

test('fitting keeps the caret group intact when the caret sits on a continuation row', () => {
  const wrapped = [
    '| Key | Description        |',
    '| --- | ------------------ |',
    '| x   | alpha beta gamma   |',
    '|     | delta epsilon zeta |',
  ];
  const result = applyWrappedToWidth(wrapped, 3, 1, 28);
  assert.deepEqual(result.lines, wrapped);
  assert.equal(result.changed, false);
  assert.equal(result.targetRow, 3);
});

test('fitting below the minimum budget still produces a valid table', () => {
  assert.deepEqual(applyWrappedToWidth([
    '| Alpha | Beta |', '| --- | --- |', '| one two three | four five six |',
  ], 2, 0, 6).lines.slice(0, 4), [
    '| Alpha | Beta |',
    '| ----- | ---- |',
    '| o     | f    |',
    '| n     | o    |',
  ]);
});

test('rows and columns move without disturbing the separator', () => {
  assert.deepEqual(apply(['| A |', '| --- |', '| x |', '| y |'], 3, 0, Action.MOVE_ROW_UP).lines, [
    '| A   |', '| --- |', '| y   |', '| x   |',
  ]);
  const moved = apply(['| A | B |', '| --- | --- |', '| x | y |'], 2, 0, Action.MOVE_COLUMN_RIGHT);
  assert.deepEqual(moved.lines, ['| B   | A   |', '| --- | --- |', '| y   | x   |']);
  assert.equal(moved.targetColumn, 1);
});

test('sorting folds Greek and Cyrillic case the same way as the reference core', () => {
  assert.deepEqual(apply([
    '| K |', '| --- |', '| Ωμέγα |', '| Ёж |', '| альфа |', '| Beta |',
  ], 2, 0, Action.SORT_ASCENDING).lines, [
    '| K     |', '| ----- |', '| Beta  |', '| Ωμέγα |', '| альфа |', '| Ёж    |',
  ]);
});

test('quoted CSV fields keep embedded delimiters and doubled quotes', () => {
  assert.deepEqual(fromDelimited('"a,b","c""d"\ne,f').lines, [
    '| a,b | c"d |', '| --- | --- |', '| e   | f   |',
  ]);
});
