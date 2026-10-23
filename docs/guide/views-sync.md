# Views sync

Your [favourite views](/guide/organisation-home) and the display preferences of the home page are kept in the browser you use. Synced, they follow you to every browser signed in to the same account, without a backend: they are kept in a configuration provider of your personal space, a free add-on named `clever-visual-cli`.

Nothing is created without a click from you.

## Enable it {#enable}

You can turn the sync on from two places.

**From the "Views" menu.** Right after you save your first favourite view, the menu stays open and asks: "Sync your views between your browsers? This creates a free add-on, a configuration provider named clever-visual-cli, in your personal space." Below are the command that does the same and two buttons:

- "Enable" creates the add-on ("Creating the add-on…"), then writes what this browser has.
- "Not now" dismisses the offer: the "Views" menu no longer makes it in this browser. The account page still does.

**From the account page.** "Accounts in this browser", opened from the account menu, has a "Views sync" card. While the sync is off, it explains what the sync does, shows the command and offers "Enable", even after "Not now".

![The "Accounts in this browser" page, with the "Views sync" card](/screenshots/account.png)

The command is the clever-tools equivalent of "Enable":

```sh
clever addon create config-provider clever-visual-cli
```

Creating the add-on yourself with it does the same: clever-visual-cli finds the add-on by its name in your personal space.

**In your other browsers**, there is nothing to do: signed in to the same account, a browser finds the add-on at sign-in and syncs with no question asked.

The sync follows the active account: each account syncs through the add-on of its own personal space.

## What it looks like when on {#status}

- In the "Views" menu, under your views: "Synced between your browsers · last sync …", or "Syncing…" while it works. A failure reads "Sync failed: …" with a "Retry" button.
- On the account page, the "Views sync" card gives the same line, an "Open the add-on" link to its page, and a "Sync now" button.

The add-on also shows in the list of your personal space, like any other add-on. Its pencil is disabled: renamed, the add-on would no longer be found, and the sync would offer to create another one.

## What is stored {#what-is-stored}

The add-on holds a few environment variables:

| Variable        | What it holds                                                        |
| --------------- | -------------------------------------------------------------------- |
| `CVC_META`      | The version of the format: `{"version":1}`.                          |
| `CVC_ORGA_<ID>` | The preferences and favourite views of one organisation, as JSON.    |
| `CVC_USER_<ID>` | The preferences and favourite views of your personal space, as JSON. |

The variable name is the identifier of the space in capitals, every character other than a letter or a digit turned into `_`: `orga_dda58ca6-…` becomes `CVC_ORGA_DDA58CA6_…`.

For each space, two parts travel:

- **the display preferences**: the last grouping (used when the link carries none), the sort, the collapsed groups, and whether costs are shown and from which source;
- **the favourite views**: the name, filter, grouping and sort of each.

Nothing else goes there: not your accounts or tokens, not the language or the theme, not the recently opened applications or the data kept in cache. Variables without the `CVC_` prefix, and `CVC_` ones this version does not know, are left as they are.

To read them, open the add-on's Variables tab, or run:

```sh
clever config-provider get clever-visual-cli
```

## When it reads and writes {#when}

- **Reads** when you sign in or open the page, right after "Enable", and when you click "Sync now" (or "Retry").
- **Writes** two seconds after your last change to a view or a preference, always after a fresh read, so what another browser wrote in the meantime stays.
- **Newest wins, part by part.** In each space, the preferences and the favourite views each carry the time of their last change, and the newer copy of each part wins. The favourite views count as one list, so a view you removed does not come back from an older copy that still has it.

When a sync brings changes to the organisation on screen, its home page takes them at once.

## Limits {#limits}

- **Never written while the add-on is linked to an application.** Clever Cloud redeploys the applications linked to a configuration provider on every change of its variables. If the add-on is linked, the sync stops before writing with "The sync add-on is linked to an application, which each change would redeploy: unlink it first."
- **Size.** The platform takes a request body of about 5 MB at most, measured on the whole list of variables, not per variable, and answers 413 beyond. clever-visual-cli stops at 4 MB ("The views and preferences are too large to sync: the platform takes up to 5 MB."), far above what views weigh.

## Stop it {#stop}

Delete the add-on, from the Console or with clever-tools:

```sh
clever addon delete clever-visual-cli
```

The sync stops; what each browser has stays there. An open page notices at its next read or write, or when you click **Refresh**: the "Views sync" card says the add-on no longer exists, and offers to enable the sync again, which creates a new add-on.
