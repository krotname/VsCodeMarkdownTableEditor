// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from 'vscode';
import {
  Action,
  apply,
  applyWrappedToWidth,
  columnFromCursor,
  findTableRange,
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
let autoRequest: { document: vscode.TextDocument; rows: number[]; power: boolean } | undefined;

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
    if (!silent) void vscode.window.showInformationMessage('Markdown Table Editor: no table at the cursor.');
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

function delimitedBlock(document: vscode.TextDocument, line: number): vscode.Range {
  let first = line;
  let last = line;
  while (first > 0 && document.lineAt(first - 1).text.trim() !== '') first -= 1;
  while (last + 1 < document.lineCount && document.lineAt(last + 1).text.trim() !== '') last += 1;
  return new vscode.Range(first, 0, last, document.lineAt(last).text.length);
}

async function convertDelimited(): Promise<void> {
  const editor = activeMarkdownEditor();
  if (!editor) return;
  const sourceRange = editor.selection.isEmpty ? delimitedBlock(editor.document, editor.selection.active.line) : new vscode.Range(editor.selection.start, editor.selection.end);
  const result = fromDelimited(editor.document.getText(sourceRange));
  if (!result.ok) {
    void vscode.window.showErrorMessage(`Markdown Table Editor: ${result.message}`);
    return;
  }
  internalEdit = true;
  try {
    await editor.edit((builder) => builder.replace(sourceRange, result.lines.join(editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n')));
  } finally {
    internalEdit = false;
  }
}

async function insertTable(): Promise<void> {
  const editor = activeMarkdownEditor();
  if (!editor) return;
  const columnsText = await vscode.window.showInputBox({ prompt: 'Number of columns', value: '3', validateInput: positiveInteger });
  if (columnsText === undefined) return;
  const rowsText = await vscode.window.showInputBox({ prompt: 'Number of data rows', value: '2', validateInput: nonNegativeInteger });
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
  return /^\d+$/u.test(value) && Number(value) > 0 ? undefined : 'Enter a positive integer.';
}

function nonNegativeInteger(value: string): string | undefined {
  return /^\d+$/u.test(value) ? undefined : 'Enter zero or a positive integer.';
}

async function toggleSetting(name: 'lightAutoAlign' | 'powerAutoFit'): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('markdownTableEditor');
  const next = !configuration.get<boolean>(name, name === 'lightAutoAlign');
  await configuration.update(name, next, vscode.ConfigurationTarget.Global);
  if (name === 'powerAutoFit' && next && !configuration.get<boolean>('lightAutoAlign', true)) {
    await configuration.update('lightAutoAlign', true, vscode.ConfigurationTarget.Global);
  }
  void vscode.window.showInformationMessage(`${name === 'powerAutoFit' ? 'Power Auto Fit' : 'Light Auto Align'}: ${next ? 'on' : 'off'}`);
}

function scheduleAutomaticEdit(event: vscode.TextDocumentChangeEvent): void {
  if (internalEdit || event.document.languageId !== 'markdown' || event.contentChanges.length === 0) return;
  const configuration = vscode.workspace.getConfiguration('markdownTableEditor', event.document.uri);
  const power = configuration.get<boolean>('powerAutoFit', false);
  if (!power && !configuration.get<boolean>('lightAutoAlign', true)) return;
  const lines = documentLines(event.document);
  const rows = new Set<number>();
  for (const change of event.contentChanges) {
    const line = Math.min(change.range.start.line, lines.length - 1);
    const range = findTableRange(lines, line);
    if (range.found) rows.add(range.firstRow);
  }
  if (rows.size === 0) return;
  if (autoTimer) clearTimeout(autoTimer);
  if (autoRequest?.document === event.document) {
    for (const row of autoRequest.rows) rows.add(row);
  }
  autoRequest = { document: event.document, rows: [...rows], power };
  autoTimer = setTimeout(async () => {
    const request = autoRequest;
    autoRequest = undefined;
    autoTimer = undefined;
    const editor = activeMarkdownEditor();
    if (!request || !editor || editor.document !== request.document) return;
    for (const row of request.rows.sort((left, right) => right - left)) {
      const position = new vscode.Position(Math.min(row, editor.document.lineCount - 1), 0);
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
    createStatusBar('markdownTableEditor.toggleLightAutoAlign', '$(table) Light', 'Toggle Markdown Table Editor light auto align', 101),
    createStatusBar('markdownTableEditor.togglePowerAutoFit', '$(screen-full) Power', 'Toggle Markdown Table Editor power auto fit', 100),
  );
}

export function deactivate(): void {
  if (autoTimer) clearTimeout(autoTimer);
  autoRequest = undefined;
}
