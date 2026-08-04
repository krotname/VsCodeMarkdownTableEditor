# Contributing

Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).

1. Create a focused branch from `main`.
2. Run `npm ci` and make the smallest coherent change.
3. Add or update contract tests. Core behavior changes must also update the canonical fixtures in the JetBrains and Notepad++ repositories.
4. Run `npm run check`, `npm run test:coverage`, and `npm run test:e2e`.
5. Open a pull request explaining the user impact and validation.

Do not commit generated `dist`, `build`, coverage, downloaded VS Code runtimes, credentials, or private document data.

## Layout

- `src/core.ts` — the editor-independent table engine, a port of the shared JetBrains/Notepad++ core.
  It has no VS Code imports, so it can be tested on plain Node.js.
- `src/extension.ts` — the VS Code bindings: commands, keybindings, automatic modes, status bar.
- `test/` — unit, contract, golden, and parity suites run by `tsx --test`.
- `e2e/` — the suite that runs inside a real Extension Host through `@vscode/test-electron`.
- `scripts/` — build, packaging, and verification helpers; no build tool beyond Node.js and esbuild.

Behavior shared with the other editions belongs in `src/core.ts` and must stay byte-for-byte
compatible with `test-fixtures/markdown-table-core-golden.json`.

Opening the repository in VS Code and pressing `F5` builds the bundle and launches an Extension
Development Host with the extension loaded; the second launch configuration runs the E2E suite in
the same way the `test:e2e` script does.

## Releasing

1. Update `CHANGELOG.md` and the `version` field in `package.json` in one pull request.
2. After it is merged, tag the merge commit as `v<version>` and push the tag. The release workflow
   builds the VSIX, records `SHA256SUMS.txt`, attests build provenance, and creates the GitHub release.
3. Publish to the Marketplace with the **Publish to VS Code Marketplace** workflow as described in
   [MARKETPLACE_SUBMISSION.md](MARKETPLACE_SUBMISSION.md): `dry-run` first, then `publish`.
