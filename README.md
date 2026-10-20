# clever-visual-cli

A Clever Cloud console for daily use, as a single static page: no backend, your own API token, the same client library as the official CLI.

> Community project, not affiliated with Clever Cloud. Status: usable every day on the organisation home and the application page; see [what comes next](#what-comes-next).

## The idea

I have been a Clever Cloud user for more than ten years, across several organisations and dozens of applications. The official Console is good at discovering and configuring. Day-to-day operations ask for something else: density, speed, and working on sets of applications rather than one at a time. This is the console I wanted for that.

It is a visual CLI first. Every screen shows the `clever` command it stands for, so using it teaches [clever-tools](https://github.com/CleverCloud/clever-tools) along the way. And where a screen does better than a terminal, it goes further: filter expressions, grouping by tags, consolidated costs per project and environment, bulk actions on a selection, soon the logs of several applications side by side.

## Principles

- **Front-end only.** A static page that talks to the Clever Cloud API from the browser. Nothing in between, nothing to host, no telemetry.
- **Your token stays with you.** Credentials live in your browser, encrypted, or for the tab only. Nothing goes anywhere but `api.clever-cloud.com`, `api-bridge.clever-cloud.com`, `console.clever-cloud.com`, and read-only calls to the public status page.
- **Same foundation as the CLI.** All API logic comes from [`@clevercloud/client`](https://github.com/CleverCloud/clever-client.js), the library clever-tools and the official Console are built on.
- **Every screen names its command.** What the page does, clever-tools can do; the command is on screen, with the real identifiers.
- **English and French**, picked from the browser, switchable from the menu.
- **Open source**, Apache-2.0, built in the open, one feature at a time.

## What it does today

### Sign in

With an API token, through the Console (the `clever login` flow in a popup), or with an OAuth token/secret pair. Several accounts, kept encrypted in the browser (AES-256-GCM under a passphrase) or for the tab only.

### Organisation home

A dense list of every application and add-on, with the last deployment of each application and human activity told apart from platform maintenance.

- **Filter** by expression: free text, `is:app`, `is:addon`, `is:node`, `is:postgresql` (the Console's slugs), `is:watch` (the applications of the "To watch" card), `has:project`, any `key:value` tag (`project:shop`, `env:prod`), `tag:`, `runtime:`, `state:`, `name:`, combined with `AND` (implicit), `OR`, `NOT` or `-`, parentheses and quotes. Clickable examples under the field say what each token does.
- **Group** by expression: a tag key (`project`, `env`…) or `type`, `runtime`, `provider`, `state`, up to three levels, with an optional order of values (`project > env(prod,dev)`). An add-on without a tag inherits those of its linked applications. Filter and grouping live in the URL, so a view can be bookmarked and shared.
- **Sort** by any column from the header row: name, type, state, activity, links, cost. The order applies inside each group; sorting by cost also orders the groups by their total.
- **Select and act**: checkboxes on rows, on every group and sub-group, and "select all" in the header, with shift+click for a range. On the selection: restart or stop the applications, or add, remove or rename a tag. Each action shows the exact list and the `clever` commands or API calls before confirming, then a progress counter; tag changes can be undone from the notification. Clever Cloud imposes no tag convention; `project:<name>` and `env:<env>` are the author's.
- **Costs**, on demand: yesterday, the last 30 days, the latest invoice, and what the current configuration costs for a month where nothing changes. The selected source feeds a cost column, a total per group and sub-group (so `project > env` answers "what does the production of this project cost") and the total of the filtered list. Daily figures are the consumptions the billing system computes, the ones behind the Console's consumption page; the estimate prices started applications at their minimum instances for 720 hours, stopped ones at zero, plus add-on plans. Tax excluded, billing rights required.
- **Side column**: the Clever Cloud platform status from the public status page, the applications to watch (failed deployment, stuck start, moderation, payment), the ones opened recently.

### Application page

Overview, instances, deployments, environment variables (hidden values, copy, `.env` export), live logs with filter, pause and a replay window.

### Actions

From the palette or the page: restart, stop, cancel a deployment, scale, set, delete or import variables, add, remove or pick the primary domain. Every dialog shows the equivalent `clever` command live.

### Command palette

`⌘K` / `Ctrl+K`: applications of every organisation, organisations, tabs of the current page, session actions, language.

## What comes next

Features, bugs and questions start as [issues](https://github.com/sebprunier/clever-visual-cli/issues); the issue is the spec. Open now:

- [#1](https://github.com/sebprunier/clever-visual-cli/issues/1) Named favourite views, export/import, and sync through a personal configuration provider, so favourites follow you from one machine to another without a backend.
- [#2](https://github.com/sebprunier/clever-visual-cli/issues/2) Copy any `clever` command to the clipboard, complete and runnable as shown.
- [#3](https://github.com/sebprunier/clever-visual-cli/issues/3) Logs of a set of applications: a grid, or one merged feed.
- [#4](https://github.com/sebprunier/clever-visual-cli/issues/4) Themes: light, dark and a modern look, chosen in the app.

Further out: PWA and shortcuts, static hosting on Clever Cloud itself, add-ons and backups, drains, network groups, API tokens, Kubernetes.

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

## How it holds together

### The client

The clever-tools commands are bound to Node (argument parsing, file system, git, prompts). All the API logic, however, lives in `@clevercloud/client`, which runs in the browser and exposes a "command pattern" client that natively handles API token authentication (Bearer, through `api-bridge.clever-cloud.com`), OAuth v1 authentication (the token/secret pair `clever login` stores), log streams over Server-Sent Events with reconnection, and a resource id cache. The Clever Cloud APIs send CORS headers for any origin, so a static page can talk to them directly.

Gotcha met on the way: the client sends its `fetch` calls in `mode: 'same-origin'` by default, which a browser refuses for a cross-origin URL. `CcApiClient` needs `defaultRequestConfig: { isCorsEnabled: true }` (see `src/core/clever-client.ts`). Only `src/data/api.ts` imports the client's commands; the rest of the code never sees them.

### Credentials and security

- **Encrypted vault**: tokens are encrypted with AES-256-GCM under a key derived from a passphrase with PBKDF2-SHA256 (600 000 iterations), and stored in `localStorage`. So that the passphrase is not asked on every reload, the raw key is kept in `sessionStorage` while the tab is open; "Lock" erases it.
- **Session only**: plain JSON in `sessionStorage`, gone with the tab.
- **Home page data, not sensitive**: the links between applications and add-ons (`cvc.links.*`), the display preferences per organisation (`cvc.home.*`), the recently opened applications (`cvc.recents`), the daily consumptions and invoice lines already read (`cvc.costs.*`) and the language (`cvc.locale`) stay in `localStorage`; "Erase everything from this browser" removes them too.
- Threat model: the clever-tools configuration file sits in clear on disk. A static SPA without third-party scripts is no more exposed. The real risk is an XSS through displayed content (logs, names, variables), hence Lit (escaping by default), never `innerHTML`, and a strict CSP in production.
- The embedded OAuth consumer key is the clever-tools one, public by design (see `src/core/constants.ts`).

### Deployment

The site is published on GitHub Pages on every push to `main` by the `.github/workflows/deploy.yml` workflow (typecheck, tests, build, publish): <https://sebprunier.github.io/clever-visual-cli/>.

- `CVC_BASE=/clever-visual-cli/` at build time sets the base path; without it the build targets the root of any host (Clever Cloud static hosting, for instance).
- The production build injects a Content Security Policy as a `meta` tag: scripts and styles from the site only, network limited to the Clever Cloud APIs and the status page, images from any https origin for the logos.
- Worth knowing: every page of a GitHub account shares the `sebprunier.github.io` origin, so the vault's `localStorage` is visible to the other projects published under that account. The vault is encrypted there, but a custom domain gives an isolated origin.

### What will not work without a backend

`clever deploy` (git push), `clever ssh`, direct database access. Workarounds: redeploy the latest commit, applications linked to GitHub, show the CLI command to run locally.

### Code layout

```
src/core/      vault (crypto, profiles), session, router, palette model, actions, Console flow, i18n, home page logic
src/data/      the only module that imports the @clevercloud/client commands
src/i18n/      message dictionaries (en.ts is the reference, fr.ts must match its keys)
src/ui/        Lit components: shell, sign-in, unlock, palette, pages, dialogs
scripts/       checks outside the browser
```

Stack: Vite, TypeScript, Lit, no UI library, `#` routing so the page runs on any host.

## Contributing

- Features, bugs and questions start as an issue, in English; the issue is the spec, the discussion happens there.
- Documentation, comments and commit messages are in English. Interface strings go through `t()` with an English and a French entry.
- Work lands on `main`; the project learns by walking.

## Licence

[Apache-2.0](./LICENSE). Copyright 2026 Sébastien Prunier.
