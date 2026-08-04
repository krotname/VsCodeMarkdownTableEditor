// SPDX-License-Identifier: GPL-3.0-or-later

// Faithful port of the shared Markdown table core used by the JetBrains plugin
// (MarkdownTableEngine.java) and the Notepad++ plugin (MarkdownTableCore.cpp). The three cores are
// kept behaviourally identical, so this file mirrors the reference structure and its Unicode tables
// instead of relying on the host runtime's Unicode data.

export enum Action {
  ALIGN = 'ALIGN',
  NEXT_CELL = 'NEXT_CELL',
  PREVIOUS_CELL = 'PREVIOUS_CELL',
  INSERT_ROW_BELOW = 'INSERT_ROW_BELOW',
  DELETE_ROW = 'DELETE_ROW',
  INSERT_COLUMN_RIGHT = 'INSERT_COLUMN_RIGHT',
  DELETE_COLUMN = 'DELETE_COLUMN',
  NARROW_COLUMN = 'NARROW_COLUMN',
  WIDEN_COLUMN = 'WIDEN_COLUMN',
  MOVE_ROW_UP = 'MOVE_ROW_UP',
  MOVE_ROW_DOWN = 'MOVE_ROW_DOWN',
  MOVE_COLUMN_LEFT = 'MOVE_COLUMN_LEFT',
  MOVE_COLUMN_RIGHT = 'MOVE_COLUMN_RIGHT',
  SORT_ASCENDING = 'SORT_ASCENDING',
  SORT_DESCENDING = 'SORT_DESCENDING',
  WRAP_LONG_CELLS = 'WRAP_LONG_CELLS',
}

export interface EditResult {
  changed: boolean;
  ok: boolean;
  message: string;
  lines: string[];
  targetRow: number;
  targetColumn: number;
  /** Character offset of the target cell content within `lines[targetRow]`. */
  targetColumnOffset: number;
}

export interface TableRange {
  found: boolean;
  firstRow: number;
  lastRow: number;
}

type Align = 'none' | 'left' | 'center' | 'right';

interface Row {
  cells: string[];
  separator: boolean;
  id: number;
}

interface Table {
  rows: Row[];
  alignments: Align[];
  columns: number;
  separatorRow: number;
  leadingPipe: boolean;
  trailingPipe: boolean;
}

interface FormatResult {
  lines: string[];
  targetRow: number;
  targetColumn: number;
  targetColumnOffset: number;
}

interface ResolvedTable {
  table: Table;
  sourceLines: string[];
  row: number;
  column: number;
}

interface SortKey {
  numeric: boolean;
  number: number;
  foldedText: string;
  text: string;
}

const HARD_WRAP_CELL_WIDTH = 26;
const MINIMUM_AUTO_WRAP_CELL_WIDTH = 1;

function emptyResult(): EditResult {
  return { changed: false, ok: false, message: '', lines: [], targetRow: 0, targetColumn: 0, targetColumnOffset: 0 };
}

function newTableState(): Table {
  return { rows: [], alignments: [], columns: 0, separatorRow: -1, leadingPipe: true, trailingPipe: true };
}

function at(text: string, index: number): string {
  return text[index] ?? '';
}

function codePointAt(text: string, index: number): number {
  return text.codePointAt(index) ?? 0;
}

function charCount(codePoint: number): number {
  return codePoint > 0xffff ? 2 : 1;
}

function isSpace(character: string): boolean {
  return character === ' ' || character === '\t' || character === '\r' || character === '\n';
}

function trimRange(value: string, first: number, last: number): string {
  while (first < last && isSpace(at(value, first))) first += 1;
  while (last > first && isSpace(at(value, last - 1))) last -= 1;
  return value.slice(first, last);
}

function trim(value: string): string {
  return trimRange(value, 0, value.length);
}

function isEscaped(line: string, position: number): boolean {
  let slashes = 0;
  while (position > slashes && at(line, position - slashes - 1) === '\\') slashes += 1;
  return slashes % 2 === 1;
}

function endsWithUnescapedPipeTrimmed(line: string): boolean {
  let last = line.length;
  while (last > 0 && isSpace(at(line, last - 1))) last -= 1;
  return last > 0 && at(line, last - 1) === '|' && !isEscaped(line, last - 1);
}

function startsWithUnescapedPipe(line: string): boolean {
  let position = 0;
  while (position < line.length && isSpace(at(line, position))) position += 1;
  return position < line.length && at(line, position) === '|' && !isEscaped(line, position);
}

export function isPotentialTableLine(line: string): boolean {
  for (let index = 0; index < line.length; index += 1) {
    if (at(line, index) === '|' && !isEscaped(line, index)) return true;
  }
  return false;
}

export function columnFromCursor(line: string, charColumn: number): number {
  let column = 0;
  let skippedLeadingPipe = false;
  const hasLeadingPipe = startsWithUnescapedPipe(line);
  const limit = Math.min(Math.max(charColumn, 0), line.length);
  for (let index = 0; index < limit; index += 1) {
    if (at(line, index) !== '|' || isEscaped(line, index)) continue;
    if (hasLeadingPipe && !skippedLeadingPipe) skippedLeadingPipe = true;
    else column += 1;
  }
  return column;
}

export function splitCells(line: string): string[] {
  let first = 0;
  while (first < line.length && isSpace(at(line, first))) first += 1;

  let last = line.length;
  while (last > first && isSpace(at(line, last - 1))) last -= 1;

  if (first < last && at(line, first) === '|') first += 1;
  if (last > first && at(line, last - 1) === '|' && !isEscaped(line, last - 1)) last -= 1;

  const cells: string[] = [];
  let start = first;
  for (let index = first; index < last; index += 1) {
    if (at(line, index) === '|' && !isEscaped(line, index)) {
      cells.push(trimRange(line, start, index));
      start = index + 1;
    }
  }
  cells.push(trimRange(line, start, last));
  return cells;
}

function isSeparatorCell(cell: string): boolean {
  const value = trim(cell);
  if (value.length === 0) return false;
  let hasDash = false;
  for (const character of value) {
    if (character === '-') {
      hasDash = true;
      continue;
    }
    if (character === ':' || isSpace(character)) continue;
    return false;
  }
  return hasDash;
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every(isSeparatorCell);
}

function isShortSeparatorLine(line: string): boolean {
  const value = trim(line);
  if (value.length === 0 || value[0] !== '|') return false;
  let hasRule = false;
  for (let index = 1; index < value.length; index += 1) {
    const character = at(value, index);
    if (character === '-' || character === '=') hasRule = true;
    if (character !== '-' && character !== '=' && character !== '|' && character !== ':' && !isSpace(character)) return false;
  }
  return hasRule;
}

export function isPotentialSeparatorLine(line: string): boolean {
  if (!isPotentialTableLine(line)) return false;
  return isSeparatorRow(splitCells(line)) || isShortSeparatorLine(line);
}

function isSeparatorForHeader(headerLine: string, separatorLine: string): boolean {
  if (!isPotentialSeparatorLine(separatorLine)) return false;
  return splitCells(headerLine).length === splitCells(separatorLine).length;
}

/**
 * Last row of the table that starts at `firstRow`. When both the header and the separator open with
 * a pipe, following rows must do the same, so prose that merely contains a pipe is never swallowed
 * into the table.
 */
function tableRangeEnd(lines: readonly string[], firstRow: number, separatorRow: number): number {
  const requireLeadingPipe = startsWithUnescapedPipe(lines[firstRow] ?? '')
    && startsWithUnescapedPipe(lines[separatorRow] ?? '');
  let lastRow = separatorRow;
  for (let row = separatorRow + 1; row < lines.length; row += 1) {
    const line = lines[row] ?? '';
    if (!isPotentialTableLine(line)) break;
    if (requireLeadingPipe && !startsWithUnescapedPipe(line)) break;
    lastRow = row;
  }
  return lastRow;
}

function tableRangeWithSeparatorAt(lines: readonly string[], separatorRow: number): TableRange | undefined {
  const firstRow = separatorRow - 1;
  const headerLine = lines[firstRow] ?? '';
  if (!isPotentialTableLine(headerLine) || !isSeparatorForHeader(headerLine, lines[separatorRow] ?? '')) {
    return undefined;
  }
  return { found: true, firstRow, lastRow: tableRangeEnd(lines, firstRow, separatorRow) };
}

function notFoundRange(): TableRange {
  return { found: false, firstRow: 0, lastRow: 0 };
}

/**
 * Every Markdown table in document order. Ranges never overlap: scanning resumes past the end of a
 * table even when its last row still carries pipes, so a trailing row is never reused as the header
 * of the next table.
 */
export function findTableRanges(lines: readonly string[]): TableRange[] {
  const ranges: TableRange[] = [];
  for (let separatorRow = 1; separatorRow < lines.length; separatorRow += 1) {
    const range = tableRangeWithSeparatorAt(lines, separatorRow);
    if (!range) continue;
    ranges.push(range);
    separatorRow = range.lastRow + 1;
  }
  return ranges;
}

export function findTableRange(lines: readonly string[], row: number): TableRange {
  if (lines.length === 0 || row < 0 || row >= lines.length) return notFoundRange();
  for (let separatorRow = 1; separatorRow < lines.length; separatorRow += 1) {
    const range = tableRangeWithSeparatorAt(lines, separatorRow);
    if (!range) continue;
    // Ranges are discovered in document order, so no later table can contain the row.
    if (row < range.firstRow) return notFoundRange();
    if (row <= range.lastRow) return range;
    separatorRow = range.lastRow + 1;
  }
  return notFoundRange();
}

function parseAlignment(cell: string): Align {
  const value = trim(cell);
  const left = value.length > 0 && value[0] === ':';
  const right = value.length > 0 && value[value.length - 1] === ':';
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return 'none';
}

function parseTable(lines: readonly string[]): Table {
  const table = newTableState();
  let leadingPipeRows = 0;
  let trailingPipeRows = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const cells = splitCells(line);
    table.columns = Math.max(table.columns, cells.length);
    table.rows.push({ cells, separator: false, id: index });
    if (startsWithUnescapedPipe(line)) leadingPipeRows += 1;
    if (endsWithUnescapedPipeTrimmed(line)) trailingPipeRows += 1;
  }

  if (lines.length > 0) {
    table.leadingPipe = leadingPipeRows * 2 >= lines.length;
    table.trailingPipe = trailingPipeRows * 2 >= lines.length;
  }

  // The scan starts at the second row: a table range always pairs a header with the separator
  // directly below it, so a header made of dashes such as "| --- | --- |" must stay a header
  // instead of being mistaken for the separator and rejecting the whole table.
  for (let index = 1; index < table.rows.length; index += 1) {
    const row = table.rows[index] as Row;
    if (isSeparatorRow(row.cells) || (index === 1 && isShortSeparatorLine(lines[index] ?? ''))) {
      table.separatorRow = index;
      row.separator = true;
      break;
    }
  }

  if (table.columns === 0) table.columns = 1;

  for (const row of table.rows) {
    while (row.cells.length < table.columns) row.cells.push('');
  }

  for (let index = 0; index < table.columns; index += 1) table.alignments.push('none');
  if (table.separatorRow !== -1) {
    const separator = table.rows[table.separatorRow] as Row;
    for (let index = 0; index < table.columns; index += 1) {
      table.alignments[index] = parseAlignment(separator.cells[index] ?? '');
    }
  }

  return table;
}

function isMarkdownTable(table: Table): boolean {
  return table.separatorRow > 0;
}

function clamp(value: number, maximum: number): number {
  return Math.max(Math.min(value, maximum), 0);
}

function resolveTable(lines: readonly string[], row: number, column: number): ResolvedTable | undefined {
  if (lines.length === 0) return undefined;
  const boundedRow = clamp(row, lines.length - 1);
  const range = findTableRange(lines, boundedRow);
  if (!range.found) return undefined;
  const sourceLines = lines.slice(range.firstRow, range.lastRow + 1);
  const table = parseTable(sourceLines);
  if (!isMarkdownTable(table)) return undefined;
  return {
    table,
    sourceLines,
    row: clamp(boundedRow - range.firstRow, table.rows.length - 1),
    column: clamp(column, table.columns - 1),
  };
}

function noTableFound(lines: readonly string[]): EditResult {
  const result = emptyResult();
  result.message = lines.length === 0 ? 'No table found' : 'No Markdown table found';
  return result;
}

function setResultFromFormat(result: EditResult, formatted: FormatResult): void {
  result.lines = formatted.lines;
  result.targetRow = formatted.targetRow;
  result.targetColumn = formatted.targetColumn;
  result.targetColumnOffset = formatted.targetColumnOffset;
}

function formattedResult(resolved: ResolvedTable, formatted: FormatResult): EditResult {
  const result = emptyResult();
  setResultFromFormat(result, formatted);
  result.ok = true;
  result.changed = formatted.lines.length !== resolved.sourceLines.length
    || formatted.lines.some((line, index) => line !== resolved.sourceLines[index]);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Display width
//
// The tables below mirror the static tables in the Notepad++ plugin core so every core measures
// identical widths regardless of the host runtime's Unicode version.
// ---------------------------------------------------------------------------------------------

function isWideCodePoint(cp: number): boolean {
  return cp === 0x2329 || cp === 0x232a
    || (cp >= 0x1100 && cp <= 0x115f)
    || (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f)
    || (cp >= 0xac00 && cp <= 0xd7a3)
    || (cp >= 0xf900 && cp <= 0xfaff)
    || (cp >= 0xfe10 && cp <= 0xfe19)
    || (cp >= 0xfe30 && cp <= 0xfe6f)
    || (cp >= 0xff00 && cp <= 0xff60)
    || (cp >= 0xffe0 && cp <= 0xffe6)
    || (cp >= 0x20000 && cp <= 0x3fffd);
}

function isEmojiPresentationCodePoint(cp: number): boolean {
  return (cp >= 0x1f000 && cp <= 0x1faff)
    || (cp >= 0x231a && cp <= 0x231b)
    || (cp >= 0x23e9 && cp <= 0x23ec)
    || cp === 0x23f0 || cp === 0x23f3
    || (cp >= 0x25fd && cp <= 0x25fe)
    || (cp >= 0x2614 && cp <= 0x2615)
    || (cp >= 0x2648 && cp <= 0x2653)
    || cp === 0x267f || cp === 0x2693 || cp === 0x26a1
    || (cp >= 0x26aa && cp <= 0x26ab)
    || (cp >= 0x26bd && cp <= 0x26be)
    || (cp >= 0x26c4 && cp <= 0x26c5)
    || cp === 0x26ce || cp === 0x26d4 || cp === 0x26ea
    || (cp >= 0x26f2 && cp <= 0x26f3)
    || cp === 0x26f5 || cp === 0x26fa || cp === 0x26fd
    || cp === 0x2705 || (cp >= 0x270a && cp <= 0x270b)
    || cp === 0x2728 || cp === 0x274c || cp === 0x274e
    || (cp >= 0x2753 && cp <= 0x2755)
    || cp === 0x2757 || (cp >= 0x2795 && cp <= 0x2797)
    || cp === 0x27b0 || cp === 0x27bf
    || (cp >= 0x2b1b && cp <= 0x2b1c)
    || cp === 0x2b50 || cp === 0x2b55
    || cp === 0x3030 || cp === 0x303d || cp === 0x3297 || cp === 0x3299;
}

function isEmojiVariationBase(cp: number): boolean {
  return isEmojiPresentationCodePoint(cp)
    || cp === 0x00a9 || cp === 0x00ae || cp === 0x203c || cp === 0x2049
    || cp === 0x2122 || cp === 0x2139
    || (cp >= 0x2194 && cp <= 0x2199)
    || (cp >= 0x21a9 && cp <= 0x21aa)
    || cp === 0x2328 || cp === 0x23cf
    || (cp >= 0x23ed && cp <= 0x23ef)
    || (cp >= 0x23f1 && cp <= 0x23f2)
    || (cp >= 0x23f8 && cp <= 0x23fa)
    || cp === 0x24c2 || (cp >= 0x25aa && cp <= 0x25ab)
    || cp === 0x25b6 || cp === 0x25c0
    || (cp >= 0x25fb && cp <= 0x25fe)
    || (cp >= 0x2600 && cp <= 0x27bf)
    || (cp >= 0x2934 && cp <= 0x2935)
    || (cp >= 0x2b05 && cp <= 0x2b07)
    || (cp >= 0x2b1b && cp <= 0x2b1c)
    || cp === 0x2b50 || cp === 0x2b55
    || cp === 0x3030 || cp === 0x303d || cp === 0x3297 || cp === 0x3299;
}

function isVariationSelector(cp: number): boolean {
  return (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
}

function isEmojiModifier(cp: number): boolean {
  return cp >= 0x1f3fb && cp <= 0x1f3ff;
}

function isEmojiTag(cp: number): boolean {
  return cp >= 0xe0020 && cp <= 0xe007f;
}

function isRegionalIndicator(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

function isKeycapBase(cp: number): boolean {
  return cp === 0x23 || cp === 0x2a || (cp >= 0x30 && cp <= 0x39);
}

// Mirrors the static table in the Notepad++ plugin core (MarkdownTableCore.cpp) so both cores
// measure identical widths regardless of the host runtime's Unicode version.
const COMBINING_RANGES: readonly number[] = [
  0x0300, 0x036F, 0x0483, 0x0489, 0x0591, 0x05BD, 0x05BF, 0x05BF,
  0x05C1, 0x05C2, 0x05C4, 0x05C5, 0x05C7, 0x05C7, 0x0610, 0x061A,
  0x064B, 0x065F, 0x0670, 0x0670, 0x06D6, 0x06DC, 0x06DF, 0x06E4,
  0x06E7, 0x06E8, 0x06EA, 0x06ED, 0x0711, 0x0711, 0x0730, 0x074A,
  0x07A6, 0x07B0, 0x07EB, 0x07F3, 0x0816, 0x0819, 0x081B, 0x0823,
  0x0825, 0x0827, 0x0829, 0x082D, 0x0859, 0x085B, 0x08D3, 0x08E1,
  0x08E3, 0x0903, 0x093A, 0x093C, 0x093E, 0x094F, 0x0951, 0x0957,
  0x0962, 0x0963, 0x0981, 0x0983, 0x09BC, 0x09BC, 0x09BE, 0x09C4,
  0x09C7, 0x09C8, 0x09CB, 0x09CD, 0x09D7, 0x09D7, 0x09E2, 0x09E3,
  0x0A01, 0x0A03, 0x0A3C, 0x0A3C, 0x0A3E, 0x0A42, 0x0A47, 0x0A48,
  0x0A4B, 0x0A4D, 0x0A51, 0x0A51, 0x0A70, 0x0A71, 0x0A75, 0x0A75,
  0x0A81, 0x0A83, 0x0ABC, 0x0ABC, 0x0ABE, 0x0AC5, 0x0AC7, 0x0AC9,
  0x0ACB, 0x0ACD, 0x0AE2, 0x0AE3, 0x0B01, 0x0B03, 0x0B3C, 0x0B3C,
  0x0B3E, 0x0B44, 0x0B47, 0x0B48, 0x0B4B, 0x0B4D, 0x0B56, 0x0B57,
  0x0B62, 0x0B63, 0x0B82, 0x0B82, 0x0BBE, 0x0BC2, 0x0BC6, 0x0BC8,
  0x0BCA, 0x0BCD, 0x0BD7, 0x0BD7, 0x0C00, 0x0C04, 0x0C3E, 0x0C44,
  0x0C46, 0x0C48, 0x0C4A, 0x0C4D, 0x0C55, 0x0C56, 0x0C62, 0x0C63,
  0x0C81, 0x0C83, 0x0CBC, 0x0CBC, 0x0CBE, 0x0CC4, 0x0CC6, 0x0CC8,
  0x0CCA, 0x0CCD, 0x0CD5, 0x0CD6, 0x0CE2, 0x0CE3, 0x0D00, 0x0D03,
  0x0D3B, 0x0D3C, 0x0D3E, 0x0D44, 0x0D46, 0x0D48, 0x0D4A, 0x0D4D,
  0x0D57, 0x0D57, 0x0D62, 0x0D63, 0x0D82, 0x0D83, 0x0DCA, 0x0DCA,
  0x0DCF, 0x0DD4, 0x0DD6, 0x0DD6, 0x0DD8, 0x0DDF, 0x0DF2, 0x0DF3,
  0x0E31, 0x0E31, 0x0E34, 0x0E3A, 0x0E47, 0x0E4E, 0x0EB1, 0x0EB1,
  0x0EB4, 0x0EBC, 0x0EC8, 0x0ECD, 0x0F18, 0x0F19, 0x0F35, 0x0F35,
  0x0F37, 0x0F37, 0x0F39, 0x0F39, 0x0F3E, 0x0F3F, 0x0F71, 0x0F84,
  0x0F86, 0x0F87, 0x0F8D, 0x0F97, 0x0F99, 0x0FBC, 0x0FC6, 0x0FC6,
  0x102B, 0x103E, 0x1056, 0x1059, 0x105E, 0x1060, 0x1062, 0x1064,
  0x1067, 0x106D, 0x1071, 0x1074, 0x1082, 0x108D, 0x108F, 0x108F,
  0x109A, 0x109D, 0x135D, 0x135F, 0x1712, 0x1715, 0x1732, 0x1734,
  0x1752, 0x1753, 0x1772, 0x1773, 0x17B4, 0x17D3, 0x17DD, 0x17DD,
  0x180B, 0x180D, 0x1885, 0x1886, 0x18A9, 0x18A9, 0x1920, 0x192B,
  0x1930, 0x193B, 0x1A17, 0x1A1B, 0x1A55, 0x1A5E, 0x1A60, 0x1A7C,
  0x1A7F, 0x1A7F, 0x1AB0, 0x1ACE, 0x1B00, 0x1B04, 0x1B34, 0x1B44,
  0x1B6B, 0x1B73, 0x1B80, 0x1B82, 0x1BA1, 0x1BAD, 0x1BE6, 0x1BF3,
  0x1C24, 0x1C37, 0x1CD0, 0x1CD2, 0x1CD4, 0x1CE8, 0x1CED, 0x1CED,
  0x1CF4, 0x1CF4, 0x1CF7, 0x1CF9, 0x1DC0, 0x1DFF, 0x20D0, 0x20FF,
  0x2CEF, 0x2CF1, 0x2D7F, 0x2D7F, 0x2DE0, 0x2DFF, 0x302A, 0x302F,
  0x3099, 0x309A, 0xA66F, 0xA672, 0xA674, 0xA67D, 0xA69E, 0xA69F,
  0xA6F0, 0xA6F1, 0xA802, 0xA802, 0xA806, 0xA806, 0xA80B, 0xA80B,
  0xA823, 0xA827, 0xA880, 0xA881, 0xA8B4, 0xA8C5, 0xA8E0, 0xA8F1,
  0xA926, 0xA92D, 0xA947, 0xA953, 0xA980, 0xA983, 0xA9B3, 0xA9C0,
  0xA9E5, 0xA9E5, 0xAA29, 0xAA36, 0xAA43, 0xAA43, 0xAA4C, 0xAA4D,
  0xAA7B, 0xAA7D, 0xAAB0, 0xAAB0, 0xAAB2, 0xAAB4, 0xAAB7, 0xAAB8,
  0xAABE, 0xAABF, 0xAAC1, 0xAAC1, 0xAAEB, 0xAAEF, 0xAAF5, 0xAAF6,
  0xABE3, 0xABEA, 0xABEC, 0xABED, 0xFB1E, 0xFB1E, 0xFE00, 0xFE0F,
  0xFE20, 0xFE2F, 0x101FD, 0x101FD, 0x102E0, 0x102E0, 0x10376, 0x1037A,
  0x10A01, 0x10A03, 0x10A05, 0x10A06, 0x10A0C, 0x10A0F, 0x10A38, 0x10A3A,
  0x10A3F, 0x10A3F, 0x10AE5, 0x10AE6, 0x10D24, 0x10D27, 0x10EAB, 0x10EAC,
  0x10F46, 0x10F50, 0x11000, 0x11002, 0x11038, 0x11046, 0x11070, 0x11070,
  0x11073, 0x11074, 0x1107F, 0x11082, 0x110B0, 0x110BA, 0x11100, 0x11102,
  0x11127, 0x11134, 0x11145, 0x11146, 0x11173, 0x11173, 0x11180, 0x11182,
  0x111B3, 0x111C0, 0x111C9, 0x111CC, 0x1122C, 0x11237, 0x1123E, 0x1123E,
  0x112DF, 0x112EA, 0x11300, 0x11303, 0x1133B, 0x1133C, 0x1133E, 0x11344,
  0x11347, 0x11348, 0x1134B, 0x1134D, 0x11357, 0x11357, 0x11362, 0x11363,
  0x11366, 0x1136C, 0x11370, 0x11374, 0x11435, 0x11446, 0x1145E, 0x1145E,
  0x114B0, 0x114C3, 0x115AF, 0x115B5, 0x115B8, 0x115C0, 0x11630, 0x11640,
  0x116AB, 0x116B7, 0x1171D, 0x1172B, 0x1182C, 0x1183A, 0x11930, 0x11935,
  0x11937, 0x11938, 0x1193B, 0x1193E, 0x11940, 0x11940, 0x11942, 0x11943,
  0x119D1, 0x119D7, 0x119DA, 0x119E0, 0x119E4, 0x119E4, 0x11A01, 0x11A0A,
  0x11A33, 0x11A39, 0x11A3B, 0x11A3E, 0x11A47, 0x11A47, 0x11A51, 0x11A5B,
  0x11A8A, 0x11A99, 0x11C2F, 0x11C36, 0x11C38, 0x11C3F, 0x11C92, 0x11CA7,
  0x11CA9, 0x11CB6, 0x11D31, 0x11D36, 0x11D3A, 0x11D3A, 0x11D3C, 0x11D3D,
  0x11D3F, 0x11D45, 0x11D47, 0x11D47, 0x11D8A, 0x11D8E, 0x11D90, 0x11D91,
  0x11D93, 0x11D97, 0x11EF3, 0x11EF6, 0x16AF0, 0x16AF4, 0x16B30, 0x16B36,
  0x16F4F, 0x16F4F, 0x16F51, 0x16F87, 0x16F8F, 0x16F92, 0x16FE4, 0x16FE4,
  0x1BC9D, 0x1BC9E, 0x1D165, 0x1D169, 0x1D16D, 0x1D172, 0x1D17B, 0x1D182,
  0x1D185, 0x1D18B, 0x1D1AA, 0x1D1AD, 0x1D242, 0x1D244, 0x1DA00, 0x1DA36,
  0x1DA3B, 0x1DA6C, 0x1DA75, 0x1DA75, 0x1DA84, 0x1DA84, 0x1DA9B, 0x1DA9F,
  0x1DAA1, 0x1DAAF, 0x1E000, 0x1E006, 0x1E008, 0x1E018, 0x1E01B, 0x1E021,
  0x1E023, 0x1E024, 0x1E026, 0x1E02A, 0x1E130, 0x1E136, 0x1E2EC, 0x1E2EF,
  0x1E8D0, 0x1E8D6, 0x1E944, 0x1E94A, 0xE0100, 0xE01EF,
];

function inCodePointRanges(cp: number, ranges: readonly number[]): boolean {
  for (let index = 0; index < ranges.length; index += 2) {
    if (cp < (ranges[index] as number)) return false;
    if (cp <= (ranges[index + 1] as number)) return true;
  }
  return false;
}

function isCombiningCodePoint(cp: number): boolean {
  return inCodePointRanges(cp, COMBINING_RANGES);
}

function isFormatCodePoint(cp: number): boolean {
  return cp === 0x00ad || cp === 0x061c || cp === 0x180e
    || (cp >= 0x200b && cp <= 0x200f)
    || (cp >= 0x202a && cp <= 0x202e)
    || (cp >= 0x2060 && cp <= 0x206f)
    || cp === 0xfeff
    || (cp >= 0xfff9 && cp <= 0xfffb)
    || cp === 0x110bd || cp === 0x110cd
    || (cp >= 0xe0000 && cp <= 0xe007f);
}

function isZeroWidthCodePoint(cp: number): boolean {
  return cp === 0
    || cp === 0x200c || cp === 0x200d
    || cp === 0x20e3
    || isFormatCodePoint(cp)
    || isCombiningCodePoint(cp)
    || isVariationSelector(cp)
    || isEmojiModifier(cp)
    || isEmojiTag(cp);
}

function codePointDisplayWidth(cp: number): number {
  if (isZeroWidthCodePoint(cp)) return 0;
  if (cp < 0x1100) return 1;
  return isWideCodePoint(cp) || isEmojiPresentationCodePoint(cp) ? 2 : 1;
}

function skipClusterModifiers(
  text: string,
  offset: number,
  baseCodePoint: number,
  clusterWidth: { value: number },
): number {
  while (offset < text.length) {
    const cp = codePointAt(text, offset);
    if (!isVariationSelector(cp) && !isCombiningCodePoint(cp) && !isEmojiModifier(cp) && !isEmojiTag(cp)) break;
    if (cp === 0xfe0f && isEmojiVariationBase(baseCodePoint)) clusterWidth.value = Math.max(clusterWidth.value, 2);
    offset += charCount(cp);
  }
  return offset;
}

function skipKeycapCluster(text: string, offset: number): number {
  let next = offset;
  while (next < text.length && isVariationSelector(codePointAt(text, next))) next += charCount(codePointAt(text, next));
  if (next < text.length && codePointAt(text, next) === 0x20e3) return next + charCount(0x20e3);
  return -1;
}

export function displayWidth(text: string): number {
  let width = 0;
  for (let offset = 0; offset < text.length;) {
    const cp = codePointAt(text, offset);
    offset += charCount(cp);

    if (isZeroWidthCodePoint(cp)) continue;

    if (isKeycapBase(cp)) {
      const keycapEnd = skipKeycapCluster(text, offset);
      if (keycapEnd !== -1) {
        width += 2;
        offset = keycapEnd;
        continue;
      }
    }

    if (isRegionalIndicator(cp) && offset < text.length) {
      const next = codePointAt(text, offset);
      if (isRegionalIndicator(next)) {
        width += 2;
        offset += charCount(next);
        continue;
      }
    }

    const clusterWidth = { value: codePointDisplayWidth(cp) };
    offset = skipClusterModifiers(text, offset, cp, clusterWidth);
    let joined = false;
    while (offset < text.length && codePointAt(text, offset) === 0x200d) {
      joined = true;
      offset += charCount(0x200d);
      if (offset >= text.length) break;
      const joinedCp = codePointAt(text, offset);
      offset += charCount(joinedCp);
      clusterWidth.value = Math.max(clusterWidth.value, codePointDisplayWidth(joinedCp));
      offset = skipClusterModifiers(text, offset, joinedCp, clusterWidth);
    }
    width += joined && clusterWidth.value > 0 ? Math.max(clusterWidth.value, 2) : clusterWidth.value;
  }
  return width;
}

// ---------------------------------------------------------------------------------------------
// Cell wrapping
// ---------------------------------------------------------------------------------------------

function startsMarkdownLinkAt(text: string, offset: number): boolean {
  if (offset >= text.length || at(text, offset) !== '[') return false;
  let closeBracket = offset + 1;
  while (closeBracket < text.length) {
    if (at(text, closeBracket) === ']' && !isEscaped(text, closeBracket)) break;
    closeBracket += charCount(codePointAt(text, closeBracket));
  }
  return closeBracket + 1 < text.length && at(text, closeBracket + 1) === '(';
}

function markdownLinkEnd(text: string, offset: number): number {
  let closeBracket = offset + 1;
  while (closeBracket < text.length) {
    if (at(text, closeBracket) === ']' && !isEscaped(text, closeBracket)) break;
    closeBracket += charCount(codePointAt(text, closeBracket));
  }
  if (closeBracket + 1 >= text.length || at(text, closeBracket + 1) !== '(') return offset + 1;

  let position = closeBracket + 2;
  let depth = 1;
  while (position < text.length) {
    const character = at(text, position);
    if (character === '(' && !isEscaped(text, position)) depth += 1;
    else if (character === ')' && !isEscaped(text, position)) {
      depth -= 1;
      if (depth === 0) return position + 1;
    }
    position += charCount(codePointAt(text, position));
  }
  return offset + 1;
}

function markdownCodeSpanEnd(text: string, offset: number): number {
  if (offset >= text.length || at(text, offset) !== '`') return offset + 1;

  let tickCount = 0;
  while (offset + tickCount < text.length && at(text, offset + tickCount) === '`') tickCount += 1;

  let position = offset + tickCount;
  while (position < text.length) {
    if (at(text, position) === '`') {
      let closingTicks = 0;
      while (position + closingTicks < text.length && at(text, position + closingTicks) === '`') closingTicks += 1;
      if (closingTicks === tickCount) return position + closingTicks;
      position += closingTicks;
    } else {
      position += charCount(codePointAt(text, position));
    }
  }
  return offset + tickCount;
}

function nextDisplayClusterEnd(text: string, offset: number): number {
  const baseCodePoint = codePointAt(text, offset);
  let end = offset + charCount(baseCodePoint);

  if (isKeycapBase(baseCodePoint)) {
    const keycapEnd = skipKeycapCluster(text, end);
    if (keycapEnd !== -1) return keycapEnd;
  }

  if (isRegionalIndicator(baseCodePoint) && end < text.length) {
    const next = codePointAt(text, end);
    if (isRegionalIndicator(next)) return end + charCount(next);
  }

  const ignoredWidth = { value: codePointDisplayWidth(baseCodePoint) };
  end = skipClusterModifiers(text, end, baseCodePoint, ignoredWidth);
  while (end < text.length && codePointAt(text, end) === 0x200d) {
    end += charCount(0x200d);
    if (end >= text.length) break;
    const joinedCodePoint = codePointAt(text, end);
    end += charCount(joinedCodePoint);
    end = skipClusterModifiers(text, end, joinedCodePoint, ignoredWidth);
  }
  return end;
}

function longTokenChunkEnd(token: string, offset: number, width: number): number {
  const targetWidth = Math.max(1, width);
  let end = offset;
  let chunkWidth = 0;
  while (end < token.length) {
    const after = nextDisplayClusterEnd(token, end);
    const clusterWidth = displayWidth(token.slice(end, after));
    if (end > offset && chunkWidth + clusterWidth > targetWidth) return end;
    chunkWidth += clusterWidth;
    end = after;
    if (chunkWidth >= targetWidth) return end;
  }
  return end > offset ? end : offset + charCount(codePointAt(token, offset));
}

function appendWrappedToken(segments: string[], current: { value: string }, token: string, width: number): void {
  const tokenWidth = displayWidth(token);
  const currentWidth = displayWidth(current.value);
  const candidateWidth = current.value.length === 0 ? tokenWidth : currentWidth + 1 + tokenWidth;
  if (tokenWidth <= width) {
    if (current.value.length > 0 && candidateWidth > width) {
      segments.push(current.value);
      current.value = '';
    }
    if (current.value.length > 0) current.value += ' ';
    current.value += token;
    return;
  }

  if (current.value.length > 0) {
    segments.push(current.value);
    current.value = '';
  }

  for (let offset = 0; offset < token.length;) {
    const end = longTokenChunkEnd(token, offset, width);
    const chunk = token.slice(offset, end);
    if (end < token.length) segments.push(chunk);
    else current.value += chunk;
    offset = end;
  }
}

function wrapCellSegments(cell: string, width: number): string[] {
  const value = trim(cell);
  if (value.length === 0) return [''];

  const segments: string[] = [];
  const current = { value: '' };
  let offset = 0;
  while (offset < value.length) {
    while (offset < value.length && isSpace(at(value, offset))) offset += 1;
    if (offset >= value.length) break;

    let end = offset;
    if (at(value, offset) === '`') end = markdownCodeSpanEnd(value, offset);
    else if (startsMarkdownLinkAt(value, offset)) end = markdownLinkEnd(value, offset);
    else {
      while (end < value.length && !isSpace(at(value, end))) end += charCount(codePointAt(value, end));
    }

    appendWrappedToken(segments, current, value.slice(offset, end), width);
    offset = end;
  }

  if (current.value.length > 0) segments.push(current.value);
  if (segments.length === 0) segments.push('');
  return segments;
}

function nextRowId(table: Table): number {
  let id = 0;
  for (const row of table.rows) id = Math.max(id, row.id + 1);
  return id;
}

/**
 * Splits data rows so that no cell exceeds its column width, keeping Markdown links and code spans
 * intact. Pass `undefined` widths to hard-wrap every column at {@link HARD_WRAP_CELL_WIDTH}.
 */
function wrapCellsToWidths(table: Table, originalTargetRow: number, columnWidths: number[] | undefined): number {
  if (table.separatorRow === -1 || (columnWidths !== undefined && columnWidths.length < table.columns)) {
    return originalTargetRow;
  }

  const wrappedRows: Row[] = [];
  let wrappedTargetRow = originalTargetRow;
  let nextId = nextRowId(table);
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex] as Row;
    if (rowIndex === originalTargetRow) wrappedTargetRow = wrappedRows.length;
    if (row.separator || rowIndex <= table.separatorRow) {
      wrappedRows.push(row);
      continue;
    }

    const cellSegments: string[][] = [];
    let segmentCount = 1;
    for (let column = 0; column < table.columns; column += 1) {
      const width = columnWidths === undefined ? HARD_WRAP_CELL_WIDTH : (columnWidths[column] as number);
      const segments = wrapCellSegments(row.cells[column] ?? '', width);
      cellSegments.push(segments);
      segmentCount = Math.max(segmentCount, segments.length);
    }

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const cells: string[] = [];
      for (let column = 0; column < table.columns; column += 1) {
        cells.push((cellSegments[column] as string[])[segmentIndex] ?? '');
      }
      wrappedRows.push({ cells, separator: false, id: segmentIndex === 0 ? row.id : nextId++ });
    }
  }

  table.rows = wrappedRows;
  return wrappedTargetRow;
}

// ---------------------------------------------------------------------------------------------
// Column widths
// ---------------------------------------------------------------------------------------------

function uniformWidths(table: Table, minimumWidth: number): number[] {
  return Array.from({ length: table.columns }, () => minimumWidth);
}

function growWidthsToFit(widths: number[], row: Row, columns: number): void {
  for (let column = 0; column < columns && column < row.cells.length; column += 1) {
    widths[column] = Math.max(widths[column] as number, displayWidth(row.cells[column] as string));
  }
}

/** Widths that fit every content cell, ignoring the separator row. */
function naturalColumnWidths(table: Table): number[] {
  const widths = uniformWidths(table, 3);
  for (const row of table.rows) {
    if (!row.separator) growWidthsToFit(widths, row, table.columns);
  }
  return widths;
}

/** Widths of the table as it is currently laid out, separator markers included. */
function currentColumnWidths(table: Table): number[] {
  const widths = uniformWidths(table, 1);
  for (const row of table.rows) growWidthsToFit(widths, row, table.columns);
  return widths;
}

/** Widths required by the header rows alone; used as the floor when shrinking columns. */
function headerColumnWidths(table: Table): number[] {
  const widths = uniformWidths(table, 3);
  const headerEnd = table.separatorRow === -1 ? table.rows.length : table.separatorRow;
  for (let rowIndex = 0; rowIndex < headerEnd && rowIndex < table.rows.length; rowIndex += 1) {
    growWidthsToFit(widths, table.rows[rowIndex] as Row, table.columns);
  }
  return widths;
}

/** Whether a cell holds anything but whitespace. */
function cellHasText(cell: string): boolean {
  for (const character of cell) {
    if (!isSpace(character)) return true;
  }
  return false;
}

function hasEmptyCellInColumn(table: Table, column: number): boolean {
  if (column < 0) return false;
  for (const row of table.rows) {
    if (!row.separator && column < row.cells.length && !cellHasText(row.cells[column] as string)) return true;
  }
  return false;
}

/**
 * Whether formatted rows must open with a pipe. A row whose first cell is empty would otherwise
 * start with padding followed by the pipe that separates the first two columns; re-parsing such a
 * row strips that pipe as a leading pipe and silently drops the first column.
 */
function rendersLeadingPipe(table: Table): boolean {
  return table.leadingPipe || hasEmptyCellInColumn(table, 0);
}

/**
 * Mirrors {@link rendersLeadingPipe} for the trailing edge. A single-column table without a leading
 * pipe also needs one, because it would otherwise render as plain text that is no longer a table.
 */
function rendersTrailingPipe(table: Table): boolean {
  return table.trailingPipe
    || hasEmptyCellInColumn(table, table.columns - 1)
    || (table.columns < 2 && !rendersLeadingPipe(table));
}

function formattedTableOverhead(table: Table): number {
  const leadingPipe = rendersLeadingPipe(table);
  const trailingPipe = rendersTrailingPipe(table);
  let overhead = leadingPipe ? 1 : 0;
  for (let column = 0; column < table.columns; column += 1) {
    if (column > 0) overhead += 2;
    if (leadingPipe || column > 0) overhead += 1;
    if (trailingPipe && column + 1 === table.columns) overhead += 2;
  }
  return overhead;
}

function widthSum(widths: readonly number[]): number {
  let sum = 0;
  for (const width of widths) sum += width;
  return sum;
}

function containsSpace(value: string): boolean {
  for (const character of value) {
    if (isSpace(character)) return true;
  }
  return false;
}

function wrappableColumns(table: Table, headerWidths: readonly number[]): boolean[] {
  const result = Array.from({ length: table.columns }, () => false);
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex] as Row;
    if (row.separator || rowIndex < table.separatorRow) continue;
    for (let column = 0; column < table.columns; column += 1) {
      const cell = row.cells[column] ?? '';
      const width = displayWidth(cell);
      const minimum = column < headerWidths.length ? (headerWidths[column] as number) : 3;
      if (width > minimum && containsSpace(cell)) result[column] = true;
    }
  }
  return result;
}

function reductionToSlackCap(
  widths: readonly number[],
  minimums: readonly number[],
  allowed: readonly boolean[],
  slackCap: number,
): number {
  let reduction = 0;
  for (let column = 0; column < widths.length; column += 1) {
    if (!allowed[column]) continue;
    const slack = Math.max(0, (widths[column] as number) - (minimums[column] as number));
    if (slack > slackCap) reduction += slack - slackCap;
  }
  return reduction;
}

function shrinkColumnsToBudget(
  widths: number[],
  minimums: readonly number[],
  allowed: readonly boolean[],
  budget: number,
): void {
  const requestedReduction = widthSum(widths) - budget;
  if (requestedReduction <= 0) return;

  let totalSlack = 0;
  let maxSlack = 0;
  for (let column = 0; column < widths.length; column += 1) {
    if (!allowed[column]) continue;
    const slack = Math.max(0, (widths[column] as number) - (minimums[column] as number));
    totalSlack += slack;
    maxSlack = Math.max(maxSlack, slack);
  }
  const reduction = Math.min(requestedReduction, totalSlack);
  if (reduction <= 0) return;

  let low = 0;
  let high = maxSlack;
  while (low < high) {
    const cap = low + Math.floor((high - low) / 2);
    if (reductionToSlackCap(widths, minimums, allowed, cap) <= reduction) high = cap;
    else low = cap + 1;
  }

  const slackCap = low;
  let remaining = reduction - reductionToSlackCap(widths, minimums, allowed, slackCap);
  for (let column = 0; column < widths.length; column += 1) {
    if (!allowed[column]) continue;
    const minimum = minimums[column] as number;
    const slack = Math.max(0, (widths[column] as number) - minimum);
    let targetSlack = Math.min(slack, slackCap);
    if (remaining > 0 && targetSlack === slackCap && targetSlack > 0) {
      targetSlack -= 1;
      remaining -= 1;
    }
    widths[column] = minimum + targetSlack;
  }
}

function bestGrowableColumn(
  widths: readonly number[],
  naturalWidths: readonly number[],
  allowed: readonly boolean[],
): number {
  let best = -1;
  let bestSlack = 0;
  for (let column = 0; column < widths.length; column += 1) {
    if (!allowed[column] || (widths[column] as number) >= (naturalWidths[column] as number)) continue;
    const slack = (naturalWidths[column] as number) - (widths[column] as number);
    if (best === -1 || slack > bestSlack) {
      best = column;
      bestSlack = slack;
    }
  }
  return best;
}

function targetColumnWidthsForTableWidth(table: Table, maxTableWidth: number): number[] {
  const naturalWidths = naturalColumnWidths(table);
  if (naturalWidths.length === 0) return naturalWidths;

  const overhead = formattedTableOverhead(table);
  const minimumBudget = naturalWidths.length;
  const budget = maxTableWidth > overhead ? Math.max(maxTableWidth - overhead, minimumBudget) : minimumBudget;
  if (widthSum(naturalWidths) <= budget) return naturalWidths;

  const headerWidths = headerColumnWidths(table);
  const canWrap = wrappableColumns(table, headerWidths);
  const widths: number[] = [];
  const minimums: number[] = [];
  for (let column = 0; column < naturalWidths.length; column += 1) {
    const headerWidth = column < headerWidths.length ? (headerWidths[column] as number) : 3;
    const natural = naturalWidths[column] as number;
    if (canWrap[column]) {
      const minimum = Math.min(natural, Math.max(headerWidth, MINIMUM_AUTO_WRAP_CELL_WIDTH));
      minimums.push(minimum);
      widths.push(minimum);
    } else {
      minimums.push(Math.min(natural, Math.max(headerWidth, 3)));
      widths.push(natural);
    }
  }

  if (widthSum(widths) > budget) shrinkColumnsToBudget(widths, minimums, canWrap, budget);

  if (widthSum(widths) > budget) {
    const allColumns = widths.map(() => true);
    const hardMinimums = widths.map((width) => Math.min(width, MINIMUM_AUTO_WRAP_CELL_WIDTH));
    shrinkColumnsToBudget(widths, hardMinimums, allColumns, budget);
  }

  while (widthSum(widths) < budget) {
    const column = bestGrowableColumn(widths, naturalWidths, canWrap);
    if (column === -1) break;
    widths[column] = (widths[column] as number) + 1;
  }
  return widths;
}

function minimumManualColumnWidth(table: Table, column: number, naturalWidths: readonly number[]): number {
  const headerWidths = headerColumnWidths(table);
  const headerWidth = column < headerWidths.length ? (headerWidths[column] as number) : 3;
  const naturalWidth = column < naturalWidths.length ? (naturalWidths[column] as number) : headerWidth;
  return Math.min(naturalWidth, Math.max(headerWidth, 3));
}

function resizeColumnWidth(
  table: Table,
  originalTargetRow: number,
  column: number,
  widen: boolean,
  columnWidths: number[],
): number {
  if (table.separatorRow === -1 || column >= table.columns) return originalTargetRow;

  columnWidths.length = 0;
  columnWidths.push(...currentColumnWidths(table));
  const unwrappedRow = unwrapContinuationRows(table, originalTargetRow);
  if (column >= columnWidths.length) return unwrappedRow;

  const naturalWidths = naturalColumnWidths(table);
  if (widen) {
    columnWidths[column] = (columnWidths[column] as number) + 1;
  } else {
    const minimumWidth = minimumManualColumnWidth(table, column, naturalWidths);
    if ((columnWidths[column] as number) > minimumWidth) columnWidths[column] = (columnWidths[column] as number) - 1;
  }

  return wrapCellsToWidths(table, unwrappedRow, columnWidths);
}

// ---------------------------------------------------------------------------------------------
// Continuation rows
// ---------------------------------------------------------------------------------------------

function nonEmptyCellCount(row: Row): number {
  let count = 0;
  for (const cell of row.cells) {
    if (cellHasText(cell)) count += 1;
  }
  return count;
}

/**
 * Column widths a wrap would have used, measured only over body rows that fill every column.
 *
 * Header rows are never wrapped, so a header wider than the wrap target would report a width the
 * body was never split at. A continuation row must leave at least one column empty, so measuring
 * the candidates too would let a hand-split row widen the very column it is tested against.
 */
function wrappingReferenceWidths(table: Table): number[] {
  const widths = uniformWidths(table, 1);
  for (let rowIndex = table.separatorRow + 1; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex] as Row;
    if (row.separator || nonEmptyCellCount(row) !== table.columns) continue;
    growWidthsToFit(widths, row, table.columns);
  }
  return widths;
}

/**
 * Whether `row` could have been produced by wrapping the cells of `previousSegment` at `widths`.
 *
 * Wrapping leaves a checkable trace. It fills a cell's segments from the top, so a segment never
 * sits under an empty one, and it never splits a cell that fits, so a cell that would still have
 * fitted after the previous segment was never wrapped away from it. A row that breaks either rule
 * is ordinary sparse data that merely looks like wrapping output, and merging it would destroy a
 * record.
 *
 * The second test deliberately measures the whole cell rather than its first token. A segment can
 * be a fragment of a construct that was hard-split mid-token, and re-tokenising such a fragment
 * would under-measure it and reject a genuine continuation.
 */
function couldFollowWrappedSegment(
  previousSegment: Row | undefined,
  row: Row,
  columns: number,
  widths: readonly number[],
): boolean {
  if (previousSegment === undefined || previousSegment.cells.length < columns) return false;

  for (let column = 0; column < columns; column += 1) {
    const cell = row.cells[column] as string;
    if (!cellHasText(cell)) continue;

    const previousCell = previousSegment.cells[column] as string;
    if (!cellHasText(previousCell)) return false;

    const width = column < widths.length ? (widths[column] as number) : 0;
    if (displayWidth(previousCell) + 1 + displayWidth(trim(cell)) <= width) return false;
  }
  return true;
}

function isLikelyContinuationRow(
  row: Row,
  baseRow: Row,
  previousSegment: Row | undefined,
  columns: number,
  widths: readonly number[],
): boolean {
  if (columns < 2 || row.cells.length < columns || baseRow.cells.length < columns) return false;

  const nonEmpty = nonEmptyCellCount(row);
  if (nonEmpty === 0 || nonEmpty === columns) return false;

  let emptyWhereBaseHasText = 0;
  for (let column = 0; column < columns; column += 1) {
    if (!cellHasText(row.cells[column] as string) && cellHasText(baseRow.cells[column] as string)) {
      emptyWhereBaseHasText += 1;
    }
  }

  const requiredAnchors = Math.max(1, Math.floor(columns / 3));
  if (emptyWhereBaseHasText < requiredAnchors) return false;

  return couldFollowWrappedSegment(previousSegment, row, columns, widths);
}

function copyRow(row: Row): Row {
  return { cells: [...row.cells], separator: row.separator, id: row.id };
}

function isAsciiAlphaNumeric(codePoint: number): boolean {
  return (codePoint >= 0x41 && codePoint <= 0x5a)
    || (codePoint >= 0x61 && codePoint <= 0x7a)
    || (codePoint >= 0x30 && codePoint <= 0x39);
}

function isWordContinuationStart(value: string): boolean {
  if (value.length === 0) return false;
  const codePoint = codePointAt(value, 0);
  return isAsciiAlphaNumeric(codePoint) || codePoint === 0x5f || codePoint >= 0x80;
}

function codePointBefore(value: string, index: number): number {
  const previous = value.charCodeAt(index - 1);
  if (previous >= 0xdc00 && previous <= 0xdfff && index >= 2) {
    const high = value.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return (high - 0xd800) * 0x400 + (previous - 0xdc00) + 0x10000;
  }
  return previous;
}

function isWordContinuationEnd(value: string): boolean {
  const trimmed = trim(value);
  if (trimmed.length === 0) return false;
  const codePoint = codePointBefore(trimmed, trimmed.length);
  return isAsciiAlphaNumeric(codePoint) || codePoint === 0x5f || codePoint === 0x2d || codePoint >= 0x80;
}

function firstToken(value: string): string {
  let end = 0;
  while (end < value.length && !isSpace(at(value, end))) end += charCount(codePointAt(value, end));
  return value.slice(0, end);
}

function looksLikeSplitWordRemainder(token: string): boolean {
  if (token.length === 0) return false;
  const width = displayWidth(token);
  const first = codePointAt(token, 0);
  if (first >= 0x80) return width <= 4;
  return width <= 2;
}

function shouldJoinContinuationWithoutSpace(target: string, continuation: string): boolean {
  const targetValue = trim(target);
  const continuationValue = trim(continuation);
  if (targetValue.length === 0 || continuationValue.length === 0) return false;
  if (!isWordContinuationEnd(targetValue) || !isWordContinuationStart(continuationValue)) return false;

  const targetEnd = codePointBefore(targetValue, targetValue.length);
  const continuationStart = codePointAt(continuationValue, 0);
  if (targetEnd === 0x2d && (isAsciiAlphaNumeric(continuationStart) || continuationStart >= 0x80)) return true;

  return looksLikeSplitWordRemainder(firstToken(continuationValue));
}

function appendContinuationCell(target: string, continuation: string): string {
  const value = trim(continuation);
  if (value.length === 0) return target;
  if (trim(target).length > 0 && !shouldJoinContinuationWithoutSpace(target, value)) return `${target} ${value}`;
  if (trim(target).length > 0) return target + value;
  return value;
}

function continuationRowsToPreserve(table: Table, originalTargetRow: number): boolean[] {
  const preserve = Array.from({ length: table.rows.length }, () => false);
  if (table.separatorRow === -1 || originalTargetRow < 0 || originalTargetRow >= table.rows.length) return preserve;

  const continuationBaseForRow = Array.from({ length: table.rows.length }, () => -1);
  const widths = wrappingReferenceWidths(table);
  let baseRowIndex = -1;
  let baseRow: Row | undefined;
  let previousSegment: Row | undefined;
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex] as Row;
    if (row.separator || rowIndex <= table.separatorRow || baseRowIndex === -1 || baseRow === undefined
      || !isLikelyContinuationRow(row, baseRow, previousSegment, table.columns, widths)) {
      if (!row.separator && rowIndex > table.separatorRow) {
        baseRowIndex = rowIndex;
        baseRow = copyRow(row);
        previousSegment = copyRow(row);
      }
      continue;
    }

    continuationBaseForRow[rowIndex] = baseRowIndex;
    for (let column = 0; column < table.columns; column += 1) {
      baseRow.cells[column] = appendContinuationCell(baseRow.cells[column] as string, row.cells[column] as string);
    }
    previousSegment = copyRow(row);
  }

  const targetBaseRow = continuationBaseForRow[originalTargetRow] as number;
  if (targetBaseRow === -1) return preserve;
  for (let rowIndex = 0; rowIndex < continuationBaseForRow.length; rowIndex += 1) {
    preserve[rowIndex] = continuationBaseForRow[rowIndex] === targetBaseRow;
  }
  return preserve;
}

function unwrapContinuationRows(table: Table, originalTargetRow: number): number {
  if (table.separatorRow === -1) return originalTargetRow;

  const preserveContinuationRows = continuationRowsToPreserve(table, originalTargetRow);
  const widths = wrappingReferenceWidths(table);
  const unwrappedRows: Row[] = [];
  let targetRow = originalTargetRow;
  let baseRowIndex = -1;
  let previousSegment: Row | undefined;
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex] as Row;
    if (row.separator || rowIndex <= table.separatorRow || preserveContinuationRows[rowIndex] || baseRowIndex === -1
      || !isLikelyContinuationRow(row, unwrappedRows[baseRowIndex] as Row, previousSegment, table.columns, widths)) {
      if (rowIndex === originalTargetRow) targetRow = unwrappedRows.length;
      if (!row.separator && rowIndex > table.separatorRow) {
        baseRowIndex = unwrappedRows.length;
        previousSegment = copyRow(row);
      }
      unwrappedRows.push(row);
      continue;
    }

    if (rowIndex === originalTargetRow) targetRow = baseRowIndex;

    const baseRow = unwrappedRows[baseRowIndex] as Row;
    for (let column = 0; column < table.columns; column += 1) {
      baseRow.cells[column] = appendContinuationCell(baseRow.cells[column] as string, row.cells[column] as string);
    }
    previousSegment = copyRow(row);
  }

  table.rows = unwrappedRows;
  return targetRow;
}

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------

function spaces(count: number): string {
  return ' '.repeat(Math.max(count, 0));
}

function separatorCell(align: Align, width: number, minimumWidth: number): string {
  const target = Math.max(width, minimumWidth);
  if (target <= 1) return '-';
  if (target === 2) {
    if (align === 'left' || align === 'center') return ':-';
    if (align === 'right') return '-:';
    return '--';
  }
  if (align === 'center') return `:${'-'.repeat(target - 2)}:`;
  if (align === 'left') return `:${'-'.repeat(target - 1)}`;
  if (align === 'right') return `${'-'.repeat(target - 1)}:`;
  return '-'.repeat(target);
}

function paddedCell(cell: string, align: Align, width: number): { value: string; contentOffset: number } {
  const current = displayWidth(cell);
  const pad = width > current ? width - current : 0;
  let leftPad = 0;
  let rightPad = pad;
  if (align === 'right') {
    leftPad = pad;
    rightPad = 0;
  } else if (align === 'center') {
    leftPad = Math.floor(pad / 2);
    rightPad = pad - leftPad;
  }
  return { value: spaces(leftPad) + cell + spaces(rightPad), contentOffset: leftPad };
}

function formatTable(
  table: Table,
  targetRow: number,
  targetColumn: number,
  minimumWidths?: readonly number[],
): FormatResult {
  const separatorMinimumWidth = minimumWidths === undefined ? 3 : 1;
  const widths = uniformWidths(table, separatorMinimumWidth);
  for (const row of table.rows) {
    if (!row.separator) growWidthsToFit(widths, row, table.columns);
  }
  if (minimumWidths !== undefined) {
    for (let column = 0; column < table.columns && column < minimumWidths.length; column += 1) {
      widths[column] = Math.max(widths[column] as number, minimumWidths[column] as number);
    }
  }

  const result: FormatResult = {
    lines: [],
    targetRow: targetRow < table.rows.length ? targetRow : 0,
    targetColumn: targetColumn < table.columns ? targetColumn : 0,
    targetColumnOffset: 0,
  };

  const leadingPipe = rendersLeadingPipe(table);
  const trailingPipe = rendersTrailingPipe(table);
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex] as Row;
    let line = leadingPipe ? '|' : '';

    for (let column = 0; column < table.columns; column += 1) {
      if (column > 0) line += ' |';
      if (leadingPipe || column > 0) line += ' ';

      if (row.separator) {
        const value = separatorCell(table.alignments[column] ?? 'none', widths[column] as number, separatorMinimumWidth);
        const valueStart = line.length;
        line += value;
        if (rowIndex === result.targetRow && column === result.targetColumn) result.targetColumnOffset = valueStart;
      } else {
        const padded = paddedCell(row.cells[column] ?? '', table.alignments[column] ?? 'none', widths[column] as number);
        const cellStart = line.length;
        line += padded.value;
        if (rowIndex === result.targetRow && column === result.targetColumn) {
          result.targetColumnOffset = cellStart + padded.contentOffset;
        }
      }

      if (trailingPipe && column + 1 === table.columns) line += ' |';
    }

    result.lines.push(line);
  }

  return result;
}

// ---------------------------------------------------------------------------------------------
// Structural edits
// ---------------------------------------------------------------------------------------------

function nextEditableRow(table: Table, row: number): number {
  let next = row + 1;
  while (next < table.rows.length && (table.rows[next] as Row).separator) next += 1;
  return next;
}

function previousEditableRow(table: Table, row: number): number {
  if (row === 0) return 0;
  let previous = row - 1;
  while (previous >= 0 && (table.rows[previous] as Row).separator) previous -= 1;
  return previous >= 0 ? previous : row;
}

function editableRowCount(table: Table): number {
  let count = 0;
  for (const row of table.rows) {
    if (!row.separator) count += 1;
  }
  return count;
}

function canDeleteRow(table: Table, row: number): boolean {
  if ((table.rows[row] as Row).separator || editableRowCount(table) <= 1) return false;
  // Deleting the row directly above the separator would leave the table without a header.
  return table.separatorRow === -1 || row + 1 !== table.separatorRow;
}

function closestEditableRow(table: Table, row: number): number {
  if (table.rows.length === 0) return 0;
  if (row >= table.rows.length) row = table.rows.length - 1;
  if (!(table.rows[row] as Row).separator) return row;

  for (let next = row + 1; next < table.rows.length; next += 1) {
    if (!(table.rows[next] as Row).separator) return next;
  }

  while (row > 0) {
    row -= 1;
    if (!(table.rows[row] as Row).separator) return row;
  }

  return 0;
}

function rowById(table: Table, id: number, fallbackRow: number): number {
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    if ((table.rows[rowIndex] as Row).id === id) return rowIndex;
  }
  return closestEditableRow(table, fallbackRow);
}

function insertEmptyRow(table: Table, index: number): void {
  const row: Row = { cells: Array.from({ length: table.columns }, () => ''), separator: false, id: nextRowId(table) };
  if (index > table.rows.length) index = table.rows.length;
  table.rows.splice(index, 0, row);
  if (table.separatorRow !== -1 && index <= table.separatorRow) table.separatorRow += 1;
}

function removeColumn(table: Table, column: number): void {
  if (table.columns <= 1 || column >= table.columns) return;
  for (const row of table.rows) row.cells.splice(column, 1);
  table.alignments.splice(column, 1);
  table.columns -= 1;
}

function insertColumn(table: Table, column: number): void {
  if (column > table.columns) column = table.columns;
  for (const row of table.rows) row.cells.splice(column, 0, '');
  table.alignments.splice(column, 0, 'none');
  table.columns += 1;
}

function moveColumn(table: Table, from: number, to: number): void {
  if (from >= table.columns || to >= table.columns || from === to) return;
  for (const row of table.rows) {
    const [value = ''] = row.cells.splice(from, 1);
    row.cells.splice(to, 0, value);
  }
  const [align = 'none'] = table.alignments.splice(from, 1);
  table.alignments.splice(to, 0, align);
}

function canSwapRows(table: Table, row: number, otherRow: number): boolean {
  return otherRow >= 0
    && otherRow < table.rows.length
    && !(table.rows[row] as Row).separator
    && !(table.rows[otherRow] as Row).separator;
}

function swapRows(table: Table, row: number, otherRow: number): void {
  const first = table.rows[row] as Row;
  table.rows[row] = table.rows[otherRow] as Row;
  table.rows[otherRow] = first;
}

// ---------------------------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------------------------

function isAsciiDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

// Both plugin cores accept the same strict grammar: [+-]? digits [. digits?] | [+-]? . digits,
// with an optional [eE][+-]digits exponent. Hex floats, "Infinity"/"NaN" spellings, and
// language-specific suffixes like "1.5f" stay textual so every core sorts them identically.
function isStrictDecimalNumber(value: string): boolean {
  const length = value.length;
  let position = 0;
  if (position < length && (at(value, position) === '+' || at(value, position) === '-')) position += 1;
  let mantissaDigits = 0;
  while (position < length && isAsciiDigit(at(value, position))) {
    position += 1;
    mantissaDigits += 1;
  }
  if (position < length && at(value, position) === '.') {
    position += 1;
    while (position < length && isAsciiDigit(at(value, position))) {
      position += 1;
      mantissaDigits += 1;
    }
  }
  if (mantissaDigits === 0) return false;
  if (position < length && (at(value, position) === 'e' || at(value, position) === 'E')) {
    position += 1;
    if (position < length && (at(value, position) === '+' || at(value, position) === '-')) position += 1;
    let exponentDigits = 0;
    while (position < length && isAsciiDigit(at(value, position))) {
      position += 1;
      exponentDigits += 1;
    }
    if (exponentDigits === 0) return false;
  }
  return position === length;
}

function parseNumber(value: string): number | undefined {
  return isStrictDecimalNumber(value) ? Number(value) : undefined;
}

function isSortIgnorableCodePoint(cp: number): boolean {
  return isCombiningCodePoint(cp)
    || isVariationSelector(cp)
    || isEmojiModifier(cp)
    || isEmojiTag(cp)
    || isFormatCodePoint(cp);
}

function foldCaseCodePoint(cp: number): number {
  if (cp >= 0x41 && cp <= 0x5a) return cp + 0x20;
  if (cp >= 0x00c0 && cp <= 0x00d6) return cp + 0x20;
  if (cp >= 0x00d8 && cp <= 0x00de) return cp + 0x20;
  if (cp === 0x0178) return 0x00ff;
  if (cp >= 0x0391 && cp <= 0x03a1) return cp + 0x20;
  if (cp >= 0x03a3 && cp <= 0x03ab) return cp + 0x20;
  if (cp >= 0x0400 && cp <= 0x040f) return cp + 0x50;
  if (cp >= 0x0410 && cp <= 0x042f) return cp + 0x20;
  switch (cp) {
    case 0x0386: return 0x03ac;
    case 0x0388: return 0x03ad;
    case 0x0389: return 0x03ae;
    case 0x038a: return 0x03af;
    case 0x038c: return 0x03cc;
    case 0x038e: return 0x03cd;
    case 0x038f: return 0x03ce;
    default: return cp;
  }
}

function buildLatinSortFolds(): Map<number, string> {
  const folds = new Map<number, string>();
  const add = (codePoints: readonly number[], replacement: string): void => {
    for (const cp of codePoints) folds.set(cp, replacement);
  };
  add([0x00c0, 0x00c1, 0x00c2, 0x00c3, 0x00c4, 0x00c5, 0x00e0, 0x00e1, 0x00e2, 0x00e3, 0x00e4, 0x00e5], 'a');
  add([0x00c6, 0x00e6], 'ae');
  add([0x00c7, 0x00e7], 'c');
  add([0x00d0, 0x00f0], 'd');
  add([0x00c8, 0x00c9, 0x00ca, 0x00cb, 0x00e8, 0x00e9, 0x00ea, 0x00eb], 'e');
  add([0x00cc, 0x00cd, 0x00ce, 0x00cf, 0x00ec, 0x00ed, 0x00ee, 0x00ef], 'i');
  add([0x00d1, 0x00f1], 'n');
  add([0x00d2, 0x00d3, 0x00d4, 0x00d5, 0x00d6, 0x00d8, 0x00f2, 0x00f3, 0x00f4, 0x00f5, 0x00f6, 0x00f8], 'o');
  add([0x00d9, 0x00da, 0x00db, 0x00dc, 0x00f9, 0x00fa, 0x00fb, 0x00fc], 'u');
  add([0x00dd, 0x00fd, 0x00ff], 'y');
  add([0x00de, 0x00fe], 'th');
  add([0x00df], 'ss');
  return folds;
}

const LATIN_SORT_FOLDS = buildLatinSortFolds();

function foldCaseForSort(value: string): string {
  let folded = '';
  for (let offset = 0; offset < value.length;) {
    const cp = codePointAt(value, offset);
    offset += charCount(cp);
    if (isSortIgnorableCodePoint(cp)) continue;
    folded += LATIN_SORT_FOLDS.get(cp) ?? String.fromCodePoint(foldCaseCodePoint(cp));
  }
  return folded;
}

function compareCodePointOrder(left: string, right: string): number {
  let leftOffset = 0;
  let rightOffset = 0;
  while (leftOffset < left.length && rightOffset < right.length) {
    const leftCp = codePointAt(left, leftOffset);
    const rightCp = codePointAt(right, rightOffset);
    if (leftCp !== rightCp) return leftCp < rightCp ? -1 : 1;
    leftOffset += charCount(leftCp);
    rightOffset += charCount(rightCp);
  }
  if (leftOffset < left.length) return 1;
  if (rightOffset < right.length) return -1;
  return 0;
}

function makeSortKey(value: string): SortKey {
  const text = trim(value);
  const number = parseNumber(text);
  return { numeric: number !== undefined, number: number ?? 0, foldedText: foldCaseForSort(text), text };
}

function compareSortKeys(left: SortKey, right: SortKey): number {
  if (left.numeric !== right.numeric) return left.numeric ? -1 : 1;
  if (left.numeric) {
    if (left.number < right.number) return -1;
    if (left.number > right.number) return 1;
  }
  const text = compareCodePointOrder(left.foldedText, right.foldedText);
  if (text !== 0) return text;
  return compareCodePointOrder(left.text, right.text);
}

function sortRows(table: Table, column: number, ascending: boolean, currentRowId: number, fallbackRow: number): number {
  if (column >= table.columns || table.rows.length === 0) return closestEditableRow(table, fallbackRow);

  const firstDataRow = table.separatorRow + 1;
  if (firstDataRow >= table.rows.length) return rowById(table, currentRowId, fallbackRow);

  const entries = table.rows.slice(firstDataRow).map((row) => ({ row, key: makeSortKey(row.cells[column] ?? '') }));
  entries.sort((left, right) => {
    const compared = compareSortKeys(left.key, right.key);
    return ascending ? compared : -compared;
  });

  for (let index = 0; index < entries.length; index += 1) {
    table.rows[firstDataRow + index] = (entries[index] as { row: Row }).row;
  }
  return rowById(table, currentRowId, firstDataRow);
}

// ---------------------------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------------------------

/** Caret position and width constraints produced by one editing action. */
interface ActionOutcome {
  targetRow: number;
  targetColumn: number;
  minimumWidths?: number[];
}

function applyAction(resolved: ResolvedTable, action: Action): ActionOutcome {
  const { table, row, column } = resolved;
  const outcome: ActionOutcome = { targetRow: row, targetColumn: column };
  const currentRowId = (table.rows[row] as Row).id;

  switch (action) {
    case Action.NEXT_CELL:
      if (column + 1 < table.columns) outcome.targetColumn = column + 1;
      else {
        outcome.targetColumn = 0;
        outcome.targetRow = nextEditableRow(table, row);
        if (outcome.targetRow >= table.rows.length) insertEmptyRow(table, table.rows.length);
      }
      break;
    case Action.PREVIOUS_CELL:
      if (column > 0) outcome.targetColumn = column - 1;
      else {
        outcome.targetColumn = table.columns - 1;
        outcome.targetRow = previousEditableRow(table, row);
      }
      break;
    case Action.INSERT_ROW_BELOW:
      outcome.targetRow = nextEditableRow(table, row);
      insertEmptyRow(table, outcome.targetRow);
      break;
    case Action.DELETE_ROW:
      if (canDeleteRow(table, row)) {
        table.rows.splice(row, 1);
        if (table.separatorRow !== -1 && row < table.separatorRow) table.separatorRow -= 1;
        outcome.targetRow = closestEditableRow(table, row);
      }
      break;
    case Action.INSERT_COLUMN_RIGHT:
      insertColumn(table, column + 1);
      outcome.targetColumn = column + 1;
      break;
    case Action.DELETE_COLUMN:
      removeColumn(table, column);
      outcome.targetColumn = Math.min(column, table.columns - 1);
      break;
    case Action.NARROW_COLUMN:
    case Action.WIDEN_COLUMN: {
      const minimumWidths: number[] = [];
      outcome.minimumWidths = minimumWidths;
      outcome.targetRow = resizeColumnWidth(table, row, column, action === Action.WIDEN_COLUMN, minimumWidths);
      break;
    }
    case Action.MOVE_ROW_UP:
      if (canSwapRows(table, row, row - 1)) {
        swapRows(table, row, row - 1);
        outcome.targetRow = row - 1;
      }
      break;
    case Action.MOVE_ROW_DOWN:
      if (canSwapRows(table, row, row + 1)) {
        swapRows(table, row, row + 1);
        outcome.targetRow = row + 1;
      }
      break;
    case Action.MOVE_COLUMN_LEFT:
      if (column > 0) {
        moveColumn(table, column, column - 1);
        outcome.targetColumn = column - 1;
      }
      break;
    case Action.MOVE_COLUMN_RIGHT:
      if (column + 1 < table.columns) {
        moveColumn(table, column, column + 1);
        outcome.targetColumn = column + 1;
      }
      break;
    case Action.SORT_ASCENDING:
    case Action.SORT_DESCENDING:
      outcome.targetRow = sortRows(table, column, action === Action.SORT_ASCENDING, currentRowId, row);
      break;
    case Action.WRAP_LONG_CELLS:
      outcome.targetRow = wrapCellsToWidths(table, row, undefined);
      break;
    case Action.ALIGN:
      break;
  }
  return outcome;
}

/**
 * Applies an editing action to the table containing `row`. Out-of-range coordinates are clamped
 * into the table rather than rejected; the result carries only the rewritten table, so callers add
 * {@link TableRange.firstRow} to map `targetRow` back onto the document.
 */
export function apply(lines: readonly string[], row: number, column: number, action: Action): EditResult {
  const resolved = resolveTable(lines, row, column);
  if (!resolved) return noTableFound(lines);

  const outcome = applyAction(resolved, action);
  const formatted = formatTable(resolved.table, outcome.targetRow, outcome.targetColumn, outcome.minimumWidths);
  return formattedResult(resolved, formatted);
}

/** Formats a table and wraps cells until it fits the requested display width when possible. */
export function applyWrappedToWidth(
  lines: readonly string[],
  row: number,
  column: number,
  maxTableWidth: number,
): EditResult {
  const resolved = resolveTable(lines, row, column);
  if (!resolved) return noTableFound(lines);

  const { table } = resolved;
  const unwrappedRow = unwrapContinuationRows(table, resolved.row);
  const columnWidths = targetColumnWidthsForTableWidth(table, Math.max(maxTableWidth, 0));
  const targetRow = wrapCellsToWidths(table, unwrappedRow, columnWidths);
  return formattedResult(resolved, formatTable(table, targetRow, resolved.column, columnWidths));
}

// ---------------------------------------------------------------------------------------------
// CSV/TSV conversion and table creation
// ---------------------------------------------------------------------------------------------

function sanitizeMarkdownCell(value: string): string {
  let result = '';
  const text = trim(value);
  for (let index = 0; index < text.length; index += 1) {
    const character = at(text, index);
    if (character === '|' && !isEscaped(text, index)) result += '\\|';
    else if (character === '\r' || character === '\n') result += ' ';
    else result += character;
  }
  return result;
}

function isBlankText(value: string): boolean {
  for (const character of value) {
    if (!isSpace(character)) return false;
  }
  return true;
}

function addDelimitedRow(rows: string[][], row: string[], hasDelimitedSyntax: boolean): void {
  if (row.some(cellHasText) || hasDelimitedSyntax) rows.push(row);
}

function hasDelimiterOutsideQuotes(text: string): boolean {
  let inQuotes = false;
  let cellBlank = true;
  for (let index = 0; index < text.length; index += 1) {
    const character = at(text, index);
    if (inQuotes) {
      if (character === '"' && at(text, index + 1) === '"') index += 1;
      else if (character === '"') inQuotes = false;
    } else if (character === '"' && cellBlank) inQuotes = true;
    else if (character === '\t' || character === ',') return true;
    else if (character === '\r' || character === '\n') cellBlank = true;
    else if (!isSpace(character)) cellBlank = false;
  }
  return false;
}

function detectDelimiter(text: string): ',' | '\t' {
  let tabs = 0;
  let inQuotes = false;
  let cellBlank = true;
  for (let index = 0; index < text.length; index += 1) {
    const character = at(text, index);
    if (inQuotes) {
      if (character === '"' && at(text, index + 1) === '"') index += 1;
      else if (character === '"') inQuotes = false;
    } else if (character === '"' && cellBlank) inQuotes = true;
    else if (character === '\t') {
      tabs += 1;
      cellBlank = true;
    } else if (character === ',') cellBlank = true;
    else if (character === '\r' || character === '\n') cellBlank = true;
    else if (!isSpace(character)) cellBlank = false;
  }
  return tabs > 0 ? '\t' : ',';
}

function parseDelimited(text: string): string[][] {
  const value = trim(text);
  if (value.length === 0) return [];
  if (!hasDelimiterOutsideQuotes(value)) return [];

  const delimiter = detectDelimiter(value);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let closedQuotedField = false;
  let rowHasDelimitedSyntax = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = at(value, index);
    if (inQuotes) {
      if (character === '"') {
        if (at(value, index + 1) === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          closedQuotedField = true;
        }
      } else if (character === '\r' || character === '\n') {
        cell += ' ';
        if (character === '\r' && at(value, index + 1) === '\n') index += 1;
      } else cell += character;
      continue;
    }

    if (closedQuotedField) {
      if (character === delimiter) {
        row.push(cell);
        cell = '';
        closedQuotedField = false;
        rowHasDelimitedSyntax = true;
      } else if (character === '\r' || character === '\n') {
        row.push(cell);
        addDelimitedRow(rows, row, rowHasDelimitedSyntax);
        row = [];
        cell = '';
        closedQuotedField = false;
        rowHasDelimitedSyntax = false;
        if (character === '\r' && at(value, index + 1) === '\n') index += 1;
      } else if (isSpace(character)) cell += character;
      else return [];
    } else if (character === '"' && isBlankText(cell)) {
      cell = '';
      inQuotes = true;
      rowHasDelimitedSyntax = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = '';
      rowHasDelimitedSyntax = true;
    } else if (character === '\r' || character === '\n') {
      row.push(cell);
      addDelimitedRow(rows, row, rowHasDelimitedSyntax);
      row = [];
      cell = '';
      rowHasDelimitedSyntax = false;
      if (character === '\r' && at(value, index + 1) === '\n') index += 1;
    } else cell += character;
  }

  if (inQuotes) return [];

  row.push(cell);
  addDelimitedRow(rows, row, rowHasDelimitedSyntax);
  return rows;
}

function tableFromCells(rows: readonly (readonly string[])[]): Table {
  const table = newTableState();
  table.separatorRow = 1;
  table.columns = 1;
  for (const row of rows) table.columns = Math.max(table.columns, row.length);

  const header = rows[0] ?? [];
  table.rows.push({
    cells: Array.from({ length: table.columns }, (_, column) => sanitizeMarkdownCell(header[column] ?? '')),
    separator: false,
    id: 0,
  });
  table.rows.push({ cells: Array.from({ length: table.columns }, () => '---'), separator: true, id: 1 });
  for (let column = 0; column < table.columns; column += 1) table.alignments.push('none');

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const source = rows[rowIndex] ?? [];
    table.rows.push({
      cells: Array.from({ length: table.columns }, (_, column) => sanitizeMarkdownCell(source[column] ?? '')),
      separator: false,
      id: table.rows.length,
    });
  }

  return table;
}

/** Converts CSV or TSV text into a Markdown table. */
export function fromDelimited(text: string): EditResult {
  const result = emptyResult();
  const rows = parseDelimited(text);
  if (rows.length === 0) {
    result.message = 'No CSV or TSV data found';
    return result;
  }

  setResultFromFormat(result, formatTable(tableFromCells(rows), 0, 0));
  result.ok = true;
  result.changed = true;
  return result;
}

/** Creates a Markdown table with one header row and `dataRows` empty data rows. */
export function newTable(columns: number, dataRows: number): EditResult {
  const result = emptyResult();
  if (!Number.isInteger(columns) || !Number.isInteger(dataRows) || columns < 1 || dataRows < 0) {
    result.message = 'Invalid table size';
    return result;
  }

  const rows: string[][] = [Array.from({ length: columns }, (_, column) => `Column ${column + 1}`)];
  for (let row = 0; row < dataRows; row += 1) rows.push(Array.from({ length: columns }, () => ''));

  setResultFromFormat(result, formatTable(tableFromCells(rows), dataRows > 0 ? 2 : 0, 0));
  result.ok = true;
  result.changed = true;
  return result;
}
