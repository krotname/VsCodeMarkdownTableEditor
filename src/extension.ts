// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from 'vscode';
import {
  Action,
  apply,
  applyWrappedToWidth,
  columnFromCursor,
  findTableRange,
  findTableRanges,
  fromDelimited,
  newTable,
  type EditResult,
  type TableRange,
} from './core.js';

const commandActions: Record<string, Action> = {
  'markdownTableEditor.align': Action.ALIGN,
  'markdownTableEditor.nextCell': Action.NEXT_CELL,
  'markdownTableEditor.previousCell': Action.PREVIOUS_CELL,
  'markdownTableEditor.insertRowBelow': Action.INSERT_ROW_BELOW,
  'markdownTableEditor.deleteRow': Action.DELETE_ROW,
  'markdownTableEditor.insertColumnRight': Action.INSERT_COLUMN_RIGHT,
  'markdownTableEditor.deleteColumn': Action.DELETE_COLUMN,
  'markdownTableEditor.narrowColumn': Action.NARROW_COLUMN,
  'markdownTableEditor.widenColumn': Action.WIDEN_COLUMN,
  'markdownTableEditor.moveRowUp': Action.MOVE_ROW_UP,
  'markdownTableEditor.moveRowDown': Action.MOVE_ROW_DOWN,
  'markdownTableEditor.moveColumnLeft': Action.MOVE_COLUMN_LEFT,
  'markdownTableEditor.moveColumnRight': Action.MOVE_COLUMN_RIGHT,
  'markdownTableEditor.sortAscending': Action.SORT_ASCENDING,
  'markdownTableEditor.sortDescending': Action.SORT_DESCENDING,
};

let internalEdit = false;
let autoTimer: NodeJS.Timeout | undefined;
let autoRequest: { document: vscode.TextDocument; rowOffsets: number[]; power: boolean } | undefined;

function documentLines(document: vscode.TextDocument): string[] {
  return Array.from({ length: document.lineCount }, (_, line) => document.lineAt(line).text);
}

function activeMarkdownEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  return editor?.document.languageId === 'markdown' ? editor : undefined;
}

async function replaceTable(
  editor: vscode.TextEditor,
  range: TableRange,
  result: EditResult,
  reveal = true,
  preserveSelections = false,
): Promise<boolean> {
  if (!result.ok) return false;
  const endLine = editor.document.lineAt(range.lastRow);
  const editRange = new vscode.Range(range.firstRow, 0, range.lastRow, endLine.text.length);
  internalEdit = true;
  try {
    if (result.changed) {
      const applied = await editor.edit((builder) => builder.replace(editRange, result.lines.join(editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n')));
      if (!applied) return false;
    }
    if (!preserveSelections) {
      const targetLine = Math.min(range.firstRow + result.targetRow, editor.document.lineCount - 1);
      const line = editor.document.lineAt(targetLine).text;
      const position = new vscode.Position(targetLine, Math.min(result.targetColumnOffset, line.length));
      editor.selection = new vscode.Selection(position, position);
      if (reveal) editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
    return true;
  } finally {
    internalEdit = false;
  }
}

async function runActionAt(
  editor: vscode.TextEditor,
  position: vscode.Position,
  action: Action,
  silent = false,
  preserveSelections = false,
): Promise<boolean> {
  const lines = documentLines(editor.document);
  const range = findTableRange(lines, position.line);
  if (!range.found) {
    if (!silent) void vscode.window.showInformationMessage(vscode.l10n.t('Markdown Table Editor: no table at the cursor.'));
    return false;
  }
  const column = columnFromCursor(lines[position.line] ?? '', position.character);
  const result = apply(lines, position.line, column, action);
  return replaceTable(editor, range, result, !silent, preserveSelections);
}

async function runAction(action: Action, silent = false): Promise<boolean> {
  const editor = activeMarkdownEditor();
  if (!editor) return false;
  return runActionAt(editor, editor.selection.active, action, silent);
}

async function runFitAt(
  editor: vscode.TextEditor,
  position: vscode.Position,
  silent = false,
  preserveSelections = false,
): Promise<boolean> {
  const lines = documentLines(editor.document);
  const range = findTableRange(lines, position.line);
  if (!range.found) return false;
  const width = vscode.workspace.getConfiguration('markdownTableEditor', editor.document.uri).get<number>('fitWidth', 120);
  const column = columnFromCursor(lines[position.line] ?? '', position.character);
  return replaceTable(editor, range, applyWrappedToWidth(lines, position.line, column, width), !silent, preserveSelections);
}

async function runFit(silent = false): Promise<boolean> {
  const editor = activeMarkdownEditor();
  if (!editor) return false;
  return runFitAt(editor, editor.selection.active, silent);
}

type DelimitedLineScan = { hasDelimiter: boolean; inQuotes: boolean; delimiter: string | undefined };

function scanDelimitedLine(text: string, startsInQuotes: boolean, delimiter?: string): DelimitedLineScan {
  let inQuotes = startsInQuotes;
  let cellBlank = !startsInQuotes;
  let commas = 0;
  let tabs = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') index += 1;
      else if (character === '"') inQuotes = false;
    } else if (character === '"' && cellBlank) {
      inQuotes = true;
    } else if (character === delimiter || (delimiter === undefined && (character === ',' || character === '\t'))) {
      if (character === '\t') tabs += 1;
      else commas += 1;
      cellBlank = true;
    } else if (character.trim() !== '') {
      cellBlank = false;
    }
  }
  return { hasDelimiter: tabs + commas > 0, inQuotes, delimiter: delimiter ?? (tabs > 0 ? '\t' : commas > 0 ? ',' : undefined) };
}

function delimitedBlock(document: vscode.TextDocument, line: number): vscode.Range {
  let first: number | undefined;
  let candidateFirst: number | undefined;
  let caretFirst: number | undefined;
  let last = -1;
  let inQuotes = false;
  let delimiter: string | undefined;
  for (let row = 0; row <= document.lineCount; row += 1) {
    const text = row < document.lineCount ? document.lineAt(row).text : undefined;
    // Tab-only lines are valid empty TSV records, including the first record.
    if (text === undefined || (!inQuotes && text.trim() === '' && (delimiter === ',' || !text.includes('\t')))) {
      if (first !== undefined && line >= first && line < row) {
        // The caret explicitly includes pending one-field records; otherwise
        // stop at the last unambiguous CSV/TSV record before adjacent prose.
        const end = Math.max(last, line);
        return new vscode.Range(first, 0, end, document.lineAt(end).text.length);
      }
      first = undefined;
      candidateFirst = undefined;
      caretFirst = undefined;
      inQuotes = false;
      delimiter = undefined;
      continue;
    }
    const scan = scanDelimitedLine(text, inQuotes, delimiter);
    if (first === undefined) {
      if (row === line) caretFirst = row;
      if (scan.hasDelimiter) {
        first = Math.min(candidateFirst ?? row, caretFirst ?? row);
        last = row;
        inQuotes = scan.inQuotes;
        delimiter = scan.delimiter;
      } else if (scan.inQuotes) {
        candidateFirst ??= row;
        inQuotes = true;
      } else {
        candidateFirst = undefined;
        inQuotes = false;
      }
      continue;
    }
    // Plain records between delimited records belong to a ragged block.
    // Pending trailing records are included only through the caret above.
    if (inQuotes || scan.hasDelimiter || scan.inQuotes) last = row;
    inQuotes = scan.inQuotes;
  }
  return new vscode.Range(line, 0, line, 0);
}

function localizeResultMessage(message: string): string {
  switch (message) {
    case 'No table found': return vscode.l10n.t('No table found');
    case 'No Markdown table found': return vscode.l10n.t('No Markdown table found');
    case 'No CSV or TSV data found': return vscode.l10n.t('No CSV or TSV data found');
    case 'Invalid table size': return vscode.l10n.t('Invalid table size');
    default: return message;
  }
}

async function convertDelimited(): Promise<void> {
  const editor = activeMarkdownEditor();
  if (!editor) return;
  const sourceRange = editor.selection.isEmpty ? delimitedBlock(editor.document, editor.selection.active.line) : new vscode.Range(editor.selection.start, editor.selection.end);
  const source = editor.document.getText(sourceRange);
  const result = fromDelimited(source);
  if (!result.ok) {
    void vscode.window.showErrorMessage(vscode.l10n.t('Markdown Table Editor: {0}', localizeResultMessage(result.message)));
    return;
  }
  internalEdit = true;
  try {
    const eol = editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    let end = source.length;
    let trailingBreaks = 0;
    while (end > 0 && (source[end - 1] === '\r' || source[end - 1] === '\n')) {
      const last = source[--end];
      if (last === '\n' && end > 0 && source[end - 1] === '\r') end -= 1;
      trailingBreaks += 1;
    }
    const replacement = result.lines.join(eol) + eol.repeat(trailingBreaks);
    await editor.edit((builder) => builder.replace(sourceRange, replacement));
  } finally {
    internalEdit = false;
  }
}

async function insertTable(): Promise<void> {
  const editor = activeMarkdownEditor();
  if (!editor) return;
  const columnsText = await vscode.window.showInputBox({ prompt: vscode.l10n.t('Number of columns'), value: '3', validateInput: positiveInteger });
  if (columnsText === undefined) return;
  const rowsText = await vscode.window.showInputBox({ prompt: vscode.l10n.t('Number of data rows'), value: '2', validateInput: nonNegativeInteger });
  if (rowsText === undefined) return;
  const result = newTable(Number(columnsText), Number(rowsText));
  if (!result.ok) return;
  internalEdit = true;
  try {
    await editor.edit((builder) => builder.replace(editor.selection, result.lines.join(editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n')));
  } finally {
    internalEdit = false;
  }
}

function positiveInteger(value: string): string | undefined {
  return /^\d+$/u.test(value) && Number(value) > 0 ? undefined : vscode.l10n.t('Enter a positive integer.');
}

function nonNegativeInteger(value: string): string | undefined {
  return /^\d+$/u.test(value) ? undefined : vscode.l10n.t('Enter zero or a positive integer.');
}

async function toggleSetting(name: 'lightAutoAlign' | 'powerAutoFit'): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('markdownTableEditor');
  const next = !configuration.get<boolean>(name, name === 'lightAutoAlign');
  await configuration.update(name, next, vscode.ConfigurationTarget.Global);
  if (name === 'powerAutoFit' && next && !configuration.get<boolean>('lightAutoAlign', true)) {
    await configuration.update('lightAutoAlign', true, vscode.ConfigurationTarget.Global);
  }
  const feature = name === 'powerAutoFit' ? vscode.l10n.t('Power Auto Fit') : vscode.l10n.t('Light Auto Align');
  void vscode.window.showInformationMessage(vscode.l10n.t('{0}: {1}', feature, next ? vscode.l10n.t('on') : vscode.l10n.t('off')));
}

function scheduleAutomaticEdit(event: vscode.TextDocumentChangeEvent): void {
  if (internalEdit || event.document.languageId !== 'markdown' || event.contentChanges.length === 0) return;
  if (event.reason === vscode.TextDocumentChangeReason.Undo || event.reason === vscode.TextDocumentChangeReason.Redo) {
    if (autoRequest?.document === event.document) {
      if (autoTimer) clearTimeout(autoTimer);
      autoTimer = undefined;
      autoRequest = undefined;
    }
    return;
  }
  const configuration = vscode.workspace.getConfiguration('markdownTableEditor', event.document.uri);
  const power = configuration.get<boolean>('powerAutoFit', false);
  if (!power && !configuration.get<boolean>('lightAutoAlign', true)) return;
  const lines = documentLines(event.document);
  const rows = new Set<number>();
  const ranges = findTableRanges(lines);
  const changes = [...event.contentChanges].sort((left, right) => left.rangeOffset - right.rangeOffset);
  let offsetDelta = 0;
  for (const change of changes) {
    // Change ranges use the old document; positions must use the updated offsets.
    const startOffset = change.rangeOffset + offsetDelta;
    const firstRow = event.document.positionAt(startOffset).line;
    // The inserted span is end-exclusive. A final newline does not edit the
    // next line, while a deletion still affects the boundary at its start.
    const lastOffset = startOffset + Math.max(0, change.text.length - 1);
    const lastRow = event.document.positionAt(lastOffset).line;
    for (const range of ranges) {
      if (range.firstRow <= lastRow && range.lastRow >= firstRow) rows.add(range.firstRow);
    }
    offsetDelta += change.text.length - change.rangeLength;
  }
  if (autoRequest?.document === event.document) {
    for (const offset of autoRequest.rowOffsets) {
      let mappedOffset = offset;
      let delta = 0;
      for (const change of changes) {
        if (offset < change.rangeOffset) break;
        if (offset <= change.rangeOffset + change.rangeLength) {
          mappedOffset = change.rangeOffset + delta + change.text.length;
          break;
        }
        delta += change.text.length - change.rangeLength;
        mappedOffset = offset + delta;
      }
      const range = findTableRange(lines, event.document.positionAt(mappedOffset).line);
      if (range.found) rows.add(range.firstRow);
    }
  }
  if (rows.size === 0 && autoRequest?.document !== event.document) return;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = undefined;
  autoRequest = undefined;
  if (rows.size === 0) return;
  autoRequest = {
    document: event.document,
    rowOffsets: [...rows].map((row) => event.document.offsetAt(new vscode.Position(row, 0))),
    power,
  };
  autoTimer = setTimeout(async () => {
    const request = autoRequest;
    autoRequest = undefined;
    autoTimer = undefined;
    const editor = activeMarkdownEditor();
    if (!request || !editor || editor.document !== request.document) return;
    for (const offset of request.rowOffsets.sort((left, right) => right - left)) {
      const position = editor.document.positionAt(offset);
      if (request.power) await runFitAt(editor, position, true, true);
      else await runActionAt(editor, position, Action.ALIGN, true, true);
    }
  }, 250);
}

function createStatusBar(command: string, text: string, tooltip: string, priority: number): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
  item.command = command;
  item.text = text;
  item.tooltip = tooltip;
  item.show();
  return item;
}

export function activate(context: vscode.ExtensionContext): void {
  for (const [command, action] of Object.entries(commandActions)) {
    context.subscriptions.push(vscode.commands.registerCommand(command, () => runAction(action)));
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownTableEditor.tab', async () => {
      if (!await runAction(Action.ALIGN, true)) await vscode.commands.executeCommand('tab');
    }),
    vscode.commands.registerCommand('markdownTableEditor.fitWidth', () => runFit()),
    vscode.commands.registerCommand('markdownTableEditor.convertDelimited', convertDelimited),
    vscode.commands.registerCommand('markdownTableEditor.insertTable', insertTable),
    vscode.commands.registerCommand('markdownTableEditor.toggleLightAutoAlign', () => toggleSetting('lightAutoAlign')),
    vscode.commands.registerCommand('markdownTableEditor.togglePowerAutoFit', () => toggleSetting('powerAutoFit')),
    vscode.workspace.onDidChangeTextDocument(scheduleAutomaticEdit),
    createStatusBar('markdownTableEditor.toggleLightAutoAlign', `$(table) ${vscode.l10n.t('Light')}`, vscode.l10n.t('Toggle Markdown Table Editor light auto align'), 101),
    createStatusBar('markdownTableEditor.togglePowerAutoFit', `$(screen-full) ${vscode.l10n.t('Power')}`, vscode.l10n.t('Toggle Markdown Table Editor power auto fit'), 100),
  );
}

export function deactivate(): void {
  if (autoTimer) clearTimeout(autoTimer);
  autoRequest = undefined;
}
