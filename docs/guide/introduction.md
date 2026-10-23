# Introduction

clever-visual-cli is a visual interface of [clever-tools](https://github.com/CleverCloud/clever-tools), the Clever Cloud CLI, with a few extras. It lays the commands of the CLI out on screen, over a whole organisation at once, and every screen shows the `clever` command it stands for, with the real identifiers, ready to copy.

There is nothing to install: open <https://sebprunier.github.io/clever-visual-cli/> and [sign in with an API token](/guide/getting-started).

That address serves the latest release. The work in progress, built from `main` after each change, is at <https://sebprunier.github.io/clever-visual-cli/snapshot/>, with its own documentation under `snapshot/docs/`; its header shows a "snapshot" badge. A snapshot may break. It shares this browser's data (accounts, preferences, favourite views) with the release, so you sign in once for both.

## What it is {#what-it-is}

The same CLI, visually. What a page does, clever-tools can do, and the page tells you how: using the interface teaches clever-tools along the way, and nothing it does is out of reach of a script.

Then come the extras, the few things a screen does better than a terminal:

- filtering and grouping a whole organisation by tags, as in `project > env(prod,dev)`;
- costs per project and environment, from the billing data;
- acting on a selection: tags, restarts, stops, the logs of several applications side by side;
- one "To watch" card for failed deployments, stuck starts, databases on a retired version and operators with an update out;
- browsing a Cellar bucket, editing a configuration provider as a draft.

## What it is not {#what-it-is-not}

- **Not a new Console.** The [Clever Cloud Console](https://console.clever-cloud.com) remains the place to create, configure and explore, and clever-visual-cli often sends you there ("Open in the Console"). clever-visual-cli is something extra, for the days you spend in the CLI.
- **Not a service.** It is a static page without a backend, so what needs your own machine stays with clever-tools: `clever deploy` pushes your git repository, `clever ssh` opens a shell, and a browser cannot reach a database directly.
- **Not a Clever Cloud product.** It is a community project, not affiliated with Clever Cloud.

## Who made it {#who}

[Mathieu Ancelin](https://github.com/mathieuancelin) and [Sébastien Prunier](https://github.com/sebprunier), both [Clever Cloud ambassadors](https://www.clever.cloud/blog/company/2025/12/16/clever-cloud-ambassadors-building-the-program-together/). Both have used Clever Cloud for more than ten years, across several organisations and dozens of applications. They like clever-tools, and wanted the same CLI on a screen.

## Principles {#principles}

- **Front-end only.** A static page that talks to the Clever Cloud API from your browser. Nothing in between, nothing to host, no telemetry.
- **Your token stays with you.** You sign in with an API token, kept in your browser, encrypted under a passphrase or for the tab only. It goes nowhere but the Clever Cloud API. See [Security and privacy](/guide/security).
- **Same foundation as clever-tools.** All the API logic comes from [`@clevercloud/client`](https://github.com/CleverCloud/clever-client.js), the library clever-tools and the Console are built on.
- **Every screen names its command.** The command is on screen with the real identifiers, and one click copies it. The commands are checked against one clever-tools release, 5.2.0 today, named at the bottom of the account menu ("Commands checked with clever‑tools 5.2.0"). When npm has a newer release, a dot appears on the account button and the menu says so, with a link to the release notes. Where clever-tools has no command, as for tags or Cellar, the interface shows the `clever curl` call that does the same.
- **English and French.** The language is picked from your browser, and you can switch it from the account menu, or before signing in from the sign-in and unlock pages.
- **Themes.** System (follows the light or dark setting of your computer), Light, Dark, and Modern, a look after the Clever Cloud technologies page. Every palette is checked for WCAG AA contrast by the tests.
- **Open source.** Apache-2.0, built in the open on [GitHub](https://github.com/sebprunier/clever-visual-cli), one feature at a time. Features, bugs and questions start as [issues](https://github.com/sebprunier/clever-visual-cli/issues).

## Why it was easy {#why-easy}

clever-tools and the Clever Cloud APIs are well designed and well documented. `@clevercloud/client` runs in a browser as it is: the same commands, API token authentication, log streams, and the APIs answer requests from any origin. So clever-visual-cli is mostly interface work, a static page without a backend; the platform did the hard part. Thanks to the Clever Cloud teams for that.

## Where to go next {#next}

- [Getting started](/guide/getting-started): create an API token, sign in, choose how to keep access.
- [Organisation home](/guide/organisation-home): the list, filters, grouping, favourite views, selections and costs.
- [Application page](/guide/application) and [Add-ons](/guide/addons): what each resource shows and the actions it offers.
- [Logs of several applications](/guide/logs): side by side or merged.
- [Command palette and shortcuts](/guide/palette): `⌘K` / `Ctrl+K`.
- [Views sync](/guide/views-sync): your favourite views in every browser.
- [Security and privacy](/guide/security): what is stored where, and what is called.
- Reference: [filter expressions](/reference/filters), [grouping expressions](/reference/grouping), [troubleshooting](/reference/troubleshooting).
