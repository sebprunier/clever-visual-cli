# Application page

The page of one application lays out what clever-tools tells you about it, one tab per command, with the commands that act on it. Every tab shows its `clever` commands with the real identifiers; a click on a command copies it.

You open it from the [organisation home](/guide/organisation-home) (a click on a name), from the list beside the page, or from the [command palette](/guide/palette) (`⌘K` / `Ctrl+K`), which lists the applications of every organisation.

| Tab              | clever-tools      |
| ---------------- | ----------------- |
| **Overview**     | `clever status`   |
| **Logs**         | `clever logs`     |
| **Activity**     | `clever activity` |
| **Domains**      | `clever domain`   |
| **Variables**    | `clever env`      |
| **Dependencies** | `clever service`  |

Inside each tab, the command carries `--app <app_id>`. Exposed configuration, TCP redirections, metrics and network groups stay with the Console: the **Open in the Console ↗** link of the overview takes you there.

## Title {#title}

The header gives the runtime logo, the name of the application, its state icon and its two main actions. The pencil right after the name renames the application (see [Actions](#actions)). The small **?** beside it opens the section of this documentation about the tab you are on.

The state icon combines the state of the application with its last deployment:

| Icon                             | Meaning                                                 |
| -------------------------------- | ------------------------------------------------------- |
| Play sign                        | Running                                                 |
| Outlined play sign               | Starting                                                |
| Two play signs                   | Running, a deployment is in progress                    |
| Warning triangle and a play sign | Running, the last deployment failed                     |
| Warning triangle                 | Stopped, the last deployment failed                     |
| Square                           | Stopped                                                 |
| Red square                       | Stopped by Clever Cloud (moderation or payment default) |

Its tooltip spells out the state, the runtime and the zone. When the last deployment failed or is in progress, the icon is a link: it opens [the logs of that deployment](#deployment-logs), so a failure tells you why in one click.

On the right:

- **Restart** opens the restart dialog (`clever restart`). On a stopped application the button reads **Start** and does the same.
- **Stop**, outlined in red, opens the stop dialog (`clever stop`). It is not shown on a stopped application.

Both are described under [Actions](#actions).

### Tags {#tags}

The tags of the application sit under its name ("No tag" when it has none). The pencil after them (**Add tags** or **Edit tags**) opens a dialog, "Tags of &lt;name&gt;":

- the current tags, each with × to remove it (↺ brings it back before you apply);
- **New tag**, with the tags already used in the organisation as suggestions, and **Add**;
- the API calls the change takes. clever-tools has no tag command, so the dialog shows the `clever curl` calls that do the same, ready to copy:

```sh
clever curl -X PUT https://api.clever-cloud.com/v2/organisations/<orga_id>/applications/<app_id>/tags/env%3Aprod
clever curl -X DELETE https://api.clever-cloud.com/v2/organisations/<orga_id>/applications/<app_id>/tags/env%3Adev
```

**Apply** runs them; the notification says how many changes were applied and offers **Undo**. A tag has no space, none of `/`, `?`, `#` or `%`, and 100 characters at most. Clever Cloud imposes no convention; `key:value` tags such as `project:shop` and `env:prod` are what the grouping of the home page reads.

## The list beside the page {#list}

On the left, the list you came from: names only, with the same filter, grouping, order and collapsed groups as the [organisation home](/guide/organisation-home). Each name carries its state icon.

- **← List** goes back to the home page with this filter and grouping; the number beside it counts what the list shows.
- **Filter…** and **Group by…** take the same expressions as the home page ([filters](/reference/filters), [grouping](/reference/grouping)). The filter lives in the URL; the grouping and the collapsed groups are those of the home page, so changing them here changes them there too.
- A click on a group title collapses or expands it.
- Another application opens on the same tab: from the logs of one application to the logs of the next, from its variables to the next one's.
- `Alt+↑` / `Alt+↓` (`⌥↑` / `⌥↓` on a Mac) move to the previous or next application of the list, on the same tab. They do nothing while the cursor is in a text field.
- When the current application is not in the list, the column says "This resource is not in this list." and offers **Clear the filter**.
- **«** folds the column to a thin strip, **»** brings it back. The choice is remembered in this browser.

## Overview {#overview}

![The overview of an application](/screenshots/app-overview.png)

The overview is arranged by use: a band with where the application stands, then what moves or can be changed, and aside the facts you only read or copy.

### The band

- **State**: the state icon and its sentence, as in the title.
- **Instances**: the running instances by size (`2 × XS`), the others by state (starting, deploying, stopping…), "building" while a dedicated build instance works, "none running" otherwise.
- **Last deployment**: when, its state, who or what started it, and **its logs**, a link to [the logs of that deployment](#deployment-logs).
- **Cost (excl. tax)**: **Show the cost** loads the costs of the organisation, as the **Costs** menu of the home page does; then it reads "yesterday: … · 30 d: …", the consumption the Clever Cloud billing computed for this application. It needs billing rights on the organisation. Once loaded, the costs stay in this browser and complete themselves quietly next time.
- **Primary domain**: the primary domain as a link; without one, the first custom domain, or else the default one.

### What moves or can be changed

- **Scaling** (`clever status --app <app_id>`): the instances (minimum → maximum, and the maximum allowed), the size (minimum → maximum, with the CPUs and memory of the smallest), and the **Dedicated build** size, or "no". **Edit** opens the scale dialog.
- **Options** (`clever config --app <app_id>`): sticky sessions, zero-downtime deployment, forced HTTPS, and cancelling the running deployment on push, as greyed checkboxes. **Edit** opens the "Application options" dialog, which shows the `clever config update` command.
- **Domains** (`clever domain --app <app_id>`): the first five domains, the primary one on top, then the default `app-….cleverapps.io` domain apart. Hover a domain for **make primary** and **remove**; **Add** opens the dialog to add one; **See all** opens the [Domains](#domains) tab when there are more.
- **Recent activity** (`clever activity --app <app_id>`): the last five deployments with their state, action, author or cause, and commit. A deployment in progress is highlighted, with a **Logs** link and **Cancel**. **See all →** opens the [Activity](#activity) tab.

### Facts

- **Runtime**: type and version, zone, lifecycle, creation date.
- **Deployment**: where the code comes from, then the commit and the number of deployments.
  - A **GitHub**-linked application shows its repository (a link), the **GitHub branch** it deploys and "Deploys on every push to this branch on GitHub."; the commit links to GitHub. **Edit** opens "GitHub branch", a choice among the branches of the repository (see [Actions](#actions)). The change deploys nothing by itself: the next deployment takes the new branch, on a push to it or a restart, which the notification offers.
  - An application deployed to **Clever Cloud's git** shows "git (Clever Cloud)", the branch it deploys (usually `master`) and the commands that deploy it: `git remote add clever <url>`, then `git push clever HEAD:<branch>`.
  - An FTP or SFTP application shows its method only.
- **Identifiers**: the application id and its owner id, each copied in one click, and **Open in the Console ↗**.

## Logs {#logs}

![The live logs of an application](/screenshots/app-logs.png)

The Logs tab streams the logs of the application live. The switch at the top picks what you read; the choice is remembered in this browser.

| Kind            | What it shows                                                                    | clever-tools                                   |
| --------------- | -------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Application** | what the application writes, coloured by severity                                | `clever logs --app <app_id> --since 15m`       |
| **Access**      | the HTTP requests it answered: status, method, path, duration, size, client      | `clever accesslogs --app <app_id> --since 15m` |
| **Both**        | both kinds interleaved by date, each line labelled, the requests on a light tint | no single command: the two above together      |

The toolbar:

- the command for what is shown, copied in one click;
- the state of the stream: connecting…, live, paused, stopped or error (with the reconnections the client made);
- the number of lines, and how many the filter keeps;
- the replay window: **now**, **last 15 minutes** (the default), **last hour**, **last 6 hours**, **last 24 hours**. Changing it reopens the stream, and the `--since` of the command follows;
- **Filter lines…**, which keeps the lines that contain your text, as you type;
- **Follow**, ticked by default, which keeps the view at the newest line;
- pause and resume; stop, then **Restart** to reopen the stream with the chosen window; clear.

The view keeps the newest 2,000 application lines and 5,000 access lines.

### Logs of one deployment {#deployment-logs}

![The logs of one deployment, with its banner](/screenshots/app-deployment-logs.png)

The Logs tab can also show one deployment only: why it failed, or a restart as it happens. The URL then carries `?deployment=<deployment_id>`, so the page can be bookmarked or shared. You get there from:

- the **Logs** button of every deployment in the [Activity](#activity) tab;
- the state icon of the [title](#title), when the last deployment failed or is in progress;
- **its logs**, after the last deployment in the band of the [overview](#overview);
- on the [organisation home](/guide/organisation-home), the state and activity cells of a failed deployment or of one in progress, and **its logs** in the "To watch" card;
- a restart from this page or from the palette, which opens the logs of the deployment it started, as `clever restart` streams them.

A banner sits above the lines:

- "Logs of deployment #&lt;number&gt;" (until the number is known, "Logs of the deployment of &lt;date&gt;");
- its state: queued, in progress, task in progress, succeeded, failed or cancelled;
- its action, date, cause and author;
- "followed until it ends" while it is queued or running: the state is read again every few seconds, and when the deployment ends, the state icons of the title and of the list follow;
- **Back to the live logs**, which leaves the deployment for the live logs of the application.

The lines are the application logs of that deployment only (access logs have no deployment filter), from one minute before it started. A queued deployment has no lines yet: the view says "The deployment is queued: its lines will show as soon as it starts.", and they come in on their own once it leaves the queue. A deployment that ended without ever starting says "This deployment never left the queue: it has no lines."

The command is the clever-tools one for the same lines:

```sh
clever logs --app <app_id> --deployment-id <deployment_id> --since 2026-10-17T15:29:35Z
```

`--since` is needed: without it, clever-tools streams from now on. The kind switch and the replay window are not offered here; the filter, **Follow**, pause and clear work as for the live logs.

## Activity {#activity}

![The Activity tab with its Logs buttons](/screenshots/app-activity.png)

The Activity tab lists the 30 most recent deployments (`clever activity --app <app_id>`), newest first: date and number, state, action (deployment, stop, scale up, scale down, replacement, cancellation), commit, author, cause and number of instances. **Refresh** reads them again.

- **Logs**, on every deployment, opens [the logs of that deployment](#deployment-logs), from its start.
- **Cancel**, on a deployment in progress, opens the "Cancel the running deployment" dialog, with `clever cancel-deploy --app <app_id>`. Once it is cancelled, you are back on this tab.

## Domains {#domains}

The Domains tab lists every domain of the application (`clever domain --app <app_id>`), for the applications that have more than the overview shows: the primary one first with its **primary** badge, the others in alphabetical order, the default `app-….cleverapps.io` domain apart under "Default domain".

- From six domains on, **Filter the domains…** narrows the list as you type.
- **Add a domain** opens the dialog (`clever domain add <domain> --app <app_id>`); a domain can carry a path, as `app.example.com/path`.
- Hover a domain for **make primary** (`clever domain favourite set`) and **remove** (`clever domain rm`).

## Variables {#variables}

![The environment variables of an application, values hidden](/screenshots/app-variables.png)

The Variables tab shows the environment variables of the application (`clever env --app <app_id>`). Values stay hidden behind bullets until you ask for them.

- **Show values** / **Hide values** reveals or hides them all.
- **Copy**, on each variable, copies its value, hidden or not.
- **Copy as .env** copies the whole list to the clipboard as a `.env` file, one `NAME=value` per line, quoted where a `.env` reader needs it.
- **Add a variable** and **Edit**, on each variable, open "Set a variable" (`clever env set <NAME> <value> --app <app_id>`). A name has letters, digits and `_` only, and does not start with a digit.
- **Delete** opens "Delete a variable" (`clever env rm <NAME> --app <app_id>`).
- **Import** opens "Import variables": paste a `.env` content; existing variables are kept unless you tick "Replace every existing variable" (`clever env import --app <app_id> < .env`).
- **Refresh** reads them again.

Below, each linked add-on and linked application has its own folded section ("Linked add-on: …", "Linked application: …") with the variables it exposes to this one, to read and copy. They change on the add-on or the other application, not here.

::: info Variables apply at the next deployment
Clever Cloud does not redeploy an application when its own variables change: they apply at its next deployment. After a change made here, the tab says "These variables changed since the last deployment: they apply at the next one." with a **Restart…** button, until a deployment newer than the change shows up. The reminder is kept for this browser tab, a reload included.
:::

## Dependencies {#dependencies}

The Dependencies tab shows what the application is linked to (`clever service --app <app_id>`). An application linked to an add-on or to another application gets their exposed variables; linking or unlinking applies at the next restart only.

- **Linked add-ons**: each with its provider and plan, its name opening the [add-on page](/guide/addons#page), and **unlink** (`clever service unlink-addon`). **Link…** opens "Link an add-on", listing the add-ons of the organisation not linked yet (`clever service link-addon <addon_id> --app <app_id>`).
- **Linked applications**: each with its state icon, its name opening its page, and **unlink** (`clever service unlink-app`). **Link…** opens "Link an application" (`clever service link-app <app_id> --app <app_id>`).
- **Applications depending on it**: the applications linked to this one, from the links the home page knows for this organisation.

After a link or an unlink, the notification reminds you to restart the application for its variables to change.

## Actions {#actions}

Every action opens a dialog with its fields and, under them, the "clever-tools equivalent": the `clever` command, updated live as you fill the form, ready to copy. **Cancel** or `Escape` closes the dialog; the actions that stop or remove something have a red button. On an application page, the palette lists them all under "Actions", each with its bare command.

| Dialog                                      | Opened from                                                                  | clever-tools                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Restart                                     | **Restart** / **Start** in the title, **Restart…** of the Variables reminder | `clever restart --app <app_id>`, with `--commit <commit>` and `--without-cache` when chosen                                                 |
| Stop                                        | **Stop** in the title                                                        | `clever stop --app <app_id>`                                                                                                                |
| Rename the application                      | the pencil after the name                                                    | `clever config set name <new name> --app <app_id>`                                                                                          |
| Cancel the running deployment               | **Cancel** in Activity and Recent activity                                   | `clever cancel-deploy --app <app_id>`                                                                                                       |
| Scale                                       | **Edit** on Scaling                                                          | `clever scale --app <app_id> --min-instances … --max-instances … --min-flavor … --max-flavor …`, with `--build-flavor …` when it changes    |
| Application options                         | **Edit** on Options                                                          | `clever config update --app <app_id>`, with `--enable-…` / `--disable-…` for each option changed                                            |
| GitHub branch                               | **Edit** on Deployment (GitHub-linked applications)                          | no clever-tools command: `clever curl -X PUT -H 'Content-Type: application/json' -d '{"branch":"<branch>"}' …/applications/<app_id>/branch` |
| Set a variable                              | **Add a variable**, **Edit** in Variables                                    | `clever env set <NAME> <value> --app <app_id>`                                                                                              |
| Delete a variable                           | **Delete** in Variables                                                      | `clever env rm <NAME> --app <app_id>`                                                                                                       |
| Import variables                            | **Import** in Variables                                                      | `clever env import --app <app_id> < .env`                                                                                                   |
| Add a domain                                | **Add** on Domains, **Add a domain**                                         | `clever domain add <domain> --app <app_id>`                                                                                                 |
| Remove a domain                             | **remove** on a domain                                                       | `clever domain rm <domain> --app <app_id>`                                                                                                  |
| Set the primary domain                      | **make primary** on a domain                                                 | `clever domain favourite set <domain> --app <app_id>`                                                                                       |
| Link an add-on / Unlink an add-on           | **Link…** / **unlink** in Dependencies                                       | `clever service link-addon <addon_id> --app <app_id>` / `clever service unlink-addon …`                                                     |
| Link an application / Unlink an application | **Link…** / **unlink** in Dependencies                                       | `clever service link-app <app_id> --app <app_id>` / `clever service unlink-app …`                                                           |

### Restart

"Starts a deployment with the latest commit, or a given one." The **Commit** field is optional (its placeholder names the commit last deployed; a commit id is 7 to 40 hexadecimal characters), and **Without build cache** builds without the build cache. Once the restart is sent, the notification says "Restart started (deployment_…)." and the Logs tab opens on [the deployment it started](#deployment-logs), followed until it ends, as `clever restart` streams its logs.

To restart several applications at once, select them on the [organisation home](/guide/organisation-home); the notification then offers **Follow the logs**, the [logs of several applications](/guide/logs), each on its new deployment.

### Stop

"Stops every instance of the application." The dialog asks you to confirm the action on the application by name, with **Stop the application**. You then land on the Activity tab, where the stop shows as a deployment.

### Scale

"Horizontal (instances) and vertical (size) bounds of the application": **Minimum instances**, **Maximum instances**, **Minimum size**, **Maximum size**, and **Dedicated build**, either "Disabled (build on the instance)" or the size of a separate instance that compiles the application, then stops. The minimum cannot exceed the maximum, for the instances as for the size.

### Application options

The four switches of `clever config update`: **Sticky sessions**, **Zero-downtime deployment**, **Forced HTTPS**, **Cancel the running deployment on push**. Only what you change goes into the command. Some apply from the next deployment only.

### Variables, domains and links

Setting, deleting or importing variables takes you to the [Variables](#variables) tab, with the reminder that they apply at the next deployment. Adding or removing a domain, or choosing the primary one, reloads the page where you are. Linking or unlinking takes you to [Dependencies](#dependencies); restart the application for its variables to change.
