# Troubleshooting

Common situations, what they mean and what to do. Messages are quoted as the English interface shows them.

## "[401]" errors: the token is refused {#invalid-token}

An error starting with `[401]`, such as `[401]: Invalid token`, means the Clever Cloud API refused the API token. clever-visual-cli shows the message the API sends, prefixed with its HTTP status. It shows on the sign-in page, or, once signed in, where the data would be: in place of the whole page, with a **Retry** button, when the organisations cannot load.

The usual causes:

- **Revoked**: the token was deleted, from the Console (Profile → API tokens) or with `clever tokens revoke`.
- **Expired**: an API token has an expiry date. `clever tokens create` gives it one year by default (`--expiration` sets a shorter one, never more than a year).
- **Mistyped**: a character missing or a space added while pasting. The value of a token is shown once, when it is created: if you no longer have it, create another one.

`clever tokens` lists your tokens with their expiration and state. Create a new one:

```sh
clever tokens create clever-visual-cli
```

Sign in with it: **Add an account**, on the "Accounts in this browser" page of the account menu or in the palette. To drop the account whose token no longer works, make it the active one, then **Sign out** in the account menu, which removes this account from the browser. See [getting started](/guide/getting-started#api-token).

## Accounts removed after the switch to API tokens {#accounts-removed}

clever-visual-cli signs in with an API token only. An earlier version also accepted signing in through the Console or with the OAuth pair of `clever login`; that borrowed the identity of clever-tools, so those accounts are now removed from the browser. The sign-in page says so when no account is left, and a notice when other accounts are:

> An account signed in through the Console or with an OAuth pair was removed from this browser: it used the identity of clever-tools. Sign in again with an API token.

Nothing changed on Clever Cloud's side. Create an API token, in the Console (Profile → API tokens) or with `clever tokens create clever-visual-cli`, and sign in again with it.

## No costs {#no-costs}

Costs are the figures of the Console's consumption page, and they need billing rights on the organisation. Without them, the **Costs** menu says "unavailable: …" with the error the API returned, and the cost of an application or add-on page reads "unavailable", the error in its tooltip.

Ask an administrator of the organisation for billing rights, or look at the costs from an account that has them. The rest of the interface works without.

"Where do these figures come from?", in the **Costs** menu, says what each source counts. A resource at zero over a period cost nothing then; "Current configuration" leaves out storage, traffic and add-ons without a known price, hence a dash.

## Costs take a while to load {#costs-slow}

"Yesterday" and "Last 30 days" come from the daily consumptions the billing system computes each night: one API call per day, so 30 days are 30 calls, made four at a time, the newest first so yesterday shows before the rest. Meanwhile the "Last 30 days" source of the menu and the cost of an application or add-on page show the progress, as "12 / 30 days".

A day never changes once computed, so the days already read stay in this browser: next time, only the missing days are asked for. The first reading of an organisation is the slow one.

## A deployment stays queued {#deployment-queued}

Clever Cloud queues a deployment before running it. The logs of that deployment show it as "queued" and say "The deployment is queued: its lines will show as soon as it starts." The page follows it: leave it open, and the lines come in once it leaves the queue.

The queue is on the platform side: nothing in clever-visual-cli makes a deployment start sooner. When it lasts, look at the Clever Cloud status, in the side column of the home page or on [clevercloudstatus.com](https://www.clevercloudstatus.com/), for an incident in progress.

While queued, the deployment may not show in the **Activity** tab yet, and its banner reads "Logs of the deployment of &lt;date&gt;": its number comes once it has started. After a restart of several applications, the logs page says "The restarts are queued: their lines will show as soon as they start."

## The logs of a deployment are empty {#deployment-logs-empty}

- **Queued**: "The deployment is queued: its lines will show as soon as it starts." The logs API does not know a deployment before it leaves the queue (run too early, the clever-tools command may answer "Application not found"); the page waits for it.
- **Never started**: "This deployment never left the queue: it has no lines.", for a deployment that ended in the queue.
- **Running, nothing yet**: "Connected, waiting for lines." The lines start one minute before the deployment.
- **Waiting for the deployment…** stays on: the page is reading the deployment, and asks again a few times, a deployment just started taking a moment to be readable. If an error replaces it, the deployment id in the URL may not belong to this application.

The logs of a deployment are its application logs only: access logs have no deployment filter. See [logs of one deployment](/guide/application#deployment-logs).

## The views sync refuses to write {#sync-refused}

The sync keeps your favourite views in a configuration provider of your personal space, `clever-visual-cli`. Two checks run before every write; when one fails, the **Views** menu and the account page say "Sync failed: …":

- "The sync add-on is linked to an application, which each change would redeploy: unlink it first." Clever Cloud redeploys the applications linked to a configuration provider whenever its variables change, so the sync never writes while one is linked. Open the add-on (**Open the add-on** on the account page), see its linked applications, and unlink them from the **Dependencies** tab of each one (`clever service unlink-addon <addon_id> --app <app_id>`). Then **Sync now**.
- "The views and preferences are too large to sync: the platform takes up to 5 MB." Remove the favourite views you no longer use, then **Sync now**.

Nothing is lost meanwhile: the views stay in this browser. See [views sync](/guide/views-sync).

## "clever-tools … is out" {#cli-release}

The commands the interface shows are checked against one clever-tools release, named at the bottom of the account menu: "Commands checked with clever-tools 5.2.0". Once a day, clever-visual-cli asks the npm registry for the latest release. When a newer one is out, a dot marks the account menu, and the menu says, for instance, "clever-tools 5.3.0 is out; the commands are checked with 5.2.0.", with a link to its **Release notes**.

The commands most likely still work: read the release notes for what changed, and run `clever version` to see the release you have. A weekly workflow of the project opens an issue when npm is ahead, so the commands get checked against the new release. If you find one that no longer works, say so in an [issue](https://github.com/sebprunier/clever-visual-cli/issues).

## The vault passphrase is lost {#passphrase-lost}

The passphrase is never stored: the key that encrypts the tokens is derived from it, so nobody can recover it. A wrong one says "Wrong passphrase."

On the unlock page, "Lost your passphrase?" offers **Forget this vault**, then asks to confirm: "The vault will be erased from this browser. Your tokens stay valid on Clever Cloud’s side." Once it is erased, sign in again with an API token.

The tokens that were in the vault still work. If you no longer use them, revoke them: list them with `clever tokens`, then `clever tokens revoke <api_token_id>`, or from the Console (Profile → API tokens).

## Private browsing, or storage blocked {#storage-blocked}

clever-visual-cli keeps everything in the browser: the encrypted vault and your preferences in `localStorage`, the key of an unlocked vault and the "This tab only" accounts in `sessionStorage`. When the browser refuses that storage (site data blocked, a full quota, some private windows), the page still works for this page load, but nothing is kept: after a reload or in a new tab, you sign in again, and the preferences, favourite views and costs already read are gone.

A private window that does allow storage still forgets it all when it closes: there, "This tab only" is the natural choice when asked how to keep the access. To keep an encrypted vault between visits, use a normal window that allows site data for the page. See [security and privacy](/guide/security).
