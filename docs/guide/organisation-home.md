# Organisation home

The home of an organisation lists every application and add-on it holds in one dense table. You filter it, group it, sort it, select rows to act on them, and show what each resource costs. The page stands for `clever applications list`, with a few extras on top: filter and grouping expressions, actions on a selection, costs, and a "To watch" card.

![The organisation home, grouped by project > env, with the costs shown](/screenshots/home.png)

## Header {#header}

The first line holds the name of the organisation and, on the right, three buttons:

- **Views**: your favourite views of the list. See [Favourite views](#views).
- **Costs**: what the list costs. See [Costs](#costs).
- **Refresh**: reloads the applications and add-ons, their state, the activity and the links. It stays disabled while they load.

The small **?** beside the name opens this page of the documentation in a new tab.

The second line gives the counts ("12 applications · 9 add-ons", archived applications left out) and the command the page stands for, with the real organisation id. A click on it copies it:

```sh
clever applications list --org orga_…
```

On the right of that line, while the page loads, a counter follows the links between applications and add-ons ("links 8/12"), then "activity…" while the deployments load. If one of them fails, a line under the fields says so ("activity unavailable: …", "links incomplete: …").

Under the header sit the **Filter** and **Group by** fields: see [Filtering](#filter) and [Grouping](#grouping).

## The list {#list}

Each row is an application or an add-on. In every group, the applications come first, then the add-ons.

| Column   | For an application                                 | For an add-on                            |
| -------- | -------------------------------------------------- | ---------------------------------------- |
| Name     | logo, name (a link to its page) and tags           | logo, name (a link to its page) and tags |
| Kind     | "Application"                                      | "Add-on"                                 |
| Type     | the runtime, such as `Node.js`                     | the provider, such as `postgresql-addon` |
| State    | its state, with an icon                            | its state, read from its instances       |
| Activity | when it was last deployed                          | "—"                                      |
| Links    | the add-ons linked to it                           | the applications linked to it            |
| Cost     | only when the costs are shown, see [Costs](#costs) | the same                                 |

### Name and tags {#name}

The tags of a resource show beside its name, and a click on one filters the list on it (see [Tags](#tags)). When the cell is too narrow for all of them, the tooltip of the name lists them all ("Tags: project:shop, env:prod, …").

### State {#state}

For an application, an icon and a word: running, starting, stopped, moderated, payment default. The icon also tells how the last deployment went, and its tooltip says it in a sentence: "Running, the last deployment failed", "Running, a deployment is in progress", "Stopped by Clever Cloud (moderation or payment default)"… When the last deployment failed or is still in progress, the state is a link to the logs of that deployment (see [Logs of a deployment](/guide/application#deployment-logs)).

For an add-on, the state is read from its instances: running, starting, migrating (during a change of plan) or stopped. A spinner shows while the states load.

- An add-on on a **shared plan** has no instance of its own, so no state to follow: it reads "shared", muted, and its tooltip says "Shared plan: no dedicated instance, so no state to follow." The filter finds these add-ons with `is:shared`.
- A Keycloak or Otoroshi **operator** has the state of the application it runs as. See [Operators](/guide/addons#operators).

### Activity {#activity}

For an application, when its last deployment happened, as a relative date such as "3 days ago": the date only, which leaves room for the tags. The tooltip gives the rest: the action and its state, the full date and time, who deployed ("you", a member of the organisation, or the platform: "maintenance", "monitoring"), the cause when there is one, and the last deployment made by a person when the platform deployed since.

- The platform's own deployments are muted.
- A failed deployment shows in red with ✕, one in progress with ●. Both are links to the logs of that deployment.

An add-on has no activity: the cell shows "—".

### Links {#links}

The Links column means the same on every row: what the resource is linked to. For an application, the logos of the add-ons linked to it; for an add-on, the logos of the applications linked to it. Each logo opens that page, and its tooltip names it.

- Add-ons that unrelated applications often share (configuration providers, Keycloak, Otoroshi, Jenkins, Matomo, Metabase, Grafana) come last, dimmed.
- Past six logos, the cell shows "+N".
- An add-on linked to nothing says "not linked".
- "…" shows while the links load.

### Add-ons placed by their applications {#inferred}

When you group by a tag key, an add-on without that tag goes with the applications it is linked to. In that group, a dashed "inferred" chip sits beside its name; its tooltip says "Placed after its linked applications". See [Add-ons inherit from their applications](/reference/grouping#inferred).

## Filtering {#filter}

Type an expression in the **Filter** field. Press `/` anywhere on the page, outside a text field, to jump to it. The list follows as you type.

| You type         | The list keeps                                              |
| ---------------- | ----------------------------------------------------------- |
| `shop api`       | resources whose name, runtime, tags or ids hold both words  |
| `is:app`         | the applications                                            |
| `-is:addon`      | everything but the add-ons: the applications alone          |
| `is:node`        | the applications of a runtime, or the add-ons of a provider |
| `is:watch`       | what the "To watch" card lists                              |
| `is:shared`      | the add-ons on a shared plan                                |
| `env:prod`       | what carries the tag `env:prod`; any `key:value` tag works  |
| `has:project`    | what carries a `project:…` tag, whatever its value          |
| `a b`, `a AND b` | both conditions                                             |
| `a OR b`         | either condition                                            |
| `NOT a`, `-a`    | everything but `a`                                          |

Parentheses group conditions, and quotes keep words together (`"two words"`, `project:"my project"`). Case and accents do not matter.

Under the field, clickable examples (`is:app`, `is:addon`, `is:watch`, `env:prod`, `-env:prod`, `has:project`) add their term to the expression, or remove it when it is already there; `AND`, `OR` and `( )` are added at the end. Hover over one to see what it does.

An expression that does not hold together, such as an unclosed parenthesis, is still applied, word by word, and a line under the field says so: "Incomplete filter (unclosed parenthesis), applied word by word."

The filter lives in the URL (`?q=`), so a bookmark or a shared link opens the same list. Filtering is an extra of the interface, computed in your browser.

The whole language, `tag:`, `runtime:`, `state:` and `name:` included, is in [Filter expressions](/reference/filters).

## Grouping {#grouping}

Type an expression in the **Group by** field:

- a tag key, such as `project` or `env`, reads the `key:value` tags;
- `type`, `runtime`, `provider` and `state` are built in;
- `>` nests up to three levels: `project > env`;
- values in parentheses come first, in that order: `project > env(prod,dev)`.

The field suggests the tag keys of the organisation, most used first, some pairs of them, and the built-in keys. Under it, clickable examples (`project > env`, `project > env(prod,dev)`, `type`, `runtime`, `state`) replace the expression; a click on the one in use clears it.

Each group has a header with its name, its counts ("3 apps · 2 add-ons"), a checkbox to select it, and its total when the costs are shown. The resources without a value for a key gather in a last group, "no project" for `project`. A resource with two values for a key shows in both groups.

The grouping lives in the URL (`?g=`), and the organisation remembers the last one in this browser, for the times you come back without one in the URL.

The whole language is in [Grouping expressions](/reference/grouping).

### Collapsing groups {#collapse}

A click on the header of a group or sub-group folds it to that header, and a second click unfolds it. The folded groups are remembered per organisation in this browser, and the list beside an application page folds the same ones.

## Sorting {#sorting}

A click on a column header sorts the list by that column: **Name**, **Type**, **State**, **Activity**, **Links** or **Cost**. The Kind column does not sort.

- The first click sorts in the natural direction of the column: the latest activity and the biggest cost first, the other columns in ascending order (names and types from A to Z). A second click on the same header reverses it. An arrow, ▲ or ▼, marks the column in use.
- The order applies inside each group. Applications come first, then add-ons, each sorted on their own.
- A missing value (no deployment yet, no known price) goes last, whatever the direction. The add-ons, which have no activity, keep their name order under Activity.
- State sorts running first, then starting, then stopped; Links sorts by the number of links.
- Sorting by cost also orders the groups by their total, the "no …" group last. The other columns leave the groups in the order of the grouping.

The sort is remembered per organisation in this browser. A [favourite view](#views) and its link carry it too.

## Tags {#tags}

A click on a tag in the list adds it to the filter, and a second click takes it out. A `key:value` tag goes in as it is (`env:prod`); a tag without a colon goes through `tag:` (`tag:legacy`).

Clever Cloud imposes no tag convention: tags are free-form. The `key:value` form, as in `project:shop` and `env:prod`, is the one grouping reads.

You change the tags of a selection from the "Tags" menu, below, and the tags of one resource from its page (see [Application page](/guide/application) and [Add-ons](/guide/addons)).

## Selection and actions {#selection}

Tick rows to act on them:

- a checkbox on each row;
- a checkbox on each group and sub-group, which selects everything under it, folded sub-groups included;
- "Select all" in the column headers, which selects the rows on screen (the content of folded groups is left out);
- shift+click on a row's checkbox selects the range from the last one you clicked;
- Escape, outside a text field, clears the selection, and so does the "none" link of the selection bar.

The selection bar says what you picked ("5 selected out of 21") and holds two menus, **Tags** and **Applications**. It stays at the top of the page with the column headers while you scroll, so the actions are one click away from a group at the bottom. Changing the filter or the grouping clears the selection.

![Rows selected, with the Tags and Applications menus](/screenshots/home-selection.png)

A tag change, a restart or a stop opens a dialog that shows the exact list it applies to and the `clever` commands that do the same, ready to copy as a script ("Copy the 5 commands"), before you confirm. While it runs, a counter shows the progress; a failure on one resource does not stop the others, and the notification says how many failed and why.

### Tags {#bulk-tags}

The **Tags** menu offers "Add a tag", "Remove a tag" and "Rename a tag", for the applications and add-ons of the selection. The dialog lets you switch between the three, and says what you selected ("5 resources selected (3 apps, 2 add-ons)").

- **Add a tag**: type it; the tags of the organisation are suggested.
- **Remove a tag**: pick it among the tags of the selection.
- **Rename a tag**: pick the current tag among the tags of the selection and type the new one. Each resource that carries the current tag loses it and gets the new one.

A tag holds no space and none of `/`, `?`, `#` or `%`, and is 100 characters at most.

The dialog lists the changes ("+env:prod app shop-api", "−env:qa add-on shop-db") and counts the API calls. Nothing is sent for a resource already in the wanted state ("· 2 resources already up to date"). clever-tools has no tag command, so the dialog shows the `clever curl` call that does the same, one per change:

```sh
clever curl -X PUT https://api.clever-cloud.com/v2/organisations/orga_…/applications/app_…/tags/env%3Aprod
clever curl -X DELETE https://api.clever-cloud.com/v2/organisations/orga_…/addons/addon_…/tags/env%3Aqa
```

**Apply** sends the changes. The notification ("5 tag changes applied.") offers **Undo**, which reverts exactly what was applied.

### Applications {#bulk-applications}

The **Applications** menu counts the applications of the selection ("Applications (3)"); add-ons are left out of it, and it is disabled when the selection holds none.

- **View logs** opens the live logs of the selected applications on one page. See [Logs of several applications](/guide/logs).
- **Restart** redeploys each application from its last commit, with the build cache; a stopped one starts again. The dialog lists the applications with their state, and the commands:

  ```sh
  clever restart --app app_…
  ```

- **Stop** stops the applications at once; they stay stopped until restarted, and there is no undo. Applications already stopped are left out ("1 already stopped, left out"). The commands:

  ```sh
  clever stop --app app_…
  ```

Once done, the notification says how many applications were restarted or stopped, the selection is cleared and the list reloads.

### Follow the logs of a restart {#follow-restarts}

After a restart of a selection, the notification offers **Follow the logs**: the logs of the restarted applications on one page, each on the deployment its restart started, from the time of the restart. See [Following the restarts of a selection](/guide/logs#restarts).

## Favourite views {#views}

A view is a filter, a grouping and a sort. The **Views** menu, beside "Costs", saves the current one under a name and lists the others.

![The Views menu with a few favourites](/screenshots/views-menu.png)

- **Save**: type a name under "Save the current view (filter, grouping, sort) as" (it starts filled with the filter, or with the grouping) and press **Save**.
- **Apply**: a click on a view applies its filter, grouping and sort. Each line shows the name of the view and what it holds, its filter and grouping, or "everything".
- **Copy the link**: the link icon copies the address of the view, which carries its filter, grouping and sort (`?q=…&g=…&s=cost.desc`). Opening it applies the view; its sort becomes the sort of that browser, and leaves the address.
- **Rename**: the pencil turns the name into a field; **Save** keeps the new name, Escape gives up.
- **Remove**: the × removes the view. The notification ("Favourite “prod of the shop” removed.") offers **Undo**, which puts it back where it was.

When the current view is a favourite, the menu button names it ("★ prod of the shop") and the menu says "Current view: prod of the shop" with **Leave this view**, which goes back to the whole list: no filter, no grouping, sorted by name. The favourite stays.

Favourite views are kept per organisation in this browser. They can follow you to your other browsers: right after your first favourite, the menu offers to sync them ("Enable" or "Not now") through a configuration provider of your personal space, and shows the command that creates it:

```sh
clever addon create config-provider clever-visual-cli
```

See [Views sync](/guide/views-sync).

## Costs {#costs}

The **Costs** menu, beside "Views", shows what the list costs, on demand: nothing is loaded until you press **Show costs**. Amounts are tax excluded, in the organisation's currency, as the Clever Cloud billing computes them, and they need billing rights on the organisation.

clever-tools has no command for costs. The figures come from the Clever Cloud billing API: the daily consumptions (the call behind the Console's consumption page), the invoices, and the organisation's prices for the estimate. The interface shows no command for them.

![The Costs menu open, with the export line](/screenshots/costs-menu.png)

Once the costs show, the menu holds:

- "Costs tax excluded" and **Hide costs**;
- the four sources, each with its period and the organisation's total for it; the one you pick feeds the cost column and the totals of the list;
- what lies outside the list, when something does;
- the **Export** line;
- "Where do these figures come from?", which unfolds the explanations below.

The menu button then reads the amount of the selected source, such as "€1,234 · 30 days". Whether the costs show, and which source, is remembered per organisation in this browser; the default source is the last 30 days.

### The four sources {#cost-sources}

| Source                    | What it is                                                                      |
| ------------------------- | ------------------------------------------------------------------------------- |
| **Yesterday**             | The last day computed by the billing system, with its date.                     |
| **Last 30 days**          | The rolling sum of the last 30 daily consumptions, with its first and last day. |
| **Invoice**               | The lines of the latest invoice issued, resource by resource, with its month.   |
| **Current configuration** | What a month costs if nothing changes.                                          |

- **Yesterday** and **Last 30 days** come from the daily consumptions, which the billing system computes each night for the day before: a resource at zero cost nothing over the period. The 30 days load day by day ("12 / 30 days"); until all are there, the source reads "Last 12 days". Days and invoices never change once computed, so this browser keeps them, and showing the costs again is quick.
- **Invoice** reads "No invoice yet" for an organisation never billed.
- **Current configuration** prices the setup of today for 720 hours, the 30-day month of Clever Cloud's pricing: each started application at its minimum number of instances, at the hourly price of its minimum size; a stopped application at zero; each add-on at the price of its plan. The organisation's own prices apply. Storage, traffic and add-ons without a known price are not counted, hence a "—" in their cell.

### Costs in the list {#cost-in-list}

- A **Cost** column joins the list, sortable like the others. The tooltip of a cell says what it holds: "Consumption of Oct 20", "Sum of the last 30 days of consumption", "Invoice" with its number and month, or the rule of the current configuration. Under the current configuration, a stopped application costs zero and its tooltip says what it would cost started ("Stopped: €42.18 per month if started").
- Each group and sub-group shows its total on its header, so `project > env` answers "what does the production of this project cost". A resource that shows in two groups counts in each, and once in the totals above them (see [Several values](/reference/grouping#several-values)).
- Under the list, a line gives the total of the list and its source: "21 resources · Last 30 days, Sep 21 – Oct 20".

Amounts of 10 and more show without cents, smaller ones with their cents. A spinner shows while the source loads.

### Outside the list {#outside-the-list}

The billing may hold lines that match no row of the list: resources deleted since, or hidden by the filter. The menu says so: "including €12 for 3 resources not in the list, deleted since or hidden by the filter". The amount of a source in the menu, and on its button, covers the whole organisation, those lines included; the total under the list covers the list only.

### Billing rights {#billing-rights}

The figures are the ones of the Console's consumption page, and need billing rights on the organisation. Without them, the menu says the source is "unavailable", with the error the API gave.

## Export the costs {#export}

The **Export** line of the Costs menu exports the current list, as filtered, grouped and sorted, with the selected source:

- **CSV**, for a spreadsheet;
- **JSON**, for a script;
- **Copy as Markdown**, to paste the totals in an issue or a document.

Everything is built in your browser from what the page already loaded: no API call, nothing sent anywhere. The buttons wait until the selected source has loaded.

Files are named `costs-<organisation>-<source>-<period>`, the organisation in lower case with dashes, the source one of `yesterday`, `days30`, `invoice` or `estimate`, and the period its day, its first and last days, the month of the invoice, or for the current configuration the day of the export. For instance `costs-my-organisation-days30-2026-09-21_2026-10-20.csv`.

### CSV {#export-csv}

One row per resource, in the order of the list, with these columns: organisation, name, kind, type, id, tags (separated by spaces), group (the path of its groups, as in `shop > prod`), source, from, to, amount (two decimals), and currency. With the current configuration, an "if started" column follows the amount. When something lies [outside the list](#outside-the-list), a last row sums it, with "outside the list" as its kind.

The format follows the language of the interface: in English, a `,` between fields and a dot in amounts; in French, a `;` and a decimal comma, as Excel expects in France, with the column names in French. The file is UTF-8 with a byte order mark, so spreadsheets read the accents.

```csv
organisation,name,kind,type,id,tags,group,source,from,to,amount,currency
My organisation,shop-api,Application,Node.js,app_…,project:shop env:prod,shop > prod,Last 30 days,2026-09-21,2026-10-20,42.18,EUR
My organisation,shop-db,Add-on,postgresql-addon,addon_…,project:shop,shop > prod,Last 30 days,2026-09-21,2026-10-20,19.22,EUR
My organisation,3 resources,outside the list,,,,,Last 30 days,2026-09-21,2026-10-20,12.40,EUR
```

### JSON {#export-json}

The rows, the view they come from, the totals per group and of the list, and what lies outside it, amounts rounded to the cent:

```json
{
  "organisation": { "id": "orga_…", "name": "My organisation" },
  "source": "days30",
  "period": { "from": "2026-09-21", "to": "2026-10-20" },
  "invoice": null,
  "currency": "EUR",
  "taxExcluded": true,
  "view": { "filter": "", "grouping": "project > env", "sort": { "column": "cost", "direction": "desc" } },
  "generatedAt": "2026-10-21T09:30:00.000Z",
  "resources": [
    {
      "id": "app_…",
      "realId": null,
      "name": "shop-api",
      "kind": "application",
      "type": "Node.js",
      "tags": ["project:shop", "env:prod"],
      "group": ["shop", "prod"],
      "amount": 42.18,
      "ifStarted": null
    },
    {
      "id": "addon_…",
      "realId": "postgresql_…",
      "name": "shop-db",
      "kind": "add-on",
      "type": "postgresql-addon",
      "tags": ["project:shop"],
      "group": ["shop", "prod"],
      "amount": 19.22,
      "ifStarted": null
    }
  ],
  "groups": [
    { "path": ["shop"], "total": 61.4 },
    { "path": ["shop", "prod"], "total": 61.4 }
  ],
  "total": 61.4,
  "outsideList": { "count": 3, "amount": 12.4 }
}
```

### Markdown {#export-markdown}

**Copy as Markdown** puts the totals in the clipboard ("The totals are copied as Markdown."): a title, a line with the source, its period, the currency, the total of the list and what lies outside it, then a heading per group and sub-group with its total, sub-groups named by their path, and under each last-level group a table of its resources.

```text
## Costs of My organisation

Last 30 days 2026-09-21 → 2026-10-20 · EUR, tax excluded · total of the list €61.40 · outside the list €12.40 (3 resources)

### shop — €61.40

#### shop › prod — €61.40

| resource | type | amount |
| --- | --- | ---: |
| shop-api | Node.js | €42.18 |
| shop-db | postgresql-addon | €19.22 |
```

Without grouping, a single table lists the most expensive resources first, 50 at most, and a last line sums the others ("12 other resources").

## Side column {#side-column}

Beside the list, a column holds three cards. It stays in view while you scroll, unless it is taller than the window.

### Clever Cloud status {#status}

The state of the platform, read from the public status page, [clevercloudstatus.com](https://www.clevercloudstatus.com/), and read again every five minutes and on **Refresh**. While all is well, it is one line, "Clever Cloud operational", with a link to the status page whose tooltip gives the last incident resolved. During an incident, the card says how many are in progress, names each one with when it started and the components it affects, and links to it.

### To watch {#to-watch}

The applications and add-ons that deserve a look, whatever the filter, with their count:

| Badge       | What it means                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| failure     | The last deployment failed, on an application meant to run, or less than a week ago: "deployment failed 2 hours ago (you)".                            |
| in progress | A deployment is in progress ("deployment in progress, started 3 minutes ago (you)"), or the application was asked to start less than an hour ago.      |
| moderated   | The application is moderated by Clever Cloud.                                                                                                          |
| unpaid      | The application is stopped for a payment default.                                                                                                      |
| outdated    | A database on a version Clever Cloud no longer offers: "PostgreSQL 13; Clever Cloud offers 14 to 17".                                                  |
| update      | A Keycloak or Otoroshi operator with a newer release out. An operator installed as `latest` takes the latest release at each build, so it never shows. |

A failure or a deployment in progress ends with **its logs**, a link to the logs of that deployment. The name opens the resource, a failed application on its Activity tab.

The `is:watch` button of the card ("Only these in the list") filters the list on these entries; `is:watch` in the filter does the same. Past six entries, the card shows the first five and "Show the N others". With nothing to watch, the card does not show.

### Opened recently {#recents}

The applications of this organisation you opened in this browser, up to eight, the most recent first; the tooltip says when ("opened 2 hours ago"). They are kept in this browser only.

### Folding cards {#folding}

A click on the title of "To watch" or "Opened recently" folds the card to its title, which keeps the count; a second click unfolds it. The choice is remembered in this browser, for every organisation. The status card needs no folding: it is one line while all is well.

## The list beside a page {#list-column}

The application and add-on pages show the same list in a column, names only, with the same filter, grouping, order and folded groups, the filter and the grouping editable there too; `Alt+↑` and `Alt+↓` go to the previous or next application of the list. See [Application page](/guide/application) and [Command palette and shortcuts](/guide/palette#shortcuts).
