# Linux CI на Red

Linux quality, Extension Host E2E, VSIX packaging, workflow lint, dependency
review, CodeQL и release/Marketplace packaging используют repository-scoped
ARC scale set `arc-prod-adler-vscode-mte` для
`krotname/VsCodeMarkdownTableEditor`. GitHub-hosted fallback отсутствует.
Имена required checks сохранены, включая историческое
`VS Code E2E (ubuntu-latest)`; фактический runner этого check — Linux ARC.

## Граница доверия

- PR выполняется только при совпадении автора и запускающего с владельцем
  `krotname`, а `head.repo.full_name` — с текущим репозиторием. Fork, Dependabot
  и PR других авторов пропускаются до checkout и исполнения кода.
- Push и ручной CI допускаются только от владельца с `main`. Плановые CodeQL
  и Scorecard допускаются с `main`.
- Release допускается только по тегу `v*`, отправленному владельцем.
- Оба режима Marketplace допускаются только при ручном запуске владельцем
  с `main`. Environment `marketplace`, approval, точное подтверждение версии,
  проверка checksum и ограниченная передача `VSCE_PAT` сохранены. Эти workflows
  не запускают для проверки переноса CI.

В настройках Actions подтверждён `approval_policy=all_external_contributors`:
повторный внешний fork PR тоже требует проверки до допуска workflow. Одного
изменяемого PR-автором `if` недостаточно; внешний workflow нельзя approve
до проверки diff, особенно runner routing. На момент подготовки единственный
collaborator с правом записи — `krotname`.

## Совместимость и отложенные jobs

| Job | Runner | Условие готовности |
|---|---|---|
| Linux CI и packaging | `arc-prod-adler-vscode-mte` | Непривилегированный direct ARC с tokenless `arc-job` и штатными квотами |
| Windows E2E | `[self-hosted, Windows, X64, adler-white-vscode-mte]` | Проверенный отдельный Windows runner White; затем `CI_WINDOWS_E2E_ENABLED=true` |
| Docker Scorecard | `arc-prod-adler-docker-vscode-mte` | Проверенный отдельный repository-scoped DinD pool; затем `CI_DOCKER_SCORECARD_ENABLED=true` |

Оба opt-in флага по умолчанию отсутствуют: отложенные jobs пропускаются.
Windows check со статусом skipped не доказывает Windows E2E. VSIX packaging
требует успешных quality и Linux E2E; skipped Windows допускается только
пока флаг выключен. После включения флага Windows E2E также обязателен.
macOS job раньше отсутствовал; его проверка остаётся отдельной задачей для
Mac runner, Linux не служит заменой Windows/macOS.

`ossf/scorecard-action` остаётся Docker action с прежними параметрами,
OIDC/SARIF и публикацией результатов. Он не назначается direct runner и не
получает host Docker socket. Новому Docker pool нужны отдельное применение
через ProdOps и существующая общая квота Docker jobs; её не увеличивают.

Для Linux E2E нужен CI-образ ProdOps с Node 24 toolcache, Xvfb
и библиотеками Electron. При наличии `xauth` используется `xvfb-run`, иначе
job запускает Xvfb с автоматически выбранным display, без TCP listener,
в своём pod и завершает его по trap. Установка системного `xauth` не нужна.
Node устанавливается через закреплённый setup-node;
зависимости остаются в `package-lock.json`. Jobs ограничены таймаутами,
существующие permissions, artifact retention и SHA actions сохранены.
Workflow lint использует actionlint 1.7.12 и устанавливает pyflakes 3.4.0
в job-local virtualenv: composite action не зависит от отсутствующего в
direct-образе hosted `pipx` и не устанавливает системные пакеты через sudo.

## Приёмка

1. Подтвердить Argo `Synced/Healthy` и listener точного repository-scoped
   direct scale set. При `minRunners: 0` отсутствие idle runner нормально.
2. Проверить workflows локальным `actionlint`; открыть owner PR в `main`.
3. Подтвердить required Linux checks на окончательном PR SHA и runner names
   через Jobs API; записать Windows и Docker Scorecard как pending/skipped.
4. После merge подтвердить push CI на `main`, exact pool и уборку jobs.

До готовности direct pool изменения остаются reviewable веткой, а не
доказанным live переносом. Откат — отдельным PR; восстановление платного
hosted маршрута требует отдельного решения.
