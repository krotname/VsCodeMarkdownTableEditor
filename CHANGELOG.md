# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- Automatic alignment now formats the table that was actually edited even if the caret moves to
  another table before the debounce timer fires.
- Automatic alignment handles multi-cursor edits across separate tables without collapsing or
  moving the editor selections.

## [0.2.3] - 2026-08-04

### Changed

- Both READMEs point at the published Marketplace listing: version, installs, and rating badges,
  an install link in the quick start, and a Marketplace section in the install instructions.
  The note about a listing being in preparation is gone.

## [0.2.2] - 2026-08-04

### Changed

- The Marketplace display name is now `Markdown Table Editor Plus`, and the extension identifier
  is `krotname.markdown-table-editor-plus`. The Marketplace requires a display name that no other
  extension already uses, and `Markdown Table Editor` belongs to an unrelated extension, so upload
  was refused regardless of the identifier. Commands, settings, and behaviour are unchanged.

### Added

- Real VS Code screenshots and a demo GIF in `docs/`, linked from both READMEs and reusable
  for the Marketplace listing.

## [0.2.1] - 2026-08-04

### Changed

- Renamed the extension identifier away from `markdown-table-editor`, which the Marketplace
  reported as already in use. Commands, settings, and behaviour are unchanged.

## [0.2.0] - 2026-08-04

### Added

- Marketplace metadata for the first public release: gallery banner, Q&A link, free pricing,
  and declared support for untrusted and virtual workspaces.

### Changed

- The extension activates on Markdown documents, so light auto align and the status-bar
  toggles are live as soon as a Markdown file is opened instead of after the first command.

### Fixed

- Fit Width and the manual narrow/widen actions no longer merge sparse rows that wrapping
  could not have produced, so distinct records survive power auto fit. Rows that wrapping did
  produce are still rejoined.
- The table core is now a faithful port of the shared JetBrains/Notepad++ engine and matches it
  byte for byte across the differential corpus. This corrects several behaviours that diverged:
  - Prose that merely contains a pipe is no longer swallowed into the table and rewritten.
  - Rows with more cells than the separator row grow the table instead of losing the extra cells.
  - Deleting the row above the separator is refused, so a table can no longer lose its header.
  - The caret lands on the cell content in right and centre aligned columns.
  - Separator rows written with spaced dashes, `=` rules, or short `|---` lines are recognised.
  - A pipe block without a separator row is no longer treated as a table.
  - Fitting a width unwraps earlier continuation rows, so repeating the command is stable.
  - Narrow and widen follow the content width instead of a fixed three column floor.
  - CSV and TSV cells keep their internal whitespace, and new tables carry `Column N` headers.
  - Display widths use the shared Unicode tables rather than the host runtime's Unicode data.

## [0.1.0] - 2026-08-04

### Added

- Native TypeScript Markdown table core compatible with the shared JetBrains/Notepad++ golden fixture.
- Table alignment, navigation, structural edits, sorting, width fitting, and CSV/TSV conversion.
- Tab integration, automatic modes, status-bar controls, local Extension Host E2E tests, and reproducible VSIX packaging.
