import assert from 'node:assert/strict';
import * as vscode from 'vscode';

let document: vscode.TextDocument;
let editor: vscode.TextEditor;

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'automatic edit did not reach the expected document state');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function executeHistoryCommand(command: 'undo' | 'redo', target: vscode.TextDocument): Promise<void> {
  const reason = command === 'undo' ? vscode.TextDocumentChangeReason.Undo : vscode.TextDocumentChangeReason.Redo;
  let subscription: vscode.Disposable | undefined;
  let timer: NodeJS.Timeout | undefined;
  const changed = new Promise<void>((resolve, reject) => {
    subscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === target && event.reason === reason) resolve();
    });
    timer = setTimeout(() => reject(new Error(`${command} did not update the target document`)), 5000);
  });
  try {
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    await vscode.commands.executeCommand(command);
    // The native command can return before the extension host receives its edit.
    await changed;
  } finally {
    subscription?.dispose();
    if (timer) clearTimeout(timer);
  }
}

suiteSetup(async () => {
  document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: '| Name | Value |\n| --- | ---: |\n| Анна | 2 |\n| Bob | 10 |',
  });
  editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(2, 3, 2, 3);
});

suiteTeardown(async () => {
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
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
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  editor = await vscode.window.showTextDocument(document);
});

test('CSV conversion edits the selected document range', async () => {
  const csv = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'Name,Age\nAnna,20' });
  const csvEditor = await vscode.window.showTextDocument(csv);
  csvEditor.selection = new vscode.Selection(0, 0, 1, 7);
  await vscode.commands.executeCommand('markdownTableEditor.convertDelimited');
  assert.equal(csv.getText(), '| Name | Age |\n| ---- | --- |\n| Anna | 20  |');
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
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
  await waitUntil(() => automatic.lineAt(2).text === '| first  value | x   |');

  assert.equal(automatic.lineAt(2).text, '| first  value | x   |');
  assert.equal(automatic.lineAt(6).text, '| second | y |');
  assert.deepEqual(automaticEditor.selection.active, new vscode.Position(6, 3));
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
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
  await waitUntil(() => multiple.lineAt(2).text === '| one long | x   |' && multiple.lineAt(6).text === '| two wide | y   |');

  assert.equal(multiple.lineAt(2).text, '| one long | x   |');
  assert.equal(multiple.lineAt(6).text, '| two wide | y   |');
  assert.equal(multipleEditor.selections.length, 2);
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
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

  await executeHistoryCommand('undo', history);
  assert.equal(history.getText(), original);
  await executeHistoryCommand('redo', history);
  assert.equal(history.getText(), aligned);

  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  await vscode.workspace.getConfiguration('markdownTableEditor').update('lightAutoAlign', true, vscode.ConfigurationTarget.Global);
  editor = await vscode.window.showTextDocument(document);
});

suite('adapter regressions', () => {
  const delay = () => new Promise((resolve) => setTimeout(resolve, 600));

  async function withEditor(content: string, run: (target: vscode.TextEditor) => Promise<void>): Promise<void> {
    const targetDocument = await vscode.workspace.openTextDocument({ language: 'markdown', content });
    const target = await vscode.window.showTextDocument(targetDocument);
    const configuration = vscode.workspace.getConfiguration('markdownTableEditor');
    const light = configuration.get<boolean>('lightAutoAlign', true);
    const power = configuration.get<boolean>('powerAutoFit', false);
    try {
      await configuration.update('lightAutoAlign', true, vscode.ConfigurationTarget.Global);
      await configuration.update('powerAutoFit', false, vscode.ConfigurationTarget.Global);
      await run(target);
    } finally {
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      await configuration.update('lightAutoAlign', light, vscode.ConfigurationTarget.Global);
      await configuration.update('powerAutoFit', power, vscode.ConfigurationTarget.Global);
      editor = await vscode.window.showTextDocument(document);
    }
  }

  for (const eol of ['\n', '\r\n']) {
    test(`CSV conversion preserves the selected trailing ${eol === '\n' ? 'LF' : 'CRLF'} before prose`, async () => {
      await withEditor(['Name,Age', 'Anna,20', 'Following paragraph'].join(eol), async (target) => {
        // A backwards, whole-line selection includes the newline before the next paragraph.
        target.selection = new vscode.Selection(2, 0, 0, 0);
        await vscode.commands.executeCommand('markdownTableEditor.convertDelimited');
        assert.equal(target.document.getText(), [
          '| Name | Age |', '| ---- | --- |', '| Anna | 20  |', 'Following paragraph',
        ].join(eol));
      });
    });
  }

  test('CSV conversion at the caret leaves adjacent prose outside the table', async () => {
    await withEditor('Introduction\nName,Age\nAnna,20\nFollowing paragraph', async (target) => {
      target.selection = new vscode.Selection(2, 3, 2, 3);
      await vscode.commands.executeCommand('markdownTableEditor.convertDelimited');
      assert.equal(target.document.getText(), [
        'Introduction', '| Name | Age |', '| ---- | --- |', '| Anna | 20  |', 'Following paragraph',
      ].join('\n'));
    });
  });

  test('CSV conversion at the caret keeps blank lines inside a quoted field', async () => {
    await withEditor('Introduction\nName,Note\nAnna,"line 1\n\nline 2"\nBob,done\nFollowing paragraph', async (target) => {
      target.selection = new vscode.Selection(4, 0, 4, 0);
      await vscode.commands.executeCommand('markdownTableEditor.convertDelimited');
      assert.equal(target.document.getText(), [
        'Introduction', '| Name | Note           |', '| ---- | -------------- |',
        '| Anna | line 1  line 2 |', '| Bob  | done           |', 'Following paragraph',
      ].join('\n'));
    });
  });

  test('automatic alignment does not reapply a manually aligned table after undo', async () => {
    const original = '| A | B |\n| --- | --- |\n| longer | x |';
    await withEditor(original, async (target) => {
      target.selection = new vscode.Selection(2, 3, 2, 3);
      await vscode.commands.executeCommand('markdownTableEditor.align');
      assert.notEqual(target.document.getText(), original);
      await executeHistoryCommand('undo', target.document);
      assert.equal(target.document.getText(), original);
      await delay();
      assert.equal(target.document.getText(), original);
    });
  });

  test('undo cancels an automatic alignment that is still waiting for its debounce', async () => {
    const original = '| A | B |\n| --- | --- |\n| one | x |';
    await withEditor(original, async (target) => {
      assert.equal(await target.edit((builder) => builder.insert(new vscode.Position(2, 5), ' longer')), true);
      await executeHistoryCommand('undo', target.document);
      assert.equal(target.document.getText(), original);
      await delay();
      assert.equal(target.document.getText(), original);
    });
  });

  test('automatic alignment leaves the restored redo text unchanged', async () => {
    const original = '| A | B |\n| --- | --- |\n| one | x |';
    await withEditor(original, async (target) => {
      const configuration = vscode.workspace.getConfiguration('markdownTableEditor');
      await configuration.update('lightAutoAlign', false, vscode.ConfigurationTarget.Global);
      assert.equal(await target.edit((builder) => builder.insert(new vscode.Position(2, 5), ' longer')), true);
      const edited = target.document.getText();
      await executeHistoryCommand('undo', target.document);
      assert.equal(target.document.getText(), original);
      await configuration.update('lightAutoAlign', true, vscode.ConfigurationTarget.Global);
      await executeHistoryCommand('redo', target.document);
      assert.equal(target.document.getText(), edited);
      await delay();
      assert.equal(target.document.getText(), edited);
    });
  });

  test('automatic alignment finds every table in a multiline paste that starts with prose', async () => {
    const untouched = '| U | V |\n| --- | --- |\n| untouched | z |';
    await withEditor(`\n${untouched}`, async (target) => {
      const pasted = [
        'Introduction', '', '| A | B |', '| --- | --- |', '| one | x |', '',
        '| C | D |', '| --- | --- |', '| two | y |', '',
      ].join('\n');
      assert.equal(await target.edit((builder) => builder.insert(new vscode.Position(0, 0), pasted)), true);
      await waitUntil(() => target.document.lineAt(2).text === '| A   | B   |' && target.document.lineAt(6).text === '| C   | D   |');
      assert.equal(target.document.getText(), [
        'Introduction', '', '| A   | B   |', '| --- | --- |', '| one | x   |', '',
        '| C   | D   |', '| --- | --- |', '| two | y   |', '', untouched,
      ].join('\n'));
    });
  });

  test('automatic alignment maps simultaneous changes onto the updated document lines', async () => {
    const original = ['Introduction', '', '| A | B |', '| --- | --- |', '| one | x |'].join('\n');
    await withEditor(original, async (target) => {
      assert.equal(await target.edit((builder) => {
        builder.insert(new vscode.Position(0, 0), 'New paragraph\n\n');
        builder.insert(new vscode.Position(4, 5), ' longer');
      }), true);
      await waitUntil(() => target.document.lineAt(6).text === '| one longer | x   |');
      assert.equal(target.document.getText(), [
        'New paragraph', '', 'Introduction', '', '| A          | B   |', '| ---------- | --- |', '| one longer | x   |',
      ].join('\n'));
    });
  });
});
