import assert from 'node:assert/strict';
import * as vscode from 'vscode';

let document: vscode.TextDocument;
let editor: vscode.TextEditor;

suiteSetup(async () => {
  document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: '| Name | Value |\n| --- | ---: |\n| Анна | 2 |\n| Bob | 10 |',
  });
  editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(2, 3, 2, 3);
});

suiteTeardown(async () => {
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
});

test('extension activates and aligns an actual VS Code document', async () => {
  const extension = vscode.extensions.getExtension('krotname.md-table-editor');
  assert.ok(extension);
  await extension.activate();
  await vscode.commands.executeCommand('markdownTableEditor.align');
  assert.equal(document.getText(), [
    '| Name | Value |',
    '| ---- | ----: |',
    '| Анна |     2 |',
    '| Bob  |    10 |',
  ].join('\n'));
});

test('next-cell command puts the caret on the content of a right aligned cell', async () => {
  editor.selection = new vscode.Selection(2, 2, 2, 2);
  await vscode.commands.executeCommand('markdownTableEditor.nextCell');
  assert.equal(editor.selection.active.line, 2);
  const line = document.lineAt(2).text;
  assert.equal(line, '| Анна |     2 |');
  assert.equal(editor.selection.active.character, 13);
  assert.equal(line[editor.selection.active.character], '2');
});

test('aligning never rewrites prose that follows the table', async () => {
  const prose = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: '| A | B |\n| --- | --- |\n| x | y |\nSome prose | with a pipe',
  });
  const proseEditor = await vscode.window.showTextDocument(prose);
  proseEditor.selection = new vscode.Selection(2, 2, 2, 2);
  await vscode.commands.executeCommand('markdownTableEditor.align');
  assert.equal(prose.getText(), '| A   | B   |\n| --- | --- |\n| x   | y   |\nSome prose | with a pipe');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  editor = await vscode.window.showTextDocument(document);
});

test('CSV conversion edits the selected document range', async () => {
  const csv = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'Name,Age\nAnna,20' });
  const csvEditor = await vscode.window.showTextDocument(csv);
  csvEditor.selection = new vscode.Selection(0, 0, 1, 7);
  await vscode.commands.executeCommand('markdownTableEditor.convertDelimited');
  assert.equal(csv.getText(), '| Name | Age |\n| ---- | --- |\n| Anna | 20  |');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  editor = await vscode.window.showTextDocument(document);
});
