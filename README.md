# Markdown Table Editor для Visual Studio Code

[![CI](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/ci.yml)
[![CodeQL](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/codeql.yml)
[![License](https://img.shields.io/github/license/krotname/VsCodeMarkdownTableEditor)](LICENSE)

Нативное расширение VS Code для быстрого редактирования GitHub-flavored Markdown-таблиц. Нажатие `Tab` внутри таблицы выравнивает её; вне таблицы остаётся обычным Tab.

Ядро написано на TypeScript без Java, .NET или внешнего процесса. Его поведение проверяется тем же `markdown-table-core-golden.json`, который используют версии для [JetBrains IDEs](https://github.com/krotname/IdeaMarkdownTableEditor) и [Notepad++](https://github.com/krotname/NppMarkdownTableEditor).

## Возможности

- выравнивание с учётом CJK, emoji, combining marks и escaped pipes;
- переход между ячейками и добавление новой строки в конце;
- вставка, удаление и перемещение строк и колонок;
- изменение ширины колонки и физический перенос длинных ячеек;
- числовая и Unicode-aware сортировка;
- преобразование CSV/TSV, включая quoted и multiline поля;
- вставка новой таблицы;
- Light Auto Align и Power Auto Fit;
- работа полностью локально, без телеметрии и сетевых запросов расширения.

## Установка локального VSIX

1. Соберите пакет командой `npm run package`.
2. В VS Code откройте `Extensions: Install from VSIX...`.
3. Выберите `build/markdown-table-editor.vsix`.

## Команды

| Команда | Горячая клавиша Windows/Linux |
| --- | --- |
| Tab: Align Markdown Table | `Tab` внутри Markdown-таблицы |
| Align Table | `Ctrl+Alt+Shift+1` |
| Next / Previous Cell | `Ctrl+Alt+Shift+2` / `3` |
| Insert / Delete Row | `Ctrl+Alt+Shift+4` / `5` |
| Insert / Delete Column | `Ctrl+Alt+Shift+6` / `7` |
| Move Row Up / Down | `Ctrl+Alt+Shift+8` / `9` |
| Convert CSV/TSV to Table | `Ctrl+Alt+Shift+0` |
| Fit Table Width to Editor | `Ctrl+Alt+Shift+W` |
| Toggle Light Auto Align | `Ctrl+Alt+Shift+A` |
| Toggle Power Auto Fit | `Ctrl+Alt+Shift+F` |

Остальные команды доступны через Command Palette в категории `Markdown Table Editor`.

## Настройки

- `markdownTableEditor.lightAutoAlign` — выравнивать таблицу после правки;
- `markdownTableEditor.powerAutoFit` — после правки также подгонять физическую ширину;
- `markdownTableEditor.fitWidth` — целевая ширина таблицы в display columns, по умолчанию 120.

## Разработка и проверка

Требуются Node.js 20+ и npm.

```powershell
npm ci
npm run check
npm run test:coverage
npm run test:e2e
npm run package
```

`test:e2e` скачивает из официального канала стабильный VS Code и запускает отдельный Extension Host. CI повторяет unit, coverage, E2E и VSIX-сборку на чистых runner-ах.

## Лицензия

[GPL-3.0-or-later](LICENSE), Copyright (C) 2026 krotname.

[English README](README.en.md)
