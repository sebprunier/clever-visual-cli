# Security and privacy

clever-visual-cli is a static page without a backend: your browser talks to the Clever Cloud API directly, with nothing in between. This page says what it keeps in your browser, what it calls, and how it protects your token.

## API tokens only {#api-tokens}

You sign in with an [API token](/guide/getting-started#api-token), created in the Console (Profile → API tokens) or with `clever tokens create clever-visual-cli`. The token is sent as a Bearer header to `api-bridge.clever-cloud.com`, the entry point of the Clever Cloud API for API tokens.

An API token is an identity of its own: created for this purpose, with an expiry date, revocable at any time with `clever tokens revoke <api-token-id>` or from the Console. The OAuth credentials of the Console sign-in and of `clever login` are not accepted, as they would borrow the identity of clever-tools ([why](/guide/getting-started#oauth)).

## Where things are stored {#storage}

Everything stays in your browser, in the storage of the page's origin.

### Your accounts and tokens

- **Encrypted vault** (`cvc.vault` in `localStorage`): the tokens are encrypted with AES-256-GCM under a key derived from your passphrase with PBKDF2-SHA256 (600 000 iterations, a random 16-byte salt), with a fresh 12-byte IV at each write. So that the passphrase is not asked on every reload, the raw key is kept in `sessionStorage` (`cvc.vault.key`) while the tab is open; "Lock" erases it, and so does closing the tab. The passphrase itself is never stored.
- **Session only** (`cvc.vault.session` in `sessionStorage`): plain JSON, gone with the tab.

### Preferences and cached data, not sensitive

These stay in `localStorage`:

| Key                       | What it holds                                                             |
| ------------------------- | ------------------------------------------------------------------------- |
| `cvc.links.*`             | The links between applications and add-ons, per organisation.             |
| `cvc.home.*`              | The display preferences of the home page, per organisation.               |
| `cvc.favorites.*`         | The favourite views, per organisation.                                    |
| `cvc.side.folded`         | The side cards you folded.                                                |
| `cvc.sync.declined`       | Whether you declined the offer to sync the views.                         |
| `cvc.recents`             | The applications opened recently.                                         |
| `cvc.costs.*`             | The daily consumptions and invoice lines already read.                    |
| `cvc.addon-instances.*`   | The add-ons known to be on a shared plan, kept a day.                     |
| `cvc.db-versions.*`       | The database versions, kept a day.                                        |
| `cvc.operator-versions.*` | The version checks of the operators, kept a day.                          |
| `cvc.cli-release`         | The latest clever-tools release on npm, kept a day.                       |
| `cvc.resource-ids`        | The cache of resource identifiers kept by `@clevercloud/client`.          |
| `cvc.locale`              | The language.                                                             |
| `cvc.theme`               | The theme.                                                                |
| `cvc.lastOwnerId`         | The organisation opened last, where the next visit starts.                |
| `cvc.appNav`              | Whether the list beside an application or add-on page is folded.          |
| `cvc.logs.mode`           | Application logs, access logs or both, on the Logs tab of an application. |
| `cvc.logs.layout`         | The layout of the logs of several applications.                           |

And in `sessionStorage`, gone with the tab: `cvc.env-changed`, the time of the last change made to an application's variables, for the reminder shown until its next deployment.

If you turn on the [views sync](/guide/views-sync), the display preferences and favourite views also go to the `clever-visual-cli` add-on of your personal space, on Clever Cloud. Nothing else does.

## The hosts it calls {#hosts}

| Host                          | Why                                                                     |
| ----------------------------- | ----------------------------------------------------------------------- |
| `api-bridge.clever-cloud.com` | The Clever Cloud API, with your API token.                              |
| `api.clever-cloud.com`        | The Clever Cloud API.                                                   |
| `www.clevercloudstatus.com`   | The public status page of the platform, read-only, without any token.   |
| `registry.npmjs.org`          | The latest clever-tools release, at most once a day, without any token. |

Besides, the browser loads the page itself from where it is hosted, and the logos of runtimes and add-ons from the addresses the API gives. The links you click (the Console, a backup to download, the status page, release notes) open as ordinary pages, in a new tab.

## Content Security Policy {#csp}

The published page carries a strict Content Security Policy, as a `meta` tag since static hosts such as GitHub Pages send no custom headers:

```
default-src 'self';
script-src 'self' 'sha256-…';
style-src 'self';
img-src 'self' https: data:;
font-src 'self';
connect-src 'self' https://api.clever-cloud.com https://api-bridge.clever-cloud.com https://www.clevercloudstatus.com https://registry.npmjs.org;
base-uri 'self';
form-action 'self';
object-src 'none'
```

- **Scripts** come from the site only. The one inline script, which applies your theme before the first paint, is allowed by its hash.
- **Styles** come from the site only, and no `style` attribute is allowed: the styles computed while rendering go through the CSSOM, and a test keeps it that way.
- **Network calls** go only to the four hosts above.
- **Images** come from the site or any https address, for the logos.

## What is never sent anywhere {#never-sent}

- Your token goes to the Clever Cloud API and nowhere else. Your passphrase never leaves the browser.
- No telemetry, no analytics, no third-party script or font.
- The costs exports (CSV, JSON, Markdown) are built in the browser from what the page loaded; nothing is sent anywhere.
- The views sync is off until you enable it, and then writes only to your own add-on on Clever Cloud.

## Threat model {#threat-model}

- **Compared with clever-tools.** clever-tools keeps its credentials in a configuration file, in clear on disk. A static page without third-party scripts, with your tokens encrypted, is no more exposed.
- **Displayed content.** The real risk is a script injected through what the page displays: logs, names, variables. The interface is built with Lit, which escapes what it renders by default, never writes raw HTML, and runs under the strict policy above.
- **An unlocked tab.** While a tab is unlocked, the key sits in its `sessionStorage`: a script running in the page's origin could read it, which is the same exposure as the unlocked state itself. Lock the vault when you step away, or choose "This tab only" on a computer you share.
- **A shared origin.** Every page published under a GitHub account shares its `github.io` origin, so the `localStorage` of <https://sebprunier.github.io/clever-visual-cli/> is visible to the other projects published under that account. The vault is encrypted there; a custom domain gives an isolated origin.
- **Signing out is not revoking.** "Sign out" and "Erase everything from this browser" remove the token from this browser, not from Clever Cloud. Revoke a token you no longer use with `clever tokens revoke <api-token-id>` or from the Console.

## Erase everything {#erase}

"Erase everything from this browser", on the "Accounts in this browser" page, acts at once and removes every key of clever-visual-cli, all starting with `cvc.`, from `localStorage` and `sessionStorage`:

- the vault and every account in it, encrypted or not, with the key of the tab;
- the cache of `@clevercloud/client`, the home page data, the costs, the add-on caches and the clever-tools release;
- the language, the theme, the organisation opened last, the folded list, the two logs layouts and `cvc.env-changed`.

The page keeps its language and theme until it is loaded again; the next visit starts from the settings of the browser. Nothing changes on Clever Cloud's side: your tokens stay valid, and the views sync add-on stays.

On the unlock page, "Forget this vault" erases the vault alone.
