# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

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
