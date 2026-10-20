<img src="public/favicon.svg" alt="" width="80" height="80" />

# clever-visual-cli

A visual interface for [clever-tools](https://github.com/CleverCloud/clever-tools), the Clever Cloud CLI, with a few extras on top. Every screen stands for a `clever` command: it shows it, with the real identifiers, and copies it in one click.

> **This is not a new Console.** The [Clever Cloud Console](https://console.clever-cloud.com) remains the place to create, configure and explore, and this page often sends you there. clever-visual-cli is something extra, for the days spent in the CLI. A community project, not affiliated with Clever Cloud.

**Try it: <https://sebprunier.github.io/clever-visual-cli/>**, sign in with an API token or through the Console; everything stays in your browser.

Status: usable every day on the organisation home, the application and add-on pages; see [what comes next](#what-comes-next).

## Who we are

[Mathieu Ancelin](https://github.com/mathieuancelin) and [Sébastien Prunier](https://github.com/sebprunier), both [Clever Cloud ambassadors](https://www.clever.cloud/blog/company/2025/12/16/clever-cloud-ambassadors-building-the-program-together/). Both of us have used Clever Cloud for more than ten years, across several organisations and dozens of applications.

## The idea

We like clever-tools, and we wanted the same CLI, visually: its commands laid out on a screen, over a whole organisation at once. Each screen names the command it stands for, ready to copy, so using it teaches clever-tools along the way and nothing here is out of reach of a script.

Then come the extras, the few things a screen does better than a terminal:

- filtering and grouping a whole organisation by tags, as in `project > env(prod,dev)`;
- costs per project and environment, from the billing data;
- acting on a selection: tags, restarts, stops, the logs of several applications side by side;
- one "To watch" card for failed deployments, stuck starts, databases on a retired version and operators with an update out;
- browsing a Cellar bucket, editing a configuration provider as a draft.

## Why it was easy

clever-tools and the Clever Cloud APIs are well designed and well documented. [`@clevercloud/client`](https://github.com/CleverCloud/clever-client.js), the library clever-tools and the Console are built on, runs in a browser as it is: the same commands, API token and OAuth authentication, log streams, and the APIs answer any origin. So this project is mostly interface work, a static page without a backend; the platform did the hard part. Thanks to the Clever Cloud teams for that.

## Principles

- **Front-end only.** A static page that talks to the Clever Cloud API from the browser. Nothing in between, nothing to host, no telemetry.
- **Your token stays with you.** Credentials live in your browser, encrypted, or for the tab only. Nothing goes anywhere but `api.clever-cloud.com`, `api-bridge.clever-cloud.com`, `console.clever-cloud.com`, and read-only calls to the public status page and to the npm registry (the latest clever-tools release, once a day).
- **Same foundation as the CLI.** All API logic comes from [`@clevercloud/client`](https://github.com/CleverCloud/clever-client.js), the library clever-tools and the official Console are built on.
- **Every screen names its command.** What the page does, clever-tools can do; the command is on screen with the real identifiers, and one click copies it. Commands are checked against one clever-tools release (5.2.0 today, named in the account menu); when npm has a newer one, the menu says so with its release notes, and a weekly workflow opens an issue to check the commands again.
- **English and French**, picked from the browser, switchable from the account menu.
- **Themes**: system (follows the computer's light or dark setting), light, dark, and a modern look after the Clever Cloud technologies page. Every palette is checked for WCAG AA contrast by the tests.
- **Open source**, Apache-2.0, built in the open, one feature at a time.

## What it does today

### Sign in

With an API token, through the Console (the `clever login` flow in a popup), or with an OAuth token/secret pair. Several accounts, kept encrypted in the browser (AES-256-GCM under a passphrase) or for the tab only.

### Organisation home

A dense list of every application and add-on, with the last deployment of each application and human activity told apart from platform maintenance, and the state of each add-on, read from its instances (a shared plan has none: it shows as "shared").

- **Filter** by expression: free text, `is:app`, `is:addon`, `is:node`, `is:postgresql` (the Console's slugs), `is:watch` (what the "To watch" card lists), `is:shared` (add-ons on a shared plan), `has:project`, any `key:value` tag (`project:shop`, `env:prod`), `tag:`, `runtime:`, `state:`, `name:`, combined with `AND` (implicit), `OR`, `NOT` or `-`, parentheses and quotes. Clickable examples under the field say what each token does.
- **Group** by expression: a tag key (`project`, `env`…) or `type`, `runtime`, `provider`, `state`, up to three levels, with an optional order of values (`project > env(prod,dev)`). An add-on without a tag inherits those of its linked applications. Filter and grouping live in the URL, so a view can be bookmarked and shared.
- **Sort** by any column from the header row: name, type, state, activity, links, cost. The order applies inside each group; sorting by cost also orders the groups by their total.
- **Favourite views**: the "Views" menu beside "Refresh" saves the current filter, grouping and sort under a name and lists the saved ones: a click applies one, and each copies its link (`?q=&g=&s=`, the sort included), is renamed in place or removed, with undo. The menu button names the current view when it is a favourite. They are kept per organisation in this browser, and can follow you to your other browsers (below).
- **Select and act**: checkboxes on rows, on every group and sub-group, and "select all" in the header, with shift+click for a range. On the selection, actions grouped in menus: "Tags" to add, remove or rename a tag, "Applications" to view their logs together, restart or stop them. Each action shows the exact list and the `clever` commands before confirming, ready to copy as a script (tags go through `clever curl`, clever-tools having no tag command), then a progress counter; tag changes can be undone from the notification. Clever Cloud imposes no tag convention; `project:<name>` and `env:<env>` are the author's.
- **Costs**, on demand: yesterday, the last 30 days, the latest invoice, and what the current configuration costs for a month where nothing changes. The selected source feeds a cost column, a total per group and sub-group (so `project > env` answers "what does the production of this project cost") and the total of the filtered list. Daily figures are the consumptions the billing system computes, the ones behind the Console's consumption page; the estimate prices started applications at their minimum instances for 720 hours, stopped ones at zero, plus add-on plans. Tax excluded, billing rights required.
- **Side column**: the Clever Cloud platform status from the public status page (one line while all is well), the applications to watch (failed deployment, stuck start, moderation, payment) the databases on a version Clever Cloud no longer offers and the operators with an update out, folded past a handful of entries, the applications opened recently. The costs, "To watch" and recent cards fold to their title, which keeps the amount or the count; the choice is remembered.

### Views sync

The favourite views and display preferences of every space can follow you from one browser to another, without a backend: they are kept in a configuration provider of your personal space, named `clever-visual-cli` (free plan). Nothing is created without a click: right after the first favourite, the "Views" menu offers to sync ("Enable" or "Not now"), and the account page does too, with the command that does the same (`clever addon create config-provider clever-visual-cli`). Another browser signed in to the same account finds the add-on and syncs with no question asked.

- One variable per space (`CVC_ORGA_…`, `CVC_USER_…`) holds its preferences and views as JSON, beside `CVC_META` (the format version); variables the app does not know are left alone.
- Read at sign-in and on demand ("Sync now" on the account page); written two seconds after the last local change, always after a fresh read, so what another browser wrote stays. Each part of a space keeps its newest copy.
- Never written while the add-on is linked to an application: Clever Cloud would redeploy it on every change.
- The platform takes a request body of about 5 MB at most (a 413 beyond, measured on the whole variable list, not per variable); the app stops at 4 MB, far above what views weigh.
- Deleting the add-on stops the sync; what each browser has stays there.

### Application page

- **Tags** under the name, edited from the pencil beside them in a dialog: remove some, add others with the organisation's tags as suggestions, see the `clever curl` calls, apply, undo from the notification.
- **Overview**, arranged by use: a band with the state, the running instances, the last deployment, the cost of yesterday and of the last 30 days, and the primary domain; scaling (dedicated build included), the options, the first domains and the recent activity; aside, the runtime, deployment and identifiers to read or copy. Changes go through "Edit", which shows the `clever` command.
- **Domains**: all of them, the primary first, with a filter for applications that have dozens.
- **Logs**: the application's, the access logs (status, method, path, duration, size, client), or both interleaved by date, the requests on a light tint; with filter, pause and a replay window.
- **Activity**, **environment variables** (hidden values, copy, `.env` export; after a change, a reminder with a restart button until the next deployment, since Clever Cloud applies them only then), and **dependencies**: the linked add-ons and applications, each opening its page, link and unlink, and the applications that depend on this one.
- Exposed configuration, TCP redirections, metrics and network groups stay with the Console.

Beside it, the list you came from, names only, with the same filter, grouping, order and collapsed groups as the home page, both editable in place. Another application opens on the same tab (from the logs of one to the logs of the next), and `Alt+↑` / `Alt+↓` move through the list. The column folds to a thin strip.

### Add-on page

- **Tags** under the name, edited as on an application page; the ones the add-on inherits from its linked applications for grouping are shown dashed.
- **Overview**: a band with the state, the plan, the instances, the cost of yesterday and of the last 30 days and the number of linked applications; the instances with their size and state, the linked applications, and aside the provider, plan, zone and identifiers.
- **Variables**: what the add-on exposes to the applications linked to it, hidden by default, with copy and `.env` export.
- **Cellar**: the overview adds the buckets, objects, total size and the traffic of the billing period. A **Buckets** tab lists the buckets and browses one like a file browser (directories first, 100 entries a page, the open folder in the URL so the back button and links work), with its versioning status and a download button that signs the URL only when clicked. Everything goes through the Clever Cloud API, without the S3 keys; clever-tools has no Cellar command, so the equivalent shown is the `clever curl` call.
- **Configuration providers**: their variables are edited in the Variables tab as a draft (rename, change, add, strike out, paste a `.env`), with what changes, the equivalent `clever config-provider set|rm` commands and the linked applications Clever Cloud will redeploy. The list is written in one go, after checking nobody changed it meanwhile, and the toast offers to undo.
- **Logs**: the add-on's live logs, with filter, pause and a replay window. A shared add-on has no instance of its own, so no logs either.
- **Databases** (PostgreSQL, MySQL, Redis, MongoDB): the overview adds the version, flagged when Clever Cloud no longer offers it, the host, port and database to copy, and the options chosen at creation (`clever addon create --option`). A **Backups** tab lists the daily backups to download, with the `clever database backups` commands and, for the chosen one, what comes next: the `pg_restore` or `mysql` command that loads it back (the password stays in the Variables tab), the archive to extract for Redis.
- **Operators** (Keycloak, Otoroshi): an operator has no add-on instance yet nothing shared, it runs as its entrypoint application, so its state in the list and on its page is that application's, and its instances and logs are on that application's page. The card gives the version, flagged when an update is out (an operator installed as `latest` takes the latest release at each build, so it is never called behind, whatever the version check says), links to open it (and Otoroshi's admin API and Swagger UI), what it is built on (the entrypoint application and the add-ons underneath, each opening its page) and its network group. Restart, rebuild and version update go through a dialog that shows the `clever keycloak|otoroshi` command; those commands are experimental in clever-tools 5.2 and need `clever features enable operators` once, which the card says. The initial credentials are not shown. An Otoroshi also gets the commands that add it to [otoroshictl](https://github.com/cloud-apim/otoroshictl), its own CLI, through `clever otoroshi get-config`.
- **Elasticsearch**: the same card with the Elasticsearch host, Kibana and APM when enabled (the service to open and the application running it). Its backups are snapshots: each one opens in Kibana and restores with the `curl` command the API gives; long lists show the 20 most recent first.

The same list column as on the application page sits beside it, and goes from applications to add-ons and back.

### Logs of several applications

From the selection of the home page ("Applications" › "View logs"), the live logs of up to twelve applications on one page, addressed by its URL: side by side in one to three columns, each panel with its own pause, filter and close, or merged into one feed interleaved by date, each application's name in its own colour (a click on it hides or shows it). The replay window, a filter and the pause apply to all of them; the `clever logs` commands copy together.

### Actions

From the palette or the page: restart, stop, cancel a deployment, scale, set the options, set, delete or import variables, add, remove or pick the primary domain, link or unlink add-ons and applications. Every dialog shows the equivalent `clever` command live, ready to copy.

### Command palette

`⌘K` / `Ctrl+K`: applications of every organisation, organisations, tabs of the current page, session actions, language.

## What comes next

Features, bugs and questions start as [issues](https://github.com/sebprunier/clever-visual-cli/issues); the issue is the spec. Open now:

- [#1](https://github.com/sebprunier/clever-visual-cli/issues/1) Named favourite views and their sync through a personal configuration provider: both are there, the sync to be tried on real accounts before the issue closes.

Add-ons ([#5](https://github.com/sebprunier/clever-visual-cli/issues/5), closed) cover the databases, Elasticsearch, configuration providers, Cellar and the Keycloak and Otoroshi operators; Matomo, Metabase and the rest will get their own issues.

Further out: PWA and shortcuts, static hosting on Clever Cloud itself, drains, network groups, API tokens, Kubernetes.

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
- **Home page data, not sensitive**: the links between applications and add-ons (`cvc.links.*`), the display preferences and favourite views per organisation (`cvc.home.*`, `cvc.favorites.*`), the folded side cards (`cvc.side.folded`), whether the sync offer was declined (`cvc.sync.declined`), the recently opened applications (`cvc.recents`), the daily consumptions and invoice lines already read (`cvc.costs.*`), the add-ons known to be on a shared plan, the database versions and the operators' version checks, kept a day (`cvc.addon-instances.*`, `cvc.db-versions.*`, `cvc.operator-versions.*`), the language (`cvc.locale`) and the latest clever-tools release, kept a day (`cvc.cli-release`), stay in `localStorage`; "Erase everything from this browser" removes them too. The time of the last change made to an application's variables (`cvc.env-changed`), for the reminder until its next deployment, stays in `sessionStorage`, gone with the tab.
- Threat model: the clever-tools configuration file sits in clear on disk. A static SPA without third-party scripts is no more exposed. The real risk is an XSS through displayed content (logs, names, variables), hence Lit (escaping by default), never `innerHTML`, and a strict CSP in production: no inline script but the theme one in `index.html`, allowed by its hash, and no `style` attribute (styles computed at render time go through the CSSOM, a test keeps it that way).
- The embedded OAuth consumer key is the clever-tools one, public by design (see `src/core/constants.ts`).

### Deployment

The site is published on GitHub Pages on every push to `main` by the `.github/workflows/deploy.yml` workflow (typecheck, tests, build, publish): <https://sebprunier.github.io/clever-visual-cli/>.

- `CVC_BASE=/clever-visual-cli/` at build time sets the base path; without it the build targets the root of any host (Clever Cloud static hosting, for instance).
- The production build injects a Content Security Policy as a `meta` tag: scripts and styles from the site only, network limited to the Clever Cloud APIs, the status page and the npm registry, images from any https origin for the logos.
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

[Apache-2.0](./LICENSE). Copyright 2026 Mathieu Ancelin and Sébastien Prunier.
