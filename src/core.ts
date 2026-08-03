// SPDX-License-Identifier: GPL-3.0-or-later

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
  targetColumnOffset: number;
}

export interface TableRange {
  found: boolean;
  firstRow: number;
  lastRow: number;
}

type Alignment = 'none' | 'left' | 'center' | 'right';

interface Row {
  cells: string[];
  separator: boolean;
  id: number;
}

interface Table {
  rows: Row[];
  alignments: Alignment[];
  columns: number;
  separatorRow: number;
  leadingPipe: boolean;
  trailingPipe: boolean;
}

interface ResolvedTable {
  table: Table;
  sourceLines: string[];
  range: TableRange;
  row: number;
  column: number;
}

const HARD_WRAP_CELL_WIDTH = 26;
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(value, maximum));
}

function isEscaped(text: string, offset: number): boolean {
  let slashes = 0;
  for (let index = offset - 1; index >= 0 && text[index] === '\\'; index -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function startsWithUnescapedPipe(text: string): boolean {
  return text.trimStart().startsWith('|');
}

function endsWithUnescapedPipe(text: string): boolean {
  const trimmed = text.trimEnd();
  return trimmed.endsWith('|') && !isEscaped(trimmed, trimmed.length - 1);
}

export function isPotentialTableLine(line: string): boolean {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '|' && !isEscaped(line, index)) return true;
  }
  return false;
}

export function splitCells(line: string): string[] {
  const value = line.trim();
  const leading = startsWithUnescapedPipe(value);
  const trailing = endsWithUnescapedPipe(value);
  const cells: string[] = [];
  let current = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? '';
    if (character === '|' && !isEscaped(value, index)) {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  if (leading) cells.shift();
  if (trailing) cells.pop();
  return cells;
}

export function columnFromCursor(line: string, charColumn: number): number {
  const limit = Math.min(Math.max(charColumn, 0), line.length);
  const leading = startsWithUnescapedPipe(line);
  let skippedLeading = false;
  let column = 0;
  for (let index = 0; index < limit; index += 1) {
    if (line[index] !== '|' || isEscaped(line, index)) continue;
    if (leading && !skippedLeading) skippedLeading = true;
    else column += 1;
  }
  return column;
}

function separatorCell(cell: string): boolean {
  return /^:?-+:?$/.test(cell.trim());
}

export function isPotentialSeparatorLine(line: string): boolean {
  if (!isPotentialTableLine(line)) return false;
  const cells = splitCells(line);
  return cells.length > 0 && cells.every(separatorCell);
}

function tableWithSeparatorAt(lines: readonly string[], separatorRow: number): TableRange | undefined {
  if (separatorRow < 1 || !isPotentialTableLine(lines[separatorRow - 1] ?? '')) return undefined;
  const separator = lines[separatorRow] ?? '';
  if (!isPotentialSeparatorLine(separator)) return undefined;
  if (splitCells(lines[separatorRow - 1] ?? '').length !== splitCells(separator).length) return undefined;
  let lastRow = separatorRow;
  while (lastRow + 1 < lines.length && isPotentialTableLine(lines[lastRow + 1] ?? '')) lastRow += 1;
  return { found: true, firstRow: separatorRow - 1, lastRow };
}

export function findTableRanges(lines: readonly string[]): TableRange[] {
  const ranges: TableRange[] = [];
  for (let separator = 1; separator < lines.length; separator += 1) {
    const range = tableWithSeparatorAt(lines, separator);
    if (!range) continue;
    ranges.push(range);
    separator = range.lastRow + 1;
  }
  return ranges;
}

export function findTableRange(lines: readonly string[], row: number): TableRange {
  if (row < 0 || row >= lines.length) return { found: false, firstRow: 0, lastRow: 0 };
  return findTableRanges(lines).find((range) => row >= range.firstRow && row <= range.lastRow)
    ?? { found: false, firstRow: 0, lastRow: 0 };
}

function parseAlignment(cell: string): Alignment {
  const value = cell.trim();
  if (value.startsWith(':') && value.endsWith(':')) return 'center';
  if (value.startsWith(':')) return 'left';
  if (value.endsWith(':')) return 'right';
  return 'none';
}

function parseTable(lines: readonly string[]): Table {
  const separatorRow = 1;
  const columns = splitCells(lines[separatorRow] ?? '').length;
  const rows = lines.map((line, id) => {
    const cells = splitCells(line);
    while (cells.length < columns) cells.push('');
    if (cells.length > columns) cells.splice(columns);
    return { cells, separator: id === separatorRow, id };
  });
  return {
    rows,
    columns,
    separatorRow,
    alignments: rows[separatorRow]?.cells.map(parseAlignment) ?? [],
    leadingPipe: startsWithUnescapedPipe(lines[0] ?? ''),
    trailingPipe: endsWithUnescapedPipe(lines[0] ?? ''),
  };
}

function resolveTable(lines: readonly string[], row: number, column: number): ResolvedTable | undefined {
  if (lines.length === 0) return undefined;
  const boundedRow = clamp(row, lines.length - 1);
  const range = findTableRange(lines, boundedRow);
  if (!range.found) return undefined;
  const sourceLines = lines.slice(range.firstRow, range.lastRow + 1);
  const table = parseTable(sourceLines);
  return {
    table,
    sourceLines,
    range,
    row: clamp(boundedRow - range.firstRow, table.rows.length - 1),
    column: clamp(column, table.columns - 1),
  };
}

function isWideCodePoint(codePoint: number): boolean {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f || codePoint === 0x2329 || codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1b000 && codePoint <= 0x1b2ff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

function graphemeWidth(grapheme: string): number {
  if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(grapheme)) return 2;
  let width = 0;
  for (const character of grapheme) {
    if (/\p{Mark}|\p{Cf}/u.test(character) || character === '\ufe0f') continue;
    const codePoint = character.codePointAt(0) ?? 0;
    width += isWideCodePoint(codePoint) ? 2 : 1;
  }
  return width;
}

export function displayWidth(text: string): number {
  let width = 0;
  for (const part of graphemeSegmenter.segment(text)) width += graphemeWidth(part.segment);
  return width;
}

function spaces(count: number): string {
  return ' '.repeat(Math.max(0, count));
}

function alignmentMarker(alignment: Alignment, width: number): string {
  const size = Math.max(3, width);
  if (alignment === 'left') return `:${'-'.repeat(Math.max(1, size - 1))}`;
  if (alignment === 'right') return `${'-'.repeat(Math.max(1, size - 1))}:`;
  if (alignment === 'center') return `:${'-'.repeat(Math.max(1, size - 2))}:`;
  return '-'.repeat(size);
}

function paddedCell(cell: string, alignment: Alignment, width: number): { value: string; offset: number } {
  const difference = Math.max(0, width - displayWidth(cell));
  if (alignment === 'right') return { value: `${spaces(difference)}${cell}`, offset: difference };
  if (alignment === 'center') {
    const left = Math.floor(difference / 2);
    return { value: `${spaces(left)}${cell}${spaces(difference - left)}`, offset: left };
  }
  return { value: `${cell}${spaces(difference)}`, offset: 0 };
}

function naturalWidths(table: Table): number[] {
  return Array.from({ length: table.columns }, (_, column) => {
    let width = 3;
    for (const row of table.rows) {
      if (!row.separator) width = Math.max(width, displayWidth(row.cells[column] ?? ''));
    }
    return width;
  });
}

function shouldRenderLeadingPipe(table: Table): boolean {
  return table.leadingPipe || table.rows.some((row) => (row.cells[0] ?? '') === '');
}

function shouldRenderTrailingPipe(table: Table): boolean {
  return table.trailingPipe || table.rows.some((row) => (row.cells[table.columns - 1] ?? '') === '');
}

function formatTable(
  table: Table,
  targetRow: number,
  targetColumn: number,
  requestedWidths?: readonly number[],
): Pick<EditResult, 'lines' | 'targetRow' | 'targetColumn' | 'targetColumnOffset'> {
  const natural = naturalWidths(table);
  const widths = natural.map((width, index) => Math.max(3, requestedWidths?.[index] ?? width));
  const leading = shouldRenderLeadingPipe(table);
  const trailing = shouldRenderTrailingPipe(table);
  let targetColumnOffset = 0;
  const lines = table.rows.map((row, rowIndex) => {
    const rendered = row.cells.map((cell, column) => {
      if (row.separator) return alignmentMarker(table.alignments[column] ?? 'none', widths[column] ?? 3);
      const padded = paddedCell(cell, table.alignments[column] ?? 'none', widths[column] ?? 3);
      if (rowIndex === targetRow && column === targetColumn) targetColumnOffset = padded.offset;
      return padded.value;
    });
    let line = rendered.join(' | ');
    if (leading) line = `| ${line}`;
    if (trailing) line = `${line} |`;
    return line;
  });
  return {
    lines,
    targetRow: clamp(targetRow, lines.length - 1),
    targetColumn: clamp(targetColumn, table.columns - 1),
    targetColumnOffset,
  };
}

function resultFromFormat(resolved: ResolvedTable, formatted: ReturnType<typeof formatTable>): EditResult {
  return {
    ok: true,
    changed: formatted.lines.some((line, index) => line !== resolved.sourceLines[index]) || formatted.lines.length !== resolved.sourceLines.length,
    message: '',
    ...formatted,
  };
}

function noTableFound(lines: readonly string[]): EditResult {
  return {
    ok: false,
    changed: false,
    message: lines.length === 0 ? 'No table found' : 'No Markdown table found',
    lines: [], targetRow: 0, targetColumn: 0, targetColumnOffset: 0,
  };
}

function nextEditableRow(table: Table, row: number): number {
  let candidate = row + 1;
  if (candidate === table.separatorRow) candidate += 1;
  return candidate;
}

function previousEditableRow(table: Table, row: number): number {
  let candidate = Math.max(0, row - 1);
  if (candidate === table.separatorRow) candidate = Math.max(0, candidate - 1);
  return candidate;
}

function emptyRow(table: Table, id: number): Row {
  return { cells: Array.from({ length: table.columns }, () => ''), separator: false, id };
}

function moveColumn(table: Table, from: number, to: number): void {
  if (from === to) return;
  for (const row of table.rows) {
    const [cell = ''] = row.cells.splice(from, 1);
    row.cells.splice(to, 0, cell);
  }
  const [alignment = 'none'] = table.alignments.splice(from, 1);
  table.alignments.splice(to, 0, alignment);
}

function foldForSort(value: string): string {
  return value.toLocaleLowerCase('und')
    .replaceAll('æ', 'ae').replaceAll('œ', 'oe').replaceAll('ß', 'ss')
    .replaceAll('þ', 'th').replaceAll('ð', 'd').replaceAll('ø', 'o').replaceAll('ł', 'l')
    .normalize('NFKD').replace(/[\p{Mark}\p{Cf}]/gu, '');
}

function numericValue(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return undefined;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : undefined;
}

function compareCells(left: string, right: string): number {
  const leftNumber = numericValue(left);
  const rightNumber = numericValue(right);
  if (leftNumber !== undefined || rightNumber !== undefined) {
    if (leftNumber === undefined) return 1;
    if (rightNumber === undefined) return -1;
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
  }
  const leftFolded = foldForSort(left);
  const rightFolded = foldForSort(right);
  const folded = leftFolded < rightFolded ? -1 : leftFolded > rightFolded ? 1 : 0;
  if (folded !== 0) return folded;
  return left < right ? -1 : left > right ? 1 : 0;
}

function markdownTokenEnd(text: string, offset: number): number {
  if (text[offset] === '[') {
    const closeLabel = text.indexOf('](', offset + 1);
    if (closeLabel >= 0) {
      let depth = 1;
      for (let index = closeLabel + 2; index < text.length; index += 1) {
        if (text[index] === '(' && !isEscaped(text, index)) depth += 1;
        if (text[index] === ')' && !isEscaped(text, index) && --depth === 0) return index + 1;
      }
    }
  }
  if (text[offset] === '`') {
    let ticks = 1;
    while (text[offset + ticks] === '`') ticks += 1;
    const marker = '`'.repeat(ticks);
    const close = text.indexOf(marker, offset + ticks);
    if (close >= 0) return close + ticks;
  }
  return offset;
}

function tokenizeForWrap(text: string): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < text.length;) {
    while (index < text.length && /\s/u.test(text[index] ?? '')) index += 1;
    if (index >= text.length) break;
    const specialEnd = markdownTokenEnd(text, index);
    if (specialEnd > index) {
      tokens.push(text.slice(index, specialEnd));
      index = specialEnd;
      continue;
    }
    let end = index + 1;
    while (end < text.length && !/\s/u.test(text[end] ?? '')) end += 1;
    tokens.push(text.slice(index, end));
    index = end;
  }
  return tokens;
}

function splitToDisplayWidth(text: string, width: number): string[] {
  const chunks: string[] = [];
  let chunk = '';
  let chunkWidth = 0;
  for (const part of graphemeSegmenter.segment(text)) {
    const partWidth = graphemeWidth(part.segment);
    if (chunk && chunkWidth + partWidth > width) {
      chunks.push(chunk);
      chunk = '';
      chunkWidth = 0;
    }
    chunk += part.segment;
    chunkWidth += partWidth;
  }
  if (chunk || chunks.length === 0) chunks.push(chunk);
  return chunks;
}

function wrapCell(text: string, width: number): string[] {
  if (displayWidth(text) <= width) return [text.trim()];
  const pieces: string[] = [];
  for (const token of tokenizeForWrap(text.trim())) {
    if (displayWidth(token) <= width) pieces.push(token);
    else pieces.push(...splitToDisplayWidth(token, width));
  }
  const lines: string[] = [];
  let current = '';
  for (const piece of pieces) {
    const candidate = current ? `${current} ${piece}` : piece;
    if (current && displayWidth(candidate) > width) {
      lines.push(current);
      current = piece;
    } else current = candidate;
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

function wrapTableRows(table: Table, widths: readonly number[], originalTargetRow: number): number {
  const output: Row[] = [];
  let targetRow = originalTargetRow;
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex];
    if (!row) continue;
    if (row.separator || rowIndex === 0) {
      output.push(row);
      continue;
    }
    const segments = row.cells.map((cell, column) => wrapCell(cell, widths[column] ?? HARD_WRAP_CELL_WIDTH));
    const count = Math.max(...segments.map((values) => values.length));
    const firstOutputIndex = output.length;
    for (let part = 0; part < count; part += 1) {
      output.push({
        cells: segments.map((values) => values[part] ?? ''),
        separator: false,
        id: part === 0 ? row.id : Math.max(...table.rows.map((item) => item.id), 0) + output.length + 1,
      });
    }
    if (rowIndex < originalTargetRow) targetRow += count - 1;
    else if (rowIndex === originalTargetRow) targetRow = firstOutputIndex;
  }
  table.rows = output;
  return targetRow;
}

function requestedWidthsForBudget(table: Table, maxTableWidth: number): number[] {
  const widths = naturalWidths(table);
  const leading = shouldRenderLeadingPipe(table);
  const trailing = shouldRenderTrailingPipe(table);
  const overhead = (table.columns - 1) * 3 + (leading ? 2 : 0) + (trailing ? 2 : 0);
  while (widths.reduce((sum, width) => sum + width, overhead) > maxTableWidth) {
    let candidate = -1;
    for (let index = 0; index < widths.length; index += 1) {
      if ((widths[index] ?? 3) > 3 && (candidate < 0 || (widths[index] ?? 3) > (widths[candidate] ?? 3))) candidate = index;
    }
    if (candidate < 0) break;
    widths[candidate] = (widths[candidate] ?? 3) - 1;
  }
  return widths;
}

export function apply(lines: readonly string[], row: number, column: number, action: Action): EditResult {
  const resolved = resolveTable(lines, row, column);
  if (!resolved) return noTableFound(lines);
  const { table } = resolved;
  let targetRow = resolved.row;
  let targetColumn = resolved.column;
  let requestedWidths: number[] | undefined;
  const currentId = table.rows[targetRow]?.id ?? targetRow;

  switch (action) {
    case Action.NEXT_CELL:
      if (targetColumn + 1 < table.columns) targetColumn += 1;
      else {
        targetColumn = 0;
        targetRow = nextEditableRow(table, targetRow);
        if (targetRow >= table.rows.length) table.rows.push(emptyRow(table, Math.max(...table.rows.map((item) => item.id)) + 1));
      }
      break;
    case Action.PREVIOUS_CELL:
      if (targetColumn > 0) targetColumn -= 1;
      else {
        targetColumn = table.columns - 1;
        targetRow = previousEditableRow(table, targetRow);
      }
      break;
    case Action.INSERT_ROW_BELOW: {
      targetRow = Math.min(nextEditableRow(table, targetRow), table.rows.length);
      table.rows.splice(targetRow, 0, emptyRow(table, Math.max(...table.rows.map((item) => item.id)) + 1));
      break;
    }
    case Action.DELETE_ROW:
      if (targetRow !== table.separatorRow && table.rows.filter((item) => !item.separator).length > 1) {
        table.rows.splice(targetRow, 1);
        targetRow = clamp(targetRow, table.rows.length - 1);
        if (targetRow === table.separatorRow) targetRow = previousEditableRow(table, targetRow);
      }
      break;
    case Action.INSERT_COLUMN_RIGHT:
      targetColumn += 1;
      for (const tableRow of table.rows) tableRow.cells.splice(targetColumn, 0, '');
      table.alignments.splice(targetColumn, 0, 'none');
      table.columns += 1;
      break;
    case Action.DELETE_COLUMN:
      if (table.columns > 1) {
        for (const tableRow of table.rows) tableRow.cells.splice(targetColumn, 1);
        table.alignments.splice(targetColumn, 1);
        table.columns -= 1;
        if (table.columns === 1 && !table.leadingPipe) table.trailingPipe = true;
        targetColumn = Math.min(targetColumn, table.columns - 1);
      }
      break;
    case Action.MOVE_COLUMN_LEFT:
      if (targetColumn > 0) {
        moveColumn(table, targetColumn, targetColumn - 1);
        targetColumn -= 1;
      }
      break;
    case Action.MOVE_COLUMN_RIGHT:
      if (targetColumn + 1 < table.columns) {
        moveColumn(table, targetColumn, targetColumn + 1);
        targetColumn += 1;
      }
      break;
    case Action.MOVE_ROW_UP:
    case Action.MOVE_ROW_DOWN: {
      const other = targetRow + (action === Action.MOVE_ROW_UP ? -1 : 1);
      if (targetRow > table.separatorRow && other > table.separatorRow && other < table.rows.length) {
        [table.rows[targetRow], table.rows[other]] = [table.rows[other] as Row, table.rows[targetRow] as Row];
        targetRow = other;
      }
      break;
    }
    case Action.SORT_ASCENDING:
    case Action.SORT_DESCENDING: {
      const data = table.rows.slice(table.separatorRow + 1);
      data.sort((left, right) => compareCells(left.cells[targetColumn] ?? '', right.cells[targetColumn] ?? '') * (action === Action.SORT_ASCENDING ? 1 : -1));
      table.rows.splice(table.separatorRow + 1, data.length, ...data);
      targetRow = table.rows.findIndex((item) => item.id === currentId);
      break;
    }
    case Action.NARROW_COLUMN:
    case Action.WIDEN_COLUMN: {
      requestedWidths = naturalWidths(table);
      const delta = action === Action.WIDEN_COLUMN ? 1 : -1;
      requestedWidths[targetColumn] = Math.max(3, (requestedWidths[targetColumn] ?? 3) + delta);
      if (delta < 0) targetRow = wrapTableRows(table, requestedWidths, targetRow);
      break;
    }
    case Action.WRAP_LONG_CELLS:
      targetRow = wrapTableRows(table, Array.from({ length: table.columns }, () => HARD_WRAP_CELL_WIDTH), targetRow);
      break;
    case Action.ALIGN:
      break;
  }
  return resultFromFormat(resolved, formatTable(table, targetRow, targetColumn, requestedWidths));
}

export function applyWrappedToWidth(
  lines: readonly string[], row: number, column: number, maxTableWidth: number,
): EditResult {
  const resolved = resolveTable(lines, row, column);
  if (!resolved) return noTableFound(lines);
  const widths = requestedWidthsForBudget(resolved.table, Math.max(1, maxTableWidth));
  const targetRow = wrapTableRows(resolved.table, widths, resolved.row);
  return resultFromFormat(resolved, formatTable(resolved.table, targetRow, resolved.column, widths));
}

function detectDelimiter(text: string): ',' | '\t' | undefined {
  let commas = 0;
  let tabs = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === ',') commas += 1;
    else if (!quoted && character === '\t') tabs += 1;
  }
  if (tabs === 0 && commas === 0) return undefined;
  return tabs > 0 ? '\t' : ',';
}

function parseDelimited(text: string): string[][] | undefined {
  const delimiter = detectDelimiter(text);
  if (!delimiter) return undefined;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let justClosedQuote = false;
  let fieldStarted = false;

  const finishCell = (): void => {
    row.push(cell.trim());
    cell = '';
    fieldStarted = false;
    justClosedQuote = false;
  };
  const finishRow = (): void => {
    finishCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          justClosedQuote = true;
        }
      } else if (character === '\r' && text[index + 1] === '\n') {
        cell += ' ';
        index += 1;
      } else if (character === '\r' || character === '\n') cell += ' ';
      else cell += character;
      continue;
    }
    if (justClosedQuote && character !== delimiter && character !== '\r' && character !== '\n' && !/\s/u.test(character)) return undefined;
    if (character === '"' && !fieldStarted && cell.trim() === '') {
      quoted = true;
      fieldStarted = true;
    } else if (character === delimiter) finishCell();
    else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      finishRow();
    } else {
      cell += character;
      if (!/\s/u.test(character)) fieldStarted = true;
    }
  }
  if (quoted) return undefined;
  if (cell !== '' || row.length > 0) finishRow();
  if (rows.length < 1) return undefined;
  return rows;
}

function sanitizeMarkdownCell(value: string): string {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '|') {
      output += value[index];
      continue;
    }
    let slashes = 0;
    for (let before = index - 1; before >= 0 && value[before] === '\\'; before -= 1) slashes += 1;
    if (slashes % 2 === 0) output += '\\';
    output += '|';
  }
  return output.replace(/\s+/gu, ' ').trim();
}

export function fromDelimited(text: string): EditResult {
  const parsed = parseDelimited(text);
  if (!parsed) return { ok: false, changed: false, message: 'Invalid CSV/TSV text', lines: [], targetRow: 0, targetColumn: 0, targetColumnOffset: 0 };
  const columns = Math.max(...parsed.map((row) => row.length));
  if (columns < 1) return { ok: false, changed: false, message: 'No delimited data found', lines: [], targetRow: 0, targetColumn: 0, targetColumnOffset: 0 };
  const rows: Row[] = parsed.map((cells, id) => ({
    cells: Array.from({ length: columns }, (_, column) => sanitizeMarkdownCell(cells[column] ?? '')),
    separator: false,
    id,
  }));
  rows.splice(1, 0, { cells: Array.from({ length: columns }, () => '---'), separator: true, id: -1 });
  const table: Table = { rows, columns, separatorRow: 1, alignments: Array.from({ length: columns }, () => 'none'), leadingPipe: true, trailingPipe: true };
  const formatted = formatTable(table, 0, 0);
  return { ok: true, changed: true, message: '', ...formatted };
}

export function newTable(columns: number, dataRows: number): EditResult {
  if (!Number.isInteger(columns) || !Number.isInteger(dataRows) || columns < 1 || dataRows < 0) {
    return { ok: false, changed: false, message: 'Columns must be positive and rows non-negative', lines: [], targetRow: 0, targetColumn: 0, targetColumnOffset: 0 };
  }
  const rows: Row[] = [emptyRow({ columns } as Table, 0), { cells: Array.from({ length: columns }, () => '---'), separator: true, id: -1 }];
  for (let index = 0; index < dataRows; index += 1) rows.push({ cells: Array.from({ length: columns }, () => ''), separator: false, id: index + 1 });
  const table: Table = { rows, columns, separatorRow: 1, alignments: Array.from({ length: columns }, () => 'none'), leadingPipe: true, trailingPipe: true };
  return { ok: true, changed: true, message: '', ...formatTable(table, 0, 0) };
}

export function cellCharacterOffset(line: string, column: number, contentOffset = 0): number {
  const leading = startsWithUnescapedPipe(line);
  let current = 0;
  let start = leading ? line.indexOf('|') + 1 : 0;
  while (start < line.length && line[start] === ' ') start += 1;
  for (let index = 0; index < line.length && current < column; index += 1) {
    if (line[index] === '|' && !isEscaped(line, index)) {
      if (leading && index === line.indexOf('|')) continue;
      current += 1;
      start = index + 1;
      while (start < line.length && line[start] === ' ') start += 1;
    }
  }
  return Math.min(line.length, start + contentOffset);
}
