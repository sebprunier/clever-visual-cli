# Getting started

You need a Clever Cloud account and a browser; there is nothing to install. Open <https://sebprunier.github.io/clever-visual-cli/>, then follow the steps below.

## Create an API token {#api-token}

clever-visual-cli signs in with an API token, and only with one. An API token is an identity of its own: created for this purpose, with an expiry date, and revocable at any time without touching your other access.

Create one in either of these ways:

- **In the Console**: Profile → API tokens.
- **With clever-tools**:

  ```sh
  clever tokens create clever-visual-cli
  ```

  clever-tools asks for your password, and for your 2FA code if you use one, then prints the token once: copy it. The token lasts a year unless you pass `--expiration` with a shorter duration (`4d`, `2w`, `6M`); a year is the maximum. An account linked through GitHub without a password must set one first, and clever-tools says where.

`clever tokens` lists your API tokens, and `clever tokens revoke <api-token-id>` revokes one.

## Sign in {#sign-in}

![The sign-in page, with the API token field and the language switch](/screenshots/sign-in.png)

1. Paste the token in the "API token" field.
2. Click "Sign in".

The token is checked against the Clever Cloud API before anything is stored. When it is accepted, the page greets you ("Signed in: …") and asks how to keep this access.

The language switch, "English · Français", sits at the top right of the sign-in page, beside a "Documentation" link, and at the top right of the unlock page too. The interface starts in the first language of your browser it knows, English otherwise; the choice you make is kept in this browser.

## Choose how to keep access {#keep-access}

"How should this access be kept in this browser?" You answer once, with the first account; the accounts you add later are kept the same way.

### Encrypted with a passphrase

Type a passphrase of at least 8 characters, then its "Confirmation", and click "Save".

Your tokens are encrypted with AES-256-GCM, under a key derived from the passphrase with PBKDF2-SHA256 (600 000 iterations), and stored in the browser's `localStorage`. They stay available after the browser closes. A reload of the same tab does not ask for the passphrase again; a new tab does. The passphrase itself is never stored. See [Security and privacy](/guide/security#storage) for the details.

### This tab only

Click "Continue without saving". The access is kept in the tab's `sessionStorage` and disappears when the tab closes: next time, you sign in again with your token.

To switch from one choice to the other, remove the accounts of this browser ("Sign out" for each, or "Erase everything from this browser") and sign in again.

## Unlock the vault {#unlock}

With an encrypted vault, a new tab opens on "Vault locked". Enter your passphrase and click "Unlock". A wrong one gets "Wrong passphrase."

Lost your passphrase? There is no way to recover it. Click "Forget this vault", then "Confirm": the vault is erased from this browser, and your tokens stay valid on Clever Cloud's side. Sign in again with a token; create a new one if you no longer have it.

## Several accounts {#accounts}

![The "Accounts in this browser" page, with the views sync card](/screenshots/account.png)

One browser can hold several Clever Cloud accounts. They are listed on the "Accounts in this browser" page, opened from the account menu: each with its name, its e-mail and "API token", the active one marked "active", the others with a "Use" button to switch to them.

- **Add an account**: click "Add an account", on that page or in the [command palette](/guide/palette), and sign in with the other account's token. It joins the accounts already kept, without asking again how to keep it, and becomes the active one. Signing in with a new token of an account already in the list replaces the stored one, which is what to do when a token has expired.
- **Switch**: "Use" on that page, or "Switch to account …" in the palette.
- **Remove**: "Sign out" removes the active account from this browser.

As clever-tools has profiles, the palette names their commands beside these actions: `clever profile list`, `clever profile switch` and `clever logout`. Beside "Add an account", it names `clever tokens create clever-visual-cli`, which creates the token to sign in with: `clever login` signs clever-tools in through the Console, which clever-visual-cli does not accept.

## The account menu {#account-menu}

The button at the top right, with your name and e-mail, opens the account menu:

- **Language**: English or Français.
- **Theme**: System (follows the light or dark setting of your computer), Light, Dark or Modern. The choice is kept in this browser.
- **Accounts in this browser**: the page described above, which also holds the [views sync](/guide/views-sync) card, the language and theme choices, and "Erase everything from this browser".
- **Documentation**: opens this documentation in a new tab.
- **Lock**: with an encrypted vault only. The key leaves the tab and the unlock page shows; your accounts stay, encrypted.
- **Sign out**: removes the active account from this browser. The next account becomes active; after the last one, the sign-in page shows. The token itself stays valid on Clever Cloud: revoke it in the Console or with `clever tokens revoke` if you no longer need it.
- **The clever-tools release line**: "Commands checked with clever‑tools 5.2.0". When npm has a newer release, a dot appears on the account button and the line reads "clever‑tools … is out; the commands are checked with 5.2.0.", with a "Release notes" link. The latest release is read from the npm registry at most once a day.

### Erase everything from this browser {#erase}

This button, on the "Accounts in this browser" page, removes every account and token, encrypted or not, and everything else clever-visual-cli keeps in this browser: preferences, favourite views, caches. It asks first: a red box says what goes, with **Erase everything** to confirm and **Cancel**. Nothing changes on Clever Cloud's side: your tokens stay valid, and so does the views sync add-on if you have one. [Security and privacy](/guide/security#erase) lists what it removes.

## Why not sign in through the Console {#oauth}

Signing in through the Console, or with the token and secret pair `clever login` stores, is not offered. Both are OAuth credentials issued to clever-tools: the calls made with them would borrow the identity of clever-tools. An API token gives clever-visual-cli an identity of its own, which you can revoke on its own.

Accounts stored that way by an earlier version are removed when the vault opens. When no account is left, the sign-in page says how many were removed and why: sign in again with an API token.
