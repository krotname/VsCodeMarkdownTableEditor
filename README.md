# Markdown Table Editor для Visual Studio Code

[![CI](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/ci.yml)
[![CodeQL](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/krotname/VsCodeMarkdownTableEditor/actions/workflows/codeql.yml?query=branch%3Amain)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/krotname/VsCodeMarkdownTableEditor/badge)](https://securityscorecards.dev/viewer/?uri=github.com/krotname/VsCodeMarkdownTableEditor)
[![Release](https://img.shields.io/github/v/release/krotname/VsCodeMarkdownTableEditor?label=release)](https://github.com/krotname/VsCodeMarkdownTableEditor/releases/latest)
[![License](https://img.shields.io/github/license/krotname/VsCodeMarkdownTableEditor)](LICENSE)
[![Website](https://img.shields.io/badge/website-markdowntableeditor.ru-0f766e)](https://markdowntableeditor.ru/)

Markdown Table Editor превращает VS Code в удобный редактор Markdown-таблиц. Берёте чужую косую
таблицу или сгенерированную ИИ, жмёте `Tab` — и расширение выравнивает колонки, сохраняя разметку,
а дальше помогает переставлять строки, колонки и данные, не выходя из редактора.

**Быстрый старт:** [скачать VSIX из последнего релиза](https://github.com/krotname/VsCodeMarkdownTableEditor/releases/latest) ·
[открыть сайт проекта](https://markdowntableeditor.ru/) ·
[English README](README.en.md)

Публикация в Visual Studio Marketplace готовится; до неё расширение ставится из VSIX.

## Другие версии

- Для JetBrains IDEs: [IdeaMarkdownTableEditor](https://github.com/krotname/IdeaMarkdownTableEditor)
  ([JetBrains Marketplace](https://plugins.jetbrains.com/plugin/32159-markdown-table-editor))
- Для Notepad++: [NppMarkdownTableEditor](https://github.com/krotname/NppMarkdownTableEditor)

Все три версии используют одно и то же поведение ядра и проверяются общим набором эталонных
данных `markdown-table-core-golden.json`, поэтому таблица выглядит одинаково в любом редакторе.

## Как это выглядит

Было — таблица, набранная руками:

```markdown
| Команда | Клавиши | Что делает |
|---|:---:|---|
| Align Table | Ctrl+Alt+Shift+1 | выравнивает таблицу под курсором |
| Sort Rows Ascending | Command Palette | сортирует строки по колонке |
| 変換 CSV/TSV | Ctrl+Alt+Shift+0 | превращает CSV или TSV в таблицу |
```

Стало — после одного нажатия `Tab` внутри таблицы:

```markdown
| Команда             |     Клавиши      | Что делает                       |
| ------------------- | :--------------: | -------------------------------- |
| Align Table         | Ctrl+Alt+Shift+1 | выравнивает таблицу под курсором |
| Sort Rows Ascending | Command Palette  | сортирует строки по колонке      |
| 変換 CSV/TSV        | Ctrl+Alt+Shift+0 | превращает CSV или TSV в таблицу |
```

Выравнивание задаётся строкой-разделителем и сохраняется, а ширина считается по экранным
позициям: CJK и emoji занимают две колонки, combining marks — ноль.

Вставленный CSV превращается в таблицу командой `Convert CSV/TSV to Table`, включая поля в
кавычках с запятыми внутри:

```markdown
| name           | role       | city   |
| -------------- | ---------- | ------ |
| Ovcharenko, A. | maintainer | Moscow |
| lena           | reviewer   | Sochi  |
```

`Fit Table Width to Editor` ужимает таблицу до заданной ширины и переносит длинные ячейки
физически, без изменения смысла строк:

```markdown
| Режим | Что делает                                           |
| ----- | ---------------------------------------------------- |
| Light | выравнивает таблицу через мгновение после правки, не |
| Auto  | трогая ширину колонок                                |
| Align |                                                      |
| Power | дополнительно ужимает таблицу до заданной ширины и   |
| Auto  | переносит длинные ячейки                             |
| Fit   |                                                      |
```

## Зачем он нужен

- Не нужно уходить из VS Code в отдельный редактор таблиц.
- Большие pipe-таблицы остаются читаемыми в обычном тексте, а не только в предпросмотре.
- `Tab`, сортировка и операции со строками и колонками экономят ручное выравнивание.
- CSV/TSV из письма или выгрузки быстро превращается в аккуратную Markdown-таблицу.
- Всё работает локально: ни телеметрии, ни сетевых запросов, ни аккаунта.

## Возможности

- `Tab` внутри Markdown-таблицы выравнивает её, вне таблицы работает как обычный `Tab`.
- Выравнивание с учётом CJK, emoji, combining marks и экранированных `\|`.
- Переход между ячейками с созданием новой строки в конце таблицы.
- Вставка, удаление и перемещение строк и колонок.
- Сужение и расширение колонки, физический перенос длинных ячеек.
- Числовая и Unicode-aware сортировка строк по колонке под курсором.
- Преобразование CSV и TSV, включая поля в кавычках и многострочные значения.
- Вставка новой таблицы заданного размера.
- Light Auto Align и Power Auto Fit с переключателями в строке состояния.

## Установка

Из VSIX:

1. Скачайте `md-table-editor.vsix` из [последнего релиза](https://github.com/krotname/VsCodeMarkdownTableEditor/releases/latest)
   или соберите его локально командой `npm run package`.
2. В VS Code выполните `Extensions: Install from VSIX...`.
3. Выберите скачанный или собранный файл `md-table-editor.vsix`.

Каждый релизный VSIX сопровождается файлом `SHA256SUMS.txt` и подписью происхождения сборки
(build provenance attestation), созданной GitHub Actions.

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

На macOS вместо `Ctrl` используется `Cmd`. Остальные команды — перемещение колонок, сортировка,
сужение и расширение колонки, вставка таблицы — доступны через Command Palette в категории
`Markdown Table Editor`.

## Настройки

- `markdownTableEditor.lightAutoAlign` — выравнивать таблицу вскоре после правки, по умолчанию включено;
- `markdownTableEditor.powerAutoFit` — после правки также подгонять физическую ширину, по умолчанию выключено;
- `markdownTableEditor.fitWidth` — целевая ширина таблицы в экранных колонках, по умолчанию 120.

## Приватность и безопасность

Расширение обрабатывает текст документа локально внутри Extension Host и не собирает телеметрию,
не отправляет содержимое документов и не делает сетевых запросов — см. [PRIVACY.md](PRIVACY.md).
Оно объявлено безопасным для untrusted workspaces и работает в виртуальных рабочих областях,
потому что не выполняет и не читает файлы проекта. Порядок сообщений об уязвимостях описан в
[SECURITY.md](SECURITY.md).

## Совместимость

- VS Code `1.96` и новее.
- Windows, macOS, Linux; Remote SSH, WSL, Dev Containers и Codespaces (расширение может работать
  как на стороне UI, так и на стороне workspace).
- Виртуальные файловые системы и untrusted workspaces поддерживаются.

## Разработка и проверка

Требуются Node.js 20+ и npm; CI использует Node.js 24.

```powershell
npm ci
npm run check
npm run test:coverage
npm run test:e2e
npm run package
```

`test:e2e` скачивает из официального канала стабильный VS Code и запускает отдельный Extension
Host. CI повторяет unit, coverage, E2E на Linux и Windows, сборку VSIX и его установку в чистый
профиль. Требования к вкладу описаны в [CONTRIBUTING.md](CONTRIBUTING.md), состав пакета —
в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), порядок публикации —
в [MARKETPLACE_SUBMISSION.md](MARKETPLACE_SUBMISSION.md).

## Лицензия

[GPL-3.0-or-later](LICENSE), Copyright (C) 2026 krotname.

[English README](README.en.md)
