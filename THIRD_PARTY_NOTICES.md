# Third-Party Notices

## Distributed extension

The published `markdown-table-editor.vsix` does not bundle third-party runtime code. It contains
the bundled extension entry point built from this repository's TypeScript sources, its source map,
the extension manifest, the icon, and the project documentation, including the GPL-3.0-or-later
license text.

The extension is compiled against the Visual Studio Code extension API (`@types/vscode`, type
declarations only). At runtime that API is provided by the user's VS Code installation and is not
redistributed inside the package. The extension declares no runtime `dependencies`, and the VSIX is
packaged with `vsce package --no-dependencies`.

## Build and test tooling

These packages are development dependencies. They are used to build, test, and package the
extension and are not shipped inside the VSIX:

| Component | Use | License |
| --- | --- | --- |
| `esbuild` | Bundles `src/extension.ts` into `dist/extension.js` | MIT |
| `typescript` | Type checking of the sources and tests | Apache-2.0 |
| `tsx` | Runs the TypeScript unit tests on the Node.js test runner | MIT |
| `c8` | Coverage measurement and thresholds | ISC |
| `mocha` | Test runner inside the VS Code Extension Host | MIT |
| `@vscode/test-electron` | Downloads VS Code and runs the Extension Host E2E suite | MIT |
| `@vscode/vsce` | Packages and publishes the VSIX | MIT |
| `@types/vscode`, `@types/node`, `@types/mocha` | Type declarations only | MIT |

Transitive dependency licenses resolve from `package-lock.json`; `npm audit --audit-level=low`
runs on every CI build.
