# Markdown Table Editor for Visual Studio Code

[![CI](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/ci.yml)
[![CodeQL](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/codeql.yml)
[![License](https://img.shields.io/github/license/krotname/VsCodeMarkdownTableEditor)](LICENSE)

A native VS Code extension for fast GitHub-flavored Markdown table editing. `Tab` aligns the table under the cursor and remains the normal Tab command outside tables.

The dependency-free TypeScript core is checked against the same `markdown-table-core-golden.json` used by the [JetBrains IDE](https://github.com/krotname/IdeaMarkdownTableEditor) and [Notepad++](https://github.com/krotname/NppMarkdownTableEditor) versions.

## Features

- Unicode-aware alignment for CJK, emoji, combining marks, and escaped pipes;
- next/previous cell navigation with automatic row creation;
- insert, delete, and move rows and columns;
- resize columns and physically wrap long cells;
- numeric and Unicode-aware sorting;
- strict CSV/TSV conversion, including quoted and multiline fields;
- insert a new table;
- Light Auto Align and Power Auto Fit;
- fully local operation with no telemetry or extension-originated network requests.

## Install a local VSIX

1. Run `npm run package`.
2. Open `Extensions: Install from VSIX...` in VS Code.
3. Select `build/markdown-table-editor.vsix`.

## Commands

| Command | Windows/Linux shortcut |
| --- | --- |
| Tab: Align Markdown Table | `Tab` inside a Markdown table |
| Align Table | `Ctrl+Alt+Shift+1` |
| Next / Previous Cell | `Ctrl+Alt+Shift+2` / `3` |
| Insert / Delete Row | `Ctrl+Alt+Shift+4` / `5` |
| Insert / Delete Column | `Ctrl+Alt+Shift+6` / `7` |
| Move Row Up / Down | `Ctrl+Alt+Shift+8` / `9` |
| Convert CSV/TSV to Table | `Ctrl+Alt+Shift+0` |
| Fit Table Width to Editor | `Ctrl+Alt+Shift+W` |
| Toggle Light Auto Align | `Ctrl+Alt+Shift+A` |
| Toggle Power Auto Fit | `Ctrl+Alt+Shift+F` |

All other commands are available from the Command Palette under `Markdown Table Editor`.

## Settings

- `markdownTableEditor.lightAutoAlign`: align a table after edits;
- `markdownTableEditor.powerAutoFit`: also physically fit an edited table;
- `markdownTableEditor.fitWidth`: target table width in display columns, default 120.

## Build and verify

Node.js 20+ and npm are required.

```powershell
npm ci
npm run check
npm run test:coverage
npm run test:e2e
npm run package
```

The E2E suite downloads stable VS Code from the official update service and launches a separate Extension Host. CI repeats unit, coverage, E2E, and VSIX packaging on clean runners.

## License

[GPL-3.0-or-later](LICENSE), Copyright (C) 2026 krotname.

[README на русском](README.md)
