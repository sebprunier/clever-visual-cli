# Command palette and shortcuts

The command palette finds an application of any of your organisations, an organisation, a tab or an action, from the keyboard. Next to a result, it shows the clever-tools command that does the same, when there is one.

![The command palette](/screenshots/palette.png)

## Open the palette {#open}

Press `⌘K` on a Mac, `Ctrl+K` elsewhere, or click **Search or run a command…** in the top bar. The same keys close it, and so does Escape or a click outside. The palette is there once you are signed in, except while an action dialog is open.

Type a few letters, move with `↑` and `↓`, and press `Enter` to run the highlighted result, or click it.

## What it finds {#what-it-finds}

Results come in groups:

| Group             | What it holds                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Page**          | On an application page, its tabs: Overview, Logs, Activity, Domains, Variables, Dependencies.                                            |
| **Actions**       | On an application page, its actions: restart, stop, cancel the running deployment, scale, options, variables, domains, links.            |
| **Applications**  | Every application of every organisation you belong to, archived ones left out, with its organisation and runtime. It opens its overview. |
| **Organisations** | Every organisation, with its counts. It opens its home.                                                                                  |
| **Session**       | Refresh data, Accounts in this browser, Switch to account …, Documentation, Add an account, Language, Theme, Lock the vault, Sign out.   |

The Session group offers what applies: "Switch to account …" for each other account of this browser, "Language: Français" or "Language: English" for the language you are not using, "Theme: …" for the other themes, and "Lock the vault" when your accounts are kept encrypted. "Documentation" opens this documentation in a new tab.

An action opens its dialog, which shows the equivalent `clever` command as you fill it in, ready to copy. A restart opens the logs of the deployment it started, as `clever restart` streams them: see [Logs of a deployment](/guide/application#deployment-logs).

### The commands beside the results {#commands}

| Result                                                     | Command shown                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Overview, Logs, Activity, Domains, Variables, Dependencies | `clever status`, `clever logs`, `clever activity`, `clever domain`, `clever env`, `clever service` |
| Restart, Stop, Cancel the running deployment, Scale        | `clever restart`, `clever stop`, `clever cancel-deploy`, `clever scale`                            |
| Application options                                        | `clever config update`                                                                             |
| Link or unlink an add-on, an application                   | `clever service link-addon`, `unlink-addon`, `link-app`, `unlink-app`                              |
| Set, delete or import variables                            | `clever env set`, `clever env rm`, `clever env import`                                             |
| Add or remove a domain, set the primary domain             | `clever domain add`, `clever domain rm`, `clever domain favourite set`                             |
| Accounts in this browser, Switch to account …              | `clever profile list`, `clever profile switch`                                                     |
| Add an account, Sign out                                   | `clever login --alias`, `clever logout`                                                            |

## How the search works {#search}

- Every word you type must match. Case and accents do not matter.
- A word matches the title of a result, its subtitle (the organisation and runtime of an application, the name of the application for a tab or an action) or its keywords: the id of an application or an organisation, words such as `redeploy` for a restart or `dotenv` for an import.
- A word can also match letters of the title in order: `shpi` finds `shop-api`.
- Titles that start with your words come first, then titles that hold them, then the other matches. Up to 50 results show.
- Each group shows once: the group of the best result comes first, and so on.

So `shop` finds the applications named after the shop, pasting the id of an application or an organisation finds it, and `restart` on an application page finds its action.

## Keyboard shortcuts {#shortcuts}

| Keys                                     | Where                                            | What it does                                                                                          |
| ---------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `⌘K` / `Ctrl+K`                          | anywhere, once signed in                         | Opens or closes the command palette.                                                                  |
| `↑` `↓`, `Enter`, Escape                 | the palette                                      | Moves through the results, runs one, closes the palette.                                              |
| `/`                                      | organisation home                                | Puts the cursor in the Filter field, its text selected.                                               |
| Escape                                   | organisation home                                | Clears the selection.                                                                                 |
| Shift+click on a checkbox                | organisation home                                | Selects or clears the range from the last row you clicked.                                            |
| `Alt+↑` / `Alt+↓` (`⌥↑` / `⌥↓` on a Mac) | application and add-on pages                     | Opens the previous or next application of the list column; from an application page, on the same tab. |
| `↓` on a menu button                     | the Tags and Applications menus of the home page | Opens the menu; `↑` `↓`, `Home` and `End` move through it, Escape or `Tab` closes it.                 |
| `Enter`                                  | the tag editor of an application or add-on       | Adds the tag typed in the field.                                                                      |
| Escape                                   | dialogs and menus                                | Closes them. A dialog or menu closed this way leaves the selection of the home page as it was.        |

The shortcuts of the pages (`/` and Escape on the home page, `Alt+↑` and `Alt+↓`) do nothing while you type in a text field.

`Alt+↑` and `Alt+↓` follow the list column as it shows: its filter, grouping and order, without the applications of folded groups. From the logs of one application, `Alt+↓` opens the logs of the next one. See [The list beside a page](/guide/organisation-home#list-column).
