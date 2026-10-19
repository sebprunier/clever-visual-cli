# clever-visual-cli

An alternative Clever Cloud console, 100 % front-end, no backend.

The idea: keep the vocabulary and the logic of the official CLI ([clever-tools](https://github.com/CleverCloud/clever-tools)), but in a web interface designed for daily use, with a command palette at its centre. Every screen shows the equivalent `clever` command.

> Community project, not affiliated with Clever Cloud. Status: **phase 2, reads and actions, reworked home page (filter and grouping expressions, bulk tags), English and French interface**.

## Why not the CLI itself?

The clever-tools commands are bound to Node (argument parsing, file system, git, prompts). All the API logic, however, lives in [`@clevercloud/client`](https://github.com/CleverCloud/clever-client.js), the library both the CLI and the official Console are built on. It runs in the browser and exposes a "command pattern" client that natively handles:

- **API token** authentication (Bearer, through `api-bridge.clever-cloud.com`),
- **OAuth v1** authentication (the token/secret pair `clever login` stores),
- log streams over Server-Sent Events with reconnection,
- a resource id cache in `localStorage`.

The Clever Cloud APIs send CORS headers for any origin, so a static page can talk to them directly.

Gotcha met on the way: the client sends its `fetch` calls in `mode: 'same-origin'` by default, which a browser refuses for a cross-origin URL. `CcApiClient` needs `defaultRequestConfig: { isCorsEnabled: true }` (see `src/core/clever-client.ts`).

## Decisions

| Topic    | Choice                                                                |
| -------- | --------------------------------------------------------------------- |
| Stack    | Vite, TypeScript, Lit                                                 |
| UI       | Entirely home-made, no reuse of the Console components                |
| Backend  | None. Static site, `#` routing so it runs on any host                 |
| Language | English and French, picked from the browser, switchable from the menu |
| Licence  | Apache-2.0                                                            |

## What the application does today

- Sign in with an API token, through the Console (the `clever login` flow in a popup) or with an OAuth token/secret pair.
- Several accounts, stored encrypted in the browser or for the tab only.
- Command palette (`⌘K` / `Ctrl+K`): applications of every organisation, organisations, tabs of the current page, session actions, language.
- Organisation home: a dense list of applications and add-ons, with the last deployment of each application and human activity told apart from platform maintenance.
  - **Filter** by expression: free text, `is:app`, `is:addon`, `is:node`, `is:postgresql` (the Console's slugs), `is:watch` (the applications of the "To watch" card), `has:project`, any `key:value` tag (`project:name`, `env:prod`), `tag:`, `runtime:`, `state:`, `name:`, combined with `AND` (implicit), `OR`, `NOT` or `-`, parentheses and quotes.
  - **Group by** expression: a tag key (`project`, `env`…) or `type`, `runtime`, `provider`, `state`, up to three levels (`project > env(prod,dev)`, the order in parentheses is optional). An add-on without a tag inherits those of its linked applications ("inferred"). Filter and grouping live in the URL, so a view can be bookmarked.
  - **Bulk tags**: checkboxes (shift+click for a range, "select all" on the filtered result), then add, remove or rename a tag on the selection, with the exact list of API calls before applying, a progress counter, and "Undo" in the notification, which replays the inverse. Clever Cloud imposes no tag convention; `project:<name>:<env>` and `env:<env>` are the author's.
  - **Side column**, folded above the list on a narrow window: the Clever Cloud platform status read from the public status page (incidents in progress, last incident resolved, refreshed every five minutes), the applications to watch, the ones opened recently.
- Application page: overview, instances, deployments, environment variables (hidden values, copy, `.env` export), live logs with filter, pause and replay window.
- Actions, from the palette or the page buttons: restart, stop, cancel a deployment, scale, set, delete or import variables, add, remove or pick the primary domain. Every dialog shows the equivalent `clever` command live.
- Interface in English or French: the browser language by default, changeable from the account menu, the account page or the palette; the choice is remembered in the browser.

## Run

```sh
pnpm install
pnpm dev            # http://localhost:5173
pnpm dev:cli        # same, with a sign-in button that reads the machine's clever-tools profile
pnpm test           # unit tests (crypto, router, palette, actions, home page logic, i18n)
pnpm typecheck
pnpm build          # static site in dist/
pnpm spike:node     # checks @clevercloud/client from Node, without a browser
```

`pnpm dev:cli` enables a Vite middleware that serves the first profile of `~/.config/clever-cloud/clever-tools.json` on `/__cvc/dev-profile`. It is a development convenience, never part of the build, to enable on a trusted machine only.

## Credentials and security

- **Encrypted vault**: tokens are encrypted with AES-256-GCM under a key derived from a passphrase with PBKDF2-SHA256 (600 000 iterations), and stored in `localStorage`. So that the passphrase is not asked on every reload, the raw key is kept in `sessionStorage` while the tab is open; "Lock" erases it.
- **Session only**: plain JSON in `sessionStorage`, gone with the tab.
- **Home page data, not sensitive**: the links between applications and add-ons (`cvc.links.*`), the display preferences per organisation (`cvc.home.*`), the recently opened applications (`cvc.recents`) and the language (`cvc.locale`) stay in `localStorage`; "Erase everything from this browser" removes them too.
- Threat model: the clever-tools configuration file sits in clear on disk. A static SPA without third-party scripts is no more exposed. The real risk is an XSS through displayed content (logs, names, variables), hence Lit (escaping by default), never `innerHTML`, and a strict CSP in production.
- The embedded OAuth consumer key is the clever-tools one, public by design (see `src/core/constants.ts`).
- Nothing goes anywhere but `api.clever-cloud.com`, `api-bridge.clever-cloud.com` and `console.clever-cloud.com`, plus read-only calls to `www.clevercloudstatus.com` for the platform status.

## Deployment

The site is published on GitHub Pages on every push to `main` by the `.github/workflows/deploy.yml` workflow (typecheck, tests, build, publish): <https://sebprunier.github.io/clever-visual-cli/>.

- `CVC_BASE=/clever-visual-cli/` at build time sets the base path; without it the build targets the root of any host (Clever Cloud static hosting, for instance).
- The production build injects a Content Security Policy as a `meta` tag: scripts and styles from the site only, network limited to the Clever Cloud APIs, images from any https origin for the logos.
- Worth knowing: every page of a GitHub account shares the `sebprunier.github.io` origin, so the vault's `localStorage` is visible to the other projects published under that account. The vault is encrypted there, but a custom domain gives an isolated origin.

## What will not work without a backend

- `clever deploy` (git push), `clever ssh`, direct database access.
- Workarounds: redeploy the latest commit, applications linked to GitHub, show the CLI command to run locally.

## Code layout

```
src/core/      vault (crypto, profiles), session, router, palette model, actions, Console flow, i18n, home page logic
src/data/      the only module that imports the @clevercloud/client commands
src/i18n/      message dictionaries (en.ts is the reference, fr.ts must match its keys)
src/ui/        Lit components: shell, sign-in, unlock, palette, pages, dialogs
scripts/       checks outside the browser
```

## Roadmap

| Phase | Content                                                                                 | Status |
| ----- | --------------------------------------------------------------------------------------- | ------ |
| 0     | Spike: auth, organisations, applications, live logs                                     | done   |
| 1     | Read-only MVP: encrypted vault, several accounts, application page, palette             | done   |
| 2     | Actions: restart, stop, redeploy, cancel, scale, env, domains, with the CLI equivalent  | done   |
| 2b    | Home page for daily use: filter and grouping expressions, bulk tags, English and French | done   |
| 3     | Comfort: PWA, shortcuts, favourites, static hosting on Clever Cloud                     | to do  |
| 4     | Add-ons, backups, drains, network groups, API tokens, Kubernetes                        | to do  |

## Licence

[Apache-2.0](./LICENSE). Copyright 2026 Sébastien Prunier.
