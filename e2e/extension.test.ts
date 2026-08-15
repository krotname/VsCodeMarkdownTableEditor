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
  const extension = vscode.extensions.getExtension('krotname.markdown-table-editor-plus');
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

test('automatic alignment follows the edited table when the caret moves', async () => {
  const automatic = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: [
      '| A | B |',
      '| --- | --- |',
      '| first | x |',
      '',
      '| C | D |',
      '| --- | --- |',
      '| second | y |',
    ].join('\n'),
  });
  const automaticEditor = await vscode.window.showTextDocument(automatic);
  await vscode.workspace.getConfiguration('markdownTableEditor', automatic.uri).update('lightAutoAlign', true, vscode.ConfigurationTarget.Global);
  await vscode.workspace.getConfiguration('markdownTableEditor', automatic.uri).update('powerAutoFit', false, vscode.ConfigurationTarget.Global);
  automaticEditor.selection = new vscode.Selection(2, 3, 2, 3);
  assert.equal(await automaticEditor.edit((builder) => builder.insert(new vscode.Position(2, 8), ' value')),
    true);
  automaticEditor.selection = new vscode.Selection(6, 3, 6, 3);
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.equal(automatic.lineAt(2).text, '| first  value | x   |');
  assert.equal(automatic.lineAt(6).text, '| second | y |');
  assert.deepEqual(automaticEditor.selection.active, new vscode.Position(6, 3));
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  editor = await vscode.window.showTextDocument(document);
});

test('automatic alignment handles multi-cursor edits in separate tables', async () => {
  const multiple = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: [
      '| A | B |',
      '| --- | --- |',
      '| one | x |',
      '',
      '| C | D |',
      '| --- | --- |',
      '| two | y |',
    ].join('\n'),
  });
  const multipleEditor = await vscode.window.showTextDocument(multiple);
  multipleEditor.selections = [
    new vscode.Selection(2, 5, 2, 5),
    new vscode.Selection(6, 5, 6, 5),
  ];
  assert.equal(await multipleEditor.edit((builder) => {
    builder.insert(new vscode.Position(2, 5), ' long');
    builder.insert(new vscode.Position(6, 5), ' wide');
  }), true);
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.equal(multiple.lineAt(2).text, '| one long | x   |');
  assert.equal(multiple.lineAt(6).text, '| two wide | y   |');
  assert.equal(multipleEditor.selections.length, 2);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  editor = await vscode.window.showTextDocument(document);
});

test('manual alignment preserves CRLF and participates in undo and redo', async () => {
  await vscode.workspace.getConfiguration('markdownTableEditor').update('lightAutoAlign', false, vscode.ConfigurationTarget.Global);
  const original = '| A | B |\r\n| --- | --- |\r\n| longer | x |';
  const history = await vscode.workspace.openTextDocument({ language: 'markdown', content: original });
  const historyEditor = await vscode.window.showTextDocument(history);
  historyEditor.selection = new vscode.Selection(2, 3, 2, 3);
  await vscode.commands.executeCommand('markdownTableEditor.align');
  const aligned = '| A      | B   |\r\n| ------ | --- |\r\n| longer | x   |';
  assert.equal(history.getText(), aligned);

  await vscode.commands.executeCommand('undo');
  assert.equal(history.getText(), original);
  await vscode.commands.executeCommand('redo');
  assert.equal(history.getText(), aligned);

  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  await vscode.workspace.getConfiguration('markdownTableEditor').update('lightAutoAlign', true, vscode.ConfigurationTarget.Global);
  editor = await vscode.window.showTextDocument(document);
});
