# Contributing

1. Create a focused branch from `main`.
2. Run `npm ci` and make the smallest coherent change.
3. Add or update contract tests. Core behavior changes must also update the canonical fixtures in the JetBrains and Notepad++ repositories.
4. Run `npm run check`, `npm run test:coverage`, and `npm run test:e2e`.
5. Open a pull request explaining the user impact and validation.

Do not commit generated `dist`, `build`, coverage, downloaded VS Code runtimes, credentials, or private document data.
