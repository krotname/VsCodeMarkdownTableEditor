# Visual Studio Marketplace submission

Status: release metadata for version `0.2.1`, the first public Marketplace submission.
Keep the version here in sync with `package.json`; the publish workflow refuses a mismatch.

The Marketplace rejects an extension `name` that any publisher already uses, and
`markdown-table-editor` is taken by an unrelated extension, so this project publishes as
`md-table-editor`. The display name is unaffected.

## Artifact

- Version: `0.2.1`
- VSIX: `build/md-table-editor.vsix`, produced by `npm run package`
- Checksum: `build/SHA256SUMS.txt`, produced by the release and publish workflows
- Marketplace item: fill after upload
- Marketplace verification status: fill after upload
- GitHub release: fill after tagging `v0.2.1`

## Extension metadata

- Extension identifier: `krotname.md-table-editor`
- Display name: `Markdown Table Editor`
- Publisher: `krotname`
- Categories: `Formatters`, `Other`
- Keywords: `markdown`, `table`, `formatter`, `csv`, `tsv`
- VS Code compatibility: `^1.96.0`
- Extension kind: `ui`, `workspace` (no workspace file system access)
- Workspace trust: supported in untrusted workspaces
- Virtual workspaces: supported
- Pricing: free
- License: `GPL-3.0-or-later`
- License URL: `https://github.com/krotname/VsCodeMarkdownTableEditor/blob/main/LICENSE`
- Repository: `https://github.com/krotname/VsCodeMarkdownTableEditor`
- Issues and Q&A: `https://github.com/krotname/VsCodeMarkdownTableEditor/issues`
- Project site: `https://markdowntableeditor.ru/`

## Screenshots

Real VS Code captures live in `docs/marketplace-screenshots/` and are linked from both READMEs;
the listing renders them from the repository, so they must be on `main` before the upload.

- `01-align-table-tab.png` — a table aligned by pressing `Tab`
- `02-sort-rows-by-column.png` — rows sorted by the column under the cursor
- `03-convert-csv-tsv-to-markdown.png` — CSV with quoted fields turned into a table
- `04-insert-edit-markdown-table.png` — a table inserted by size
- `05-complete-workflow-command-palette.png` — the commands in the Command Palette
- `contact-sheet.png` — all five frames in one image
- `docs/demo.gif` — the same flow as an animation

## Short description

Edit Markdown pipe tables directly in VS Code: align with `Tab`, fit the table width, narrow or
widen columns, sort rows, convert CSV/TSV, insert tables by size, and move rows or columns without
leaving the editor. Everything runs locally, with no telemetry and no network access.

## Marketplace release notes for 0.2.1

```markdown
- The extension is published as `krotname.md-table-editor`; the Marketplace already had the
  `markdown-table-editor` name in use by an unrelated extension.
- The table engine is a faithful port of the shared JetBrains/Notepad++ core and matches it byte
  for byte across the differential corpus, correcting table detection, header protection, caret
  placement, width fitting, and CSV/TSV whitespace handling.
- Fit Width and the manual narrow/widen actions keep sparse rows that wrapping could not have
  produced, so distinct records survive Power Auto Fit.
- The extension activates on Markdown documents, so Light Auto Align and the status-bar toggles
  are live as soon as a Markdown file is opened.
```

## Automated submission

Run the **Publish to VS Code Marketplace** workflow from `main`: start with `dry-run`, then use
`publish` with the confirmation `md-table-editor:0.2.1`. The verify job builds the VSIX,
installs it into a throwaway VS Code profile, and records a checksum without ever seeing the
Marketplace token. The publish job then waits for approval in the `marketplace` GitHub environment,
which holds the `VSCE_PAT` secret, verifies the checksum of the artifact built by the verify job,
and uploads exactly that file with `vsce publish --packagePath`.

Locally the same upload is `npx vsce publish --packagePath build/md-table-editor.vsix` with
`VSCE_PAT` set in the environment.

## Manual submission

1. Sign in at <https://marketplace.visualstudio.com/manage> with the Microsoft account that owns
   the `krotname` publisher, creating the publisher first if it does not exist.
2. Open the publisher page and choose `New extension` / `Visual Studio Code`.
3. Upload `build/md-table-editor.vsix`.
4. Confirm that the rendered README, icon, categories, license, and repository links are correct.
5. Wait for the automated Marketplace verification to finish and record the resulting status above.

## Token note

Publishing requires an Azure DevOps personal access token with `Marketplace → Manage` scope, issued
for **all accessible organizations**. Store it outside the repository (`secrets.txt` is git-ignored)
and in the `marketplace` GitHub environment as `VSCE_PAT`. Never commit or paste the token into the
repository, an issue, or a pull request.
