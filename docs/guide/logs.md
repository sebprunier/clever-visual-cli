# Logs of several applications

The live logs of up to twelve applications on one page, side by side or merged into one feed. Each application is one `clever logs` command, and the page copies them together.

![The logs of several applications, merged](/screenshots/logs-several.png)

## Open it {#open}

On the [organisation home](/guide/organisation-home#selection), select applications, then pick **Applications** › **View logs**. Add-ons in the selection are left out.

The page has an address of its own, `#/orga/orga_…/logs?apps=app_…,app_…`: bookmark it, share it, reload it, and it opens the same applications. It follows the first twelve of them; past that, it says so ("Only the first 12 applications are followed, of the 15 asked for.").

The header gives:

- **← List**, back to the home page with the filter and grouping you came from;
- the title, "Logs of 4 applications";
- the commands that follow the same logs, one per application. The first one shows, and the copy button ("Copy the 4 commands") copies them all, one per line:

```sh
clever logs --app app_… --since 15m
```

For the logs of one application, or of one of its deployments, see [Application page](/guide/application#logs).

## Layouts {#layouts}

The **Layout** menu arranges the logs:

- **1 column**, **2 columns** or **3 columns**: one panel per application, side by side. Two columns is the default.
- **Merged**: one feed of every application, interleaved by date.

Your choice is remembered in this browser.

### Panels {#panels}

In columns, each panel has its own controls:

- the state of the application, as an icon with its tooltip;
- its name, which opens the Logs tab of the application;
- the state of the stream: connecting…, live, paused, stopped or error;
- the number of lines shown;
- its own **Filter…** field, for this application only;
- **Pause** and **Resume**;
- **×** ("Remove from the view"), which closes the stream and takes the application out of the address, so a reload agrees.

When a stream fails, the panel shows the error and how many times it reconnected.

### Merged {#merged}

The merged view puts the lines of every application in one feed, in the order of their dates. Each line gives its time, the name of its application in a colour of its own, and the message, on a light tint of that colour. The same set of applications always gets the same colours.

Above the feed, a legend lists the applications. A click on a name hides its lines, and a second click shows them again. The merged view keeps the latest 4,000 lines.

::: info
The merged view has no clever-tools equivalent: each `clever logs` command follows one application.
:::

## Controls for every application {#toolbar}

The toolbar applies to all the applications at once:

- **Since**, the replay window: now, last 15 minutes (the default), last hour, last 6 hours, last 24 hours. Changing it reloads every stream from that point, and the commands follow (`--since 1h`; none for "now").
- **Filter lines…**: keeps the lines whose service or message holds the text, ignoring case. A panel's own filter applies on top of it.
- **Follow**: keeps the panels scrolled to the latest lines.
- **Pause all** and **Resume all**.
- **Reconnect**: reopens every stream with the chosen replay window.
- **Clear all**: empties every panel.

Each application keeps its latest 2,000 lines.

## Following the restarts of a selection {#restarts}

When you restart a selection from the home page (**Applications** › **Restart**), the notification that says how many applications restarted offers **Follow the logs**. It opens this page on the restarted applications, each on the deployment its restart started, from the time of the restart.

- A banner says when: "Restarts sent at 10:42:07 AM", "each application on its new deployment, followed as it goes". **Back to the live logs** turns the page into the live logs of the same applications.
- Each application shows the lines of its new deployment only, from a minute before the restart. The replay window does not apply, so the **Since** menu is hidden.
- A restart still queued says so: its panel reads "queued" and "The deployment is queued: its lines will show as soon as it starts." The page checks every few seconds and opens the stream once the deployment starts. In the merged view, while every restart is queued, the feed says "The restarts are queued: their lines will show as soon as they start."
- The commands follow each deployment, as `clever restart` streams it:

```sh
clever logs --app app_… --deployment-id deployment_… --since 2026-10-21T08:41:07Z
```

The address carries the deployments and the time of the restart (`&deployments=app_…:deployment_…&from=…`), so this view can be reloaded or shared too.

A restart of one application, from its page or from the palette, opens the logs of the deployment it started on the Logs tab of that application: see [Logs of a deployment](/guide/application#deployment-logs).
